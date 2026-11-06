#!/usr/bin/env node
/**
 * TypeScript grammar differential: tsc is the ground truth for "is this file
 * syntactically valid TypeScript"; this repo's typescript/tsx grammars, built
 * to wasm (`tree-sitter build --wasm`), are checked against it over pinned
 * real-world corpora.
 *
 * Per file:
 *   oracle  ts.createSourceFile(...).parseDiagnostics  (syntax only, no type check)
 *   grammar tree.rootNode.hasError                     (.tsx -> tsx wasm, else typescript wasm)
 *   class   agree-ok | agree-err | DIVERGENT (tsc ok, tree-sitter err) | tsc-only-err
 *
 * Baseline (scripts/ts-differential.baseline.json): divergent: {corpus: {path: firstErrorRow}}.
 * An old-format array of paths is still read (row unknown) and rewritten by --update.
 *
 * Gate (exit 1):
 *   - a DIVERGENT file that is not in the baseline ("new");
 *   - PINNED corpora only: a baselined DIVERGENT file whose first error row moved
 *     EARLIER than the baselined row: a new error inside an already-divergent file
 *     ("corpus:path:row (was R)"). A later row is an improvement (reported, not a failure);
 *     an unknown baselined row accepts any row. The pinned code never changes, so a moved
 *     row means the grammar changed error recovery or the pin moved: re-baseline with --update.
 *     The `local` corpus is exempt (its rows shift whenever a fixture is edited; it is
 *     already strict per file, see below);
 *   - local corpus only: any tsc error in a fixture ("fixture is not valid TypeScript"),
 *     and a DIVERGENT fixture that is not a gap fixture (gap-*), even if baselined.
 * Setup failure (exit 2; each also appends "**Setup error:** <message>" to
 * GITHUB_STEP_SUMMARY): bad args, fetch failure, a corpus that scans 0 files, a
 * baselined path that is absent from this run ("vanished": renamed/deleted/wrong
 * root; never counted as now-agree), on a full run a baseline corpus that is not in
 * corpora.json (vanished corpus), a malformed baseline (a row must be a non-negative
 * integer, or the corpus an old-format array), version mismatch, a blind oracle
 * (ScriptKind.TS or TSX) or grammar, a missing wasm, or the relaunch guard set
 * without --liftoff-only.
 * now-agree counts only baselined paths that are now agree-ok; a baselined path that
 * is now agree-err / tsc-only-err is counted separately (now-err). All are reported
 * so the baseline can be re-generated; none but "vanished" fails the run.
 *
 * Usage:
 *   node scripts/ts-differential.mjs [--update] [--only <corpus>] [--json <path>]
 *
 *   --update       rewrite the baseline from this run (all corpora; not with --only).
 *                  Refuses (exit 1) if a local fixture is not valid TypeScript or a
 *                  non-gap fixture diverges.
 *   --only <name>  run one corpus (compared against its baseline entry only)
 *   --json <path>  write full per-file results
 *
 * The script re-execs itself once under `node --liftoff-only` (V8's optimizing wasm
 * compiler can run out of Zone memory on a grammar this size); the env var
 * TS_DIFF_RELAUNCHED guards against loops. If it is set but the flag is missing from
 * process.execArgv the run exits 2 instead of running unflagged.
 *
 * Needs the wasm first: `npx tree-sitter build --wasm -o tree-sitter-typescript.wasm typescript`
 * and the same for tsx (`npm run build:wasm`).
 *
 * Env: TS_DIFF_CACHE  corpus clone cache (default ~/.cache/tree-sitter-typescript-differential;
 *                      CI: $RUNNER_TEMP/ts-diff-cache)
 *      GITHUB_STEP_SUMMARY  when set, a markdown summary is appended to it
 *
 * Exit: 0 = ok, 1 = gate failure (above), 2 = setup failure (above).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const require = createRequire(import.meta.url);
const CORPORA_PATH = path.join(ROOT, 'scripts', 'ts-differential.corpora.json');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'ts-differential.baseline.json');
const WASM = {
  typescript: path.join(ROOT, 'tree-sitter-typescript.wasm'),
  tsx: path.join(ROOT, 'tree-sitter-tsx.wasm'),
};
const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const MARKER = '.ts-differential-complete';
const WASM_RUNTIME_FLAGS = ['--liftoff-only'];
const RELAUNCH_GUARD_ENV = 'TS_DIFF_RELAUNCHED';
const CANARY_BAD = 'let x: = ;';
const CANARY_GOOD = 'let x: number = 1;';
// JSX is only valid under ScriptKind.TSX (verified with tsc: bad -> diagnostics, good -> none).
const CANARY_TSX_BAD = 'const a = <div>;';
const CANARY_TSX_GOOD = 'const a = <div />;';

class SetupError extends Error {}

/** A fixture that is allowed to diverge: a recorded grammar gap. */
const isGapFixture = (p) => /^gap-/.test(path.basename(p));

