#!/usr/bin/env node
/**
 * Upstream issue triage: which upstream issues are parse errors that this fork still has?
 *
 * Mechanical, no judgment: fetch the upstream issues with `gh`, pull out every fenced code
 * block that looks like TypeScript/JavaScript source, and run each through the same oracle
 * as scripts/ts-differential.mjs (tsc parseDiagnostics vs tree-sitter rootNode.hasError).
 *
 * Per snippet:
 *   DIVERGENT  tsc ok, tree-sitter error   -> a live gap in this fork (actionable)
 *   agree-ok   both parse                  -> fixed here, or the issue is not a parse error
 *                                             (wrong tree shape, queries, bindings, perf)
 *   tsc-err    tsc rejects the snippet     -> a fragment, pseudo-code, or invalid on purpose
 *   TIMEOUT    tree-sitter took > 5s       -> a parser hang (actionable)
 * An issue takes its worst snippet's verdict (TIMEOUT > DIVERGENT > agree-ok > tsc-err);
 * "no-code" if it has no usable block. Only TIMEOUT and DIVERGENT are printed by default.
 *
 * Blind spot: hasError only. An issue about a wrong-but-error-free tree (a node typed as
 * the wrong kind) reads agree-ok; so does any issue whose snippet is prose or a query.
 *
 * Usage:
 *   node --liftoff-only scripts/upstream-triage.mjs [--repo owner/name] [--state open|closed|all]
 *        [--issue N] [--wasm-dir DIR] [--all] [--json PATH]
 *
 *   --repo      default tree-sitter/tree-sitter-typescript
 *   --wasm-dir  directory holding tree-sitter-{typescript,tsx}.wasm (default: repo root;
 *               point it at another build to compare, e.g. upstream's)
 *   --all       print every issue, not just DIVERGENT ones
 *
 * Needs `npm run build:wasm` first, and `gh` authenticated.
 * Exit: 0 = ran (divergences are a report, not a failure), 2 = setup failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A snippet is a few lines; a parse this slow is itself a bug (reported as TIMEOUT).
const PARSE_TIMEOUT_MS = 5000;
const ACTIONABLE = new Set(['DIVERGENT', 'TIMEOUT']);

// Fence info strings we treat as source; '' (untagged) is filtered by looksLikeSource.
const SOURCE_LANGS = new Map([
  ['', 'ts'], ['ts', 'ts'], ['typescript', 'ts'], ['mts', 'ts'], ['cts', 'ts'],
  ['js', 'ts'], ['javascript', 'ts'], ['tsx', 'tsx'], ['jsx', 'tsx'], ['typescriptreact', 'tsx'],
]);

function die(msg) {
  process.stderr.write(`setup error: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { repo: 'tree-sitter/tree-sitter-typescript', state: 'open', wasmDir: ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i] ?? die(`${a} needs a value`);
    if (a === '--repo') o.repo = val();
    else if (a === '--state') o.state = val();
    else if (a === '--issue') o.issue = Number(val());
    else if (a === '--wasm-dir') o.wasmDir = path.resolve(val());
    else if (a === '--json') o.json = val();
    else if (a === '--all') o.all = true;
    else die(`unknown argument ${a}`);
  }
  if (!['open', 'closed', 'all'].includes(o.state)) die(`--state must be open|closed|all`);
  if (o.issue !== undefined && !Number.isInteger(o.issue)) die('--issue needs a number');
  return o;
}

function fetchIssues(o) {
  const args = o.issue
    ? ['api', `repos/${o.repo}/issues/${o.issue}`]
    : ['api', '--paginate', `repos/${o.repo}/issues?state=${o.state}&per_page=100`];
  let out;
  try {
    out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch (e) {
    die(`gh ${args.join(' ')}: ${e.message}`);
  }
  // --paginate concatenates JSON arrays ("][") rather than merging them.
  const items = o.issue ? [JSON.parse(out)] : JSON.parse(`[${out.trim().replace(/\]\s*\[/g, '],[')}]`).flat();
  return items.filter((it) => !it.pull_request);
}

/** An untagged block is source unless it reads like a tree dump, a query, or a shell/log line. */
function looksLikeSource(code) {
  const t = code.trim();
  if (!t) return false;
  if (/^\(\w+/.test(t)) return false; // S-expression tree or query
  if (/^(\$ |npm |npx |tree-sitter |error|warning|thread |at )/im.test(t.split('\n')[0])) return false;
  return true;
}

function snippets(body) {
  const out = [];
  const re = /^[ \t]*(```+|~~~+)[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm;
  for (let m; (m = re.exec(body ?? '')); ) {
    const lang = m[2].toLowerCase();
    const kind = SOURCE_LANGS.get(lang);
    if (!kind) continue;
    const code = m[3];
    if (lang === '' && !looksLikeSource(code)) continue;
    out.push({ lang, kind, code });
  }
  return out;
}

function firstErrorRow(node) {
  if (node.type === 'ERROR' || node.isMissing) return node.startPosition.row;
  for (let i = 0; i < node.childCount; i++) {
    const ch = node.child(i);
    if (ch && ch.hasError) {
      const r = firstErrorRow(ch);
      if (r !== null) return r;
    }
  }
  return null;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!process.execArgv.includes('--liftoff-only')) {
    die('run under `node --liftoff-only` (V8 can run out of Zone memory compiling this wasm); `npm run triage` does');
  }
  const wasm = {
    ts: path.join(o.wasmDir, 'tree-sitter-typescript.wasm'),
    tsx: path.join(o.wasmDir, 'tree-sitter-tsx.wasm'),
  };
  for (const f of Object.values(wasm)) if (!fs.existsSync(f)) die(`missing ${f} (npm run build:wasm)`);

  const ts = (await import('typescript')).default;
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init();
  const parsers = {};
  for (const [k, f] of Object.entries(wasm)) {
    parsers[k] = new Parser();
    parsers[k].setLanguage(await Language.load(f));
  }
  // Canary: the grammar must reject garbage and accept a trivial file, or every verdict lies.
  for (const [k, p] of Object.entries(parsers)) {
    if (!p.parse('let x: = ;').rootNode.hasError || p.parse('let x: number = 1;').rootNode.hasError) {
      die(`${k} grammar canary failed (wrong or broken wasm?)`);
    }
  }

  const results = [];
  for (const issue of fetchIssues(o)) {
    const snips = snippets(issue.body).map((s) => {
      const kind = s.kind === 'tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(`snippet.${s.kind}`, s.code, ts.ScriptTarget.Latest, false, kind);
      if (!Array.isArray(sf.parseDiagnostics)) die(`tsc oracle blind (typescript ${ts.version})`);
      const deadline = Date.now() + PARSE_TIMEOUT_MS;
      const tree = parsers[s.kind].parse(s.code, null, { progressCallback: () => Date.now() > deadline });
      if (!tree) return { ...s, verdict: 'TIMEOUT', row: null };
      const tsErr = tree.rootNode.hasError;
      const row = tsErr ? firstErrorRow(tree.rootNode) : null;
      tree.delete();
      const verdict = sf.parseDiagnostics.length ? 'tsc-err' : tsErr ? 'DIVERGENT' : 'agree-ok';
      return { ...s, verdict, row };
    });
    const verdict = !snips.length ? 'no-code'
      : snips.some((s) => s.verdict === 'TIMEOUT') ? 'TIMEOUT'
        : snips.some((s) => s.verdict === 'DIVERGENT') ? 'DIVERGENT'
        : snips.some((s) => s.verdict === 'agree-ok') ? 'agree-ok' : 'tsc-err';
    results.push({ number: issue.number, title: issue.title, state: issue.state, url: issue.html_url, verdict, snippets: snips });
  }

  const counts = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  for (const r of results) {
    if (!o.all && !ACTIONABLE.has(r.verdict)) continue;
    const d = r.snippets.filter((s) => ACTIONABLE.has(s.verdict));
    const where = d.length ? ` ${d.length}/${r.snippets.length}${d[0].row === null ? '' : ` line ${d[0].row + 1}`}` : '';
    console.log(`#${r.number}\t${r.verdict}${where}\t${r.title}`);
  }
  console.log(`\n${results.length} issues (${o.repo}, ${o.issue ? `#${o.issue}` : o.state}): ` +
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') + `  [tsc ${ts.version}, wasm ${path.relative(ROOT, o.wasmDir) || '.'}]`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(results, null, 2) + '\n');
}

main().catch((e) => die(e.stack ?? String(e)));