/**
 * V8 flags are read at engine init, so --liftoff-only must be on node's command
 * line. Re-spawn once with it when this process lacks it. Returns an exit code, or
 * null when no relaunch was needed (or the guard says we already tried).
 */
function relaunchWithWasmFlags() {
  if (WASM_RUNTIME_FLAGS.every((f) => process.execArgv.includes(f))) return null;
  if (process.env[RELAUNCH_GUARD_ENV]) {
    // Fail closed: running unflagged risks the V8 Zone OOM (or, worse, a silent half-run).
    throw new SetupError(`${RELAUNCH_GUARD_ENV} is set but process.execArgv (${JSON.stringify(process.execArgv)}) lacks ${WASM_RUNTIME_FLAGS.join(' ')}: refusing to run unflagged (a stale ${RELAUNCH_GUARD_ENV} in the environment? unset it)`);
  }
  const r = spawnSync(process.execPath, [...WASM_RUNTIME_FLAGS, ...process.execArgv, SELF, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, [RELAUNCH_GUARD_ENV]: '1' },
  });
  if (r.error) {
    throw new SetupError(`cannot relaunch under ${WASM_RUNTIME_FLAGS.join(' ')}: ${r.error.message}`);
  }
  if (r.status === null) {
    throw new SetupError(`relaunched run was killed by ${r.signal}`);
  }
  return r.status;
}

function parseArgs(argv) {
  const o = { update: false, only: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') o.update = true;
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else throw new SetupError(`unknown argument: ${a}`);
  }
  if ((argv.includes('--only') && !o.only) || (argv.includes('--json') && !o.json)) {
    throw new SetupError('--only / --json need a value');
  }
  if (o.update && o.only) throw new SetupError('--update rewrites the whole baseline; do not combine with --only');
  return o;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
}

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  } catch (e) {
    process.stderr.write(`warning: could not write step summary: ${e.message}\n`);
  }
}

/** True when `dir` holds a finished checkout of exactly this corpus (sha + subdir). */
function markerMatches(dir, c) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
    return m.sha === c.sha && (m.subdir ?? '') === (c.subdir ?? '');
  } catch {
    return false;
  }
}

/** Fetch repo@sha into the cache (re-using an existing complete clone). Returns the checkout dir. */
function ensureCorpus(c, cacheRoot) {
  // The dir is keyed on name + sha + subdir: a sparse checkout of one subdir must never
  // be reused for another at the same sha.
  const subKey = c.subdir ? `-${crypto.createHash('sha1').update(c.subdir).digest('hex').slice(0, 8)}` : '';
  const dir = path.join(cacheRoot, `${c.name}-${c.sha.slice(0, 12)}${subKey}`);
  if (markerMatches(dir, c)) return dir;
  fs.mkdirSync(cacheRoot, { recursive: true });
  const tmp = `${dir}.partial-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  const url = `https://github.com/${c.repo}.git`;
  process.stderr.write(`[fetch] ${c.name}: ${c.repo}@${c.sha.slice(0, 12)}${c.subdir ? ` (sparse ${c.subdir}/)` : ''}\n`);
  try {
    git(tmp, ['init', '-q']);
    git(tmp, ['remote', 'add', 'origin', url]);
    if (c.subdir) {
      // blobless + sparse: pull only the subtree's blobs at checkout time
      git(tmp, ['sparse-checkout', 'set', '--cone', c.subdir]);
      git(tmp, ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', c.sha]);
    } else {
      git(tmp, ['fetch', '-q', '--depth', '1', 'origin', c.sha]);
    }
    git(tmp, ['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD']);
    const head = git(tmp, ['rev-parse', 'HEAD']).trim();
    if (head !== c.sha) throw new Error(`fetched ${head}, expected ${c.sha}`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const msg = e.stderr ? e.stderr.toString().trim() : e.message;
    throw new SetupError(`fetch of ${c.name} failed: ${msg}`);
  }
  fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({ sha: c.sha, subdir: c.subdir ?? '' }) + '\n');
  try {
    fs.renameSync(tmp, dir);
  } catch (e) {
    // A concurrent run may have finished the same checkout first.
    fs.rmSync(tmp, { recursive: true, force: true });
    if (markerMatches(dir, c)) return dir;
    throw new SetupError(`cannot move the fetched ${c.name} checkout into ${dir} (${e.code ?? e.message}) and it holds no complete matching checkout; remove that directory and retry`);
  }
  return dir;
}

/** All .ts/.tsx/.mts/.cts files (incl. .d.ts) under dir/rel, skipping node_modules, .git and symlinks. */
function listFiles(base, rel) {
  const out = [];
  const stack = [rel];
  while (stack.length) {
    const r = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(base, r), { withFileTypes: true });
    } catch (e) {
      throw new SetupError(`cannot read ${path.join(base, r)}: ${e.message}`);
    }
    for (const d of entries) {
      if (d.isSymbolicLink()) continue;
      const p = r ? `${r}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (d.name === 'node_modules' || d.name === '.git') continue;
        stack.push(p);
      } else if (d.isFile() && EXTS.has(path.extname(d.name))) {
        out.push(p);
      }
    }
  }
  return out.sort();
}

/** First ERROR or MISSING node in document order -> 0-based row, or null. */
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

/**
 * corpus -> Map(path -> first error row | null). A row must be a non-negative integer; the
 * old array-of-paths format is accepted (row unknown -> null). Anything else is a SetupError:
 * a malformed row must never silently become "unknown", which accepts any row.
 */
function baselineEntries(baseline, corpus) {
  const raw = baseline?.divergent?.[corpus];
  if (raw === undefined || raw === null) return new Map();
  if (Array.isArray(raw)) return new Map(raw.map((p) => [p, null]));
  if (typeof raw !== 'object') {
    throw new SetupError(`baseline divergent.${corpus} must be an object {path: row} or an old-format array of paths, got ${JSON.stringify(raw)}`);
  }
  return new Map(Object.entries(raw).map(([p, row]) => {
    if (!Number.isInteger(row) || row < 0) {
      throw new SetupError(`baseline divergent.${corpus}["${p}"] = ${JSON.stringify(row)}: a row must be a non-negative integer (corpus "${corpus}", ${path.relative(ROOT, BASELINE_PATH)}); re-baseline with --update`);
    }
    return [p, row];
  }));
}

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SetupError(`cannot read ${what} ${path.relative(ROOT, file)}: ${e.message}`);
  }
}

function tscDiagnostics(ts, name, text, kind) {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, kind);
  if (!Array.isArray(sf.parseDiagnostics)) {
    throw new SetupError(`tsc oracle blind: sf.parseDiagnostics is ${typeof sf.parseDiagnostics}, not an array (typescript ${ts.version} changed its internals?)`);
  }
  return sf.parseDiagnostics;
}

async function main() {
  const t0 = Date.now();
  const opts = parseArgs(process.argv.slice(2));

  let ts, tsVersion, wtsVersion, Parser, Language;
  try {
    ts = require('typescript');
    tsVersion = ts.version;
    wtsVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'web-tree-sitter', 'package.json'), 'utf8')).version;
    ({ Parser, Language } = await import('web-tree-sitter'));
  } catch (e) {
    throw new SetupError(`cannot load typescript / web-tree-sitter (run npm ci): ${e.message}`);
  }
  for (const w of Object.values(WASM)) {
    if (!fs.existsSync(w)) throw new SetupError(`missing grammar wasm: ${w} (run npm run build:wasm)`);
  }
  const wasmSha256 = { typescript: sha256(WASM.typescript), tsx: sha256(WASM.tsx) };

  // Fail closed: an oracle that stopped reporting errors would read every file as tsc-ok.
  if (!tscDiagnostics(ts, 'canary.ts', CANARY_BAD, ts.ScriptKind.TS).length) {
    throw new SetupError(`tsc oracle blind: "${CANARY_BAD}" produced no parse diagnostics`);
  }
  if (tscDiagnostics(ts, 'canary.ts', CANARY_GOOD, ts.ScriptKind.TS).length) {
    throw new SetupError(`tsc oracle blind: "${CANARY_GOOD}" produced parse diagnostics`);
  }
  if (!tscDiagnostics(ts, 'canary.tsx', CANARY_TSX_BAD, ts.ScriptKind.TSX).length) {
    throw new SetupError(`tsc oracle blind (TSX): "${CANARY_TSX_BAD}" produced no parse diagnostics`);
  }
  if (tscDiagnostics(ts, 'canary.tsx', CANARY_TSX_GOOD, ts.ScriptKind.TSX).length) {
    throw new SetupError(`tsc oracle blind (TSX): "${CANARY_TSX_GOOD}" produced parse diagnostics`);
  }

  const corpora = readJson(CORPORA_PATH, 'corpora file');
  const selected = opts.only ? corpora.filter((c) => c.name === opts.only) : corpora;
  if (!selected.length) throw new SetupError(`no corpus named "${opts.only}" (have: ${corpora.map((c) => c.name).join(', ')})`);

  let baseline = null;
  if (fs.existsSync(BASELINE_PATH)) {
    // --update rewrites the baseline, so a malformed one must not block it.
    try {
      baseline = readJson(BASELINE_PATH, 'baseline');
    } catch (e) {
      if (!opts.update) throw e;
      process.stderr.write(`warning: ignoring the unreadable baseline (--update rewrites it): ${e.message}\n`);
    }
  }
  if (!opts.update) {
    if (!baseline) throw new SetupError('no baseline; run with --update to create one');
    const bad = [];
    if (baseline.tsc !== tsVersion) bad.push(`tsc ${tsVersion} vs baseline ${baseline.tsc}`);
    if (baseline.webTreeSitter !== wtsVersion) bad.push(`web-tree-sitter ${wtsVersion} vs baseline ${baseline.webTreeSitter}`);
    if (bad.length) {
      process.stderr.write(`Version mismatch (${bad.join('; ')}).\nThe oracle or loader changed: re-baseline with "node scripts/ts-differential.mjs --update" and commit the result.\n`);
      appendSummary([
        '## TS grammar differential', '',
        `**Version mismatch** (${bad.join('; ')}).`, '',
        'The oracle or loader changed, so results are not comparable with the baseline. Re-baseline with `node scripts/ts-differential.mjs --update` and commit the result.',
      ]);
      return { exit: 2 };
    }
    // A full run covers every corpus, so a baselined corpus that is no longer in corpora.json
    // (renamed/removed) would otherwise be silently dropped. (--only compares one entry.)
    if (!opts.only) {
      const names = new Set(corpora.map((c) => c.name));
      const gone = Object.keys(baseline.divergent ?? {}).filter((k) => !names.has(k));
      if (gone.length) {
        throw new SetupError(`baseline corpus/corpora VANISHED from ${path.relative(ROOT, CORPORA_PATH)}: ${gone.join(', ')}. If the removal or rename is intended, re-baseline with "node scripts/ts-differential.mjs --update" and commit the result`);
      }
    }
  }

  await Parser.init();
  const langs = {
    typescript: await Language.load(WASM.typescript),
    tsx: await Language.load(WASM.tsx),
  };
  const parsers = { typescript: new Parser(), tsx: new Parser() };
  parsers.typescript.setLanguage(langs.typescript);
  parsers.tsx.setLanguage(langs.tsx);

  // Grammar canary: a known-bad snippet must error and a known-good one must not.
  for (const k of ['typescript', 'tsx']) {
    for (const [text, want] of [[CANARY_BAD, true], [CANARY_GOOD, false]]) {
      const t = parsers[k].parse(text);
      if (!t) throw new SetupError(`${k} grammar canary: no tree for "${text}"`);
      const got = t.rootNode.hasError;
      t.delete();
      if (got !== want) throw new SetupError(`${k} grammar canary: "${text}" gave hasError=${got}, expected ${want} (wrong or broken wasm?)`);
    }
  }

  const cacheRoot = process.env.TS_DIFF_CACHE || path.join(os.homedir(), '.cache', 'tree-sitter-typescript-differential');
  const dirs = new Map();
  for (const c of selected) {
    dirs.set(c.name, c.local ? ROOT : ensureCorpus(c, cacheRoot));
  }

  const results = {}; // corpus -> [{path, cls, tscErr, tsErr, row}]
  for (const c of selected) {
    const base = dirs.get(c.name);
    const rel = c.local ?? c.subdir ?? '';
    const files = listFiles(base, rel);
    process.stderr.write(`[scan] ${c.name}: ${files.length} files\n`);
    if (!files.length) throw new SetupError(`corpus "${c.name}" scanned 0 files under ${path.join(base, rel)}: wrong path or empty checkout`);
    const rows = [];
    for (const f of files) {
      const ext = path.extname(f);
      let text;
      try {
        text = fs.readFileSync(path.join(base, f), 'utf8');
      } catch (e) {
        throw new SetupError(`cannot read ${f}: ${e.message}`);
      }
      const isTsx = ext === '.tsx';
      const tscErr = tscDiagnostics(ts, f, text, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS).length > 0;
      const tree = parsers[isTsx ? 'tsx' : 'typescript'].parse(text);
      if (!tree) throw new SetupError(`tree-sitter returned no tree for ${f}`);
      const tsErr = tree.rootNode.hasError;
      const row = tsErr ? firstErrorRow(tree.rootNode) : null;
      tree.delete();
      const cls = tscErr ? (tsErr ? 'agree-err' : 'tsc-only-err') : tsErr ? 'DIVERGENT' : 'agree-ok';
      rows.push({ path: f, cls, tscErr, tsErr, row: row === null ? null : row + 1 });
    }
    results[c.name] = rows;
  }

  // Compare against the baseline.
  const report = [];
  const allNew = [];
  const allWorse = [];
  const allImproved = [];
  const allVanished = [];
  const invalidFixtures = []; // local corpus: tsc rejects the fixture
  const nonGapDivergent = []; // local corpus: a non-gap fixture diverges
  for (const c of selected) {
    const rows = results[c.name];
    const byPath = new Map(rows.map((r) => [r.path, r]));
    const count = (k) => rows.filter((r) => r.cls === k).length;
    const divergent = rows.filter((r) => r.cls === 'DIVERGENT');
    let known;
    try {
      known = baselineEntries(baseline, c.name);
    } catch (e) {
      if (!(e instanceof SetupError) || !opts.update) throw e;
      process.stderr.write(`warning: ignoring the malformed baseline entry (--update rewrites it): ${e.message}\n`);
      known = new Map();
    }
    const fresh = divergent.filter((r) => !known.has(r.path));
    let worse = 0;
    let improved = 0;
    let nowAgree = 0;
    let nowErr = 0;
    const vanished = [];
    for (const [p, was] of known) {
      const r = byPath.get(p);
      if (!r) vanished.push(p);
      else if (r.cls === 'agree-ok') nowAgree++;
      else if (r.cls === 'agree-err' || r.cls === 'tsc-only-err') nowErr++;
      // Row gate: pinned corpora only. `local` is strict per file already, and its rows
      // shift whenever a fixture is edited.
      else if (!c.local && was !== null && r.row !== null) {
        if (r.row < was) {
          worse++;
          allWorse.push({ corpus: c.name, path: p, row: r.row, was });
        } else if (r.row > was) {
          improved++;
          allImproved.push({ corpus: c.name, path: p, row: r.row, was });
        }
      }
    }
    for (const r of fresh) allNew.push({ corpus: c.name, ...r });
    for (const p of vanished) allVanished.push({ corpus: c.name, path: p });
    if (c.local) {
      for (const r of rows) {
        if (r.tscErr) invalidFixtures.push({ corpus: c.name, path: r.path, cls: r.cls });
        if (r.cls === 'DIVERGENT' && !isGapFixture(r.path)) nonGapDivergent.push({ corpus: c.name, path: r.path, row: r.row });
      }
    }
    report.push({
      corpus: c.name,
      files: rows.length,
      tsErr: count('agree-err') + count('DIVERGENT'),
      agreeOk: count('agree-ok'),
      agreeErr: count('agree-err'),
      divergent: divergent.length,
      newDiv: fresh.length,
      worse,
      improved,
      nowAgree,
      nowErr,
      vanished: vanished.length,
      tscOnlyErr: count('tsc-only-err'),
    });
  }

  // Table
  const cols = [
    ['corpus', 'corpus'], ['files', 'files'], ['agree-ok', 'agreeOk'], ['agree-err', 'agreeErr'],
    ['DIVERGENT', 'divergent'], ['new', 'newDiv'], ['worse', 'worse'], ['improved', 'improved'],
    ['now-agree', 'nowAgree'], ['now-err', 'nowErr'], ['vanished', 'vanished'],
    ['tsc-only-err', 'tscOnlyErr'], ['ts-err (tot)', 'tsErr'],
  ];
  const widths = cols.map(([h, k]) => Math.max(h.length, ...report.map((r) => String(r[k]).length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
  console.log(line(cols.map(([h]) => h)));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of report) console.log(line(cols.map(([, k]) => r[k])));
  console.log(`\ntsc ${tsVersion}  web-tree-sitter ${wtsVersion}`);
  if (baseline?.wasmSha256 && !opts.update) {
    for (const k of ['typescript', 'tsx']) {
      if (baseline.wasmSha256[k] !== wasmSha256[k]) {
        console.log(`note: ${k} wasm differs from the baseline's (${wasmSha256[k].slice(0, 12)} vs ${String(baseline.wasmSha256[k]).slice(0, 12)})`);
      }
    }
  }
  const sum = (k) => report.reduce((n, r) => n + r[k], 0);
  const totalNow = sum('nowAgree');
  const totalNowErr = sum('nowErr');
  if (totalNow) console.log(`${totalNow} baseline file(s) now agree with tsc: update the baseline (--update).`);
  if (totalNowErr) console.log(`${totalNowErr} baseline file(s) are now rejected by tsc too (now-err): update the baseline (--update).`);
  const listRows = (title, items, fmt) => {
    console.log(`\n${items.length} ${title}`);
    for (const r of items.slice(0, 50)) console.log(`  ${fmt(r)}`);
    if (items.length > 50) console.log(`  ... ${items.length - 50} more (use --json)`);
  };
  if (allImproved.length) {
    listRows('baselined divergent file(s) whose first error moved later (improved; --update to record):', allImproved, (r) => `${r.corpus}:${r.path}:${r.row} (was ${r.was})`);
  }
  if (!opts.update) {
    if (allNew.length) listRows('NEW divergence(s) (tsc ok, tree-sitter error):', allNew, (r) => `${r.corpus}:${r.path}:${r.row ?? '?'}`);
    if (allWorse.length) {
      listRows('NEW error(s) inside already-divergent files (first error moved earlier):', allWorse, (r) => `${r.corpus}:${r.path}:${r.row} (was ${r.was})`);
      console.log('If the grammar changed error recovery or the corpus pin moved, re-baseline with --update.');
    }
    if (allVanished.length) {
      listRows('baselined path(s) VANISHED from this run (renamed, deleted or wrong corpus root); they are not "now agree":', allVanished, (r) => `${r.corpus}:${r.path}`);
      console.log('Confirm the change is intended, then re-baseline: node scripts/ts-differential.mjs --update');
    }
  }
  if (invalidFixtures.length) {
    listRows('local fixture(s): fixture is not valid TypeScript (tsc reports a syntax error):', invalidFixtures, (r) => `${r.corpus}:${r.path} (${r.cls})`);
  }
  if (nonGapDivergent.length) {
    listRows('local non-gap fixture(s) DIVERGENT (only gap-* may diverge; this is a grammar regression or a misnamed gap):', nonGapDivergent, (r) => `${r.corpus}:${r.path}:${r.row ?? '?'}`);
  }

  if (opts.json) {
    fs.mkdirSync(path.dirname(path.resolve(opts.json)), { recursive: true });
    fs.writeFileSync(opts.json, JSON.stringify({
      tsc: tsVersion, webTreeSitter: wtsVersion, execArgv: process.execArgv, wasmSha256, report,
      worse: allWorse, improved: allImproved, vanished: allVanished, invalidFixtures, nonGapDivergent, results,
    }, null, 1) + '\n');
  }

  const md = [];
  md.push('## TS grammar differential', '');
  md.push(`tsc ${tsVersion}, web-tree-sitter ${wtsVersion}`, '');
  md.push('| corpus | files | divergent | new | worse | improved | now agree | now err | vanished | ts err | tsc-only err |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of report) md.push(`| ${r.corpus} | ${r.files} | ${r.divergent} | ${r.newDiv} | ${r.worse} | ${r.improved} | ${r.nowAgree} | ${r.nowErr} | ${r.vanished} | ${r.tsErr} | ${r.tscOnlyErr} |`);
  md.push('');
  if (totalNow || totalNowErr || allImproved.length) md.push('Baseline files improved or now agree. Update the baseline: `node scripts/ts-differential.mjs --update`.', '');
  if (allNew.length) {
    md.push(`### ${allNew.length} new divergence(s)`, '', 'tsc accepts these files; tree-sitter reports an error (first 20):', '');
    for (const r of allNew.slice(0, 20)) md.push(`- \`${r.corpus}:${r.path}:${r.row ?? '?'}\``);
    md.push('');
  }
  if (allWorse.length) {
    md.push(`### ${allWorse.length} new error(s) in already-divergent files`, '', 'The first error moved earlier than the baselined row (first 20). If the grammar changed error recovery or the corpus pin moved, re-baseline with `node scripts/ts-differential.mjs --update`:', '');
    for (const r of allWorse.slice(0, 20)) md.push(`- \`${r.corpus}:${r.path}:${r.row}\` (was ${r.was})`);
    md.push('');
  }
  if (allVanished.length) {
    md.push(`### ${allVanished.length} baselined path(s) vanished`, '', 'These are in the baseline but absent from this run (renamed, deleted or wrong corpus root). Confirm, then re-baseline with `node scripts/ts-differential.mjs --update` (first 20):', '');
    for (const r of allVanished.slice(0, 20)) md.push(`- \`${r.corpus}:${r.path}\``);
    md.push('');
  }
  if (invalidFixtures.length) md.push(`### Fixture is not valid TypeScript`, '', ...invalidFixtures.map((r) => `- \`${r.path}\``), '');
  if (nonGapDivergent.length) md.push(`### Non-gap fixture diverges`, '', ...nonGapDivergent.map((r) => `- \`${r.path}:${r.row ?? '?'}\``), '');
  if (!allNew.length && !allWorse.length && !allVanished.length && !invalidFixtures.length && !nonGapDivergent.length) md.push('No new divergences.', '');
  appendSummary(md);

  const localBad = invalidFixtures.length > 0 || nonGapDivergent.length > 0;

  if (opts.update) {
    if (localBad) {
      process.stderr.write('refusing to write the baseline: fix the local fixtures above (invalid TypeScript, or a non-gap fixture that diverges) first.\n');
      return { exit: 1 };
    }
    const divergent = {};
    for (const c of selected) {
      const entries = results[c.name].filter((r) => r.cls === 'DIVERGENT').sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      divergent[c.name] = Object.fromEntries(entries.map((r) => [r.path, r.row]));
    }
    const out = { tsc: tsVersion, webTreeSitter: wtsVersion, generatedAt: new Date().toISOString(), wasmSha256, divergent };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 1) + '\n');
    console.log(`\nbaseline written: ${path.relative(ROOT, BASELINE_PATH)}`);
    console.log(`wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { exit: 0 };
  }

  console.log(`\nwall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (allVanished.length) return { exit: 2 };
  return { exit: allNew.length || allWorse.length || localBad ? 1 : 0 };
}

/** Report a failure and exit 2. A SetupError also goes to the step summary (best-effort). */
function fatal(e) {
  if (e instanceof SetupError) {
    process.stderr.write(`setup error: ${e.message}\n`);
    appendSummary(['## TS grammar differential', '', `**Setup error:** ${e.message}`]);
  } else {
    process.stderr.write(`${e.stack ?? e}\n`);
  }
  process.exit(2);
}

let relaunched = null;
try {
  relaunched = relaunchWithWasmFlags();
} catch (e) {
  fatal(e);
}
if (relaunched !== null) {
  process.exit(relaunched);
} else {
  main().then(({ exit }) => process.exit(exit), fatal);
}
