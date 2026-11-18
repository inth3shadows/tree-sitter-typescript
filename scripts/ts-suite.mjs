#!/usr/bin/env node
/**
 * TypeScript's own test suite as a corpus for tree-accuracy.mjs --files.
 *
 * Fetches microsoft/TypeScript at a pinned tag (tests/cases/compiler and conformance only,
 * blobless and sparse), splits each test on its `// @filename:` directives into one file per
 * part (TypeScript extensions only; the extension picks the dialect), and writes two lists:
 *
 *   list.txt        every part
 *   list-clean.txt  parts of tests with no tests/baselines/reference/<test>[(…)].errors.txt:
 *                   tests that compile with no errors, so an ERROR here is a grammar bug,
 *                   not a test of tsc's error recovery
 *
 * tree-accuracy.mjs measures only the files tsc's parser accepts, so list.txt is the wider
 * net and list-clean.txt the one whose error files are bugs to file.
 *
 * Usage: node scripts/ts-suite.mjs [--out DIR]
 *   then: node --stack-size=60000 scripts/tree-accuracy.mjs --files DIR/list.txt --spans
 *   (deep-nesting stress tests overflow the tree walkers at the default stack size)
 *
 * Env: TS_DIFF_CACHE  clone cache, shared with ts-differential.mjs
 *                     (default ~/.cache/tree-sitter-typescript-differential)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TAG = 'v5.9.3';
const SHA = 'c63de15a992d37f0d6cec03ac7631872838602cb';
const CASES = ['tests/cases/compiler', 'tests/cases/conformance'];
const BASELINES = 'tests/baselines/reference';
const EXT = ['.ts', '.tsx', '.mts', '.cts'];
const MARKER = '.ts-suite-complete';
const FILENAME = /^\s*\/\/\s*@filename\s*:\s*(.+?)\s*$/i;

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
}

function fetchSuite(cacheRoot) {
  const dir = path.join(cacheRoot, `typescript-suite-${SHA.slice(0, 12)}`);
  if (fs.existsSync(path.join(dir, MARKER))) return dir;
  fs.mkdirSync(cacheRoot, { recursive: true });
  const tmp = `${dir}.partial-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  process.stderr.write(`[fetch] microsoft/TypeScript ${TAG} (${SHA.slice(0, 12)}), sparse ${CASES.join(', ')}\n`);
  try {
    git(tmp, ['init', '-q']);
    git(tmp, ['remote', 'add', 'origin', 'https://github.com/microsoft/TypeScript.git']);
    git(tmp, ['sparse-checkout', 'set', '--cone', ...CASES]);
    git(tmp, ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', SHA]);
    git(tmp, ['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD']);
    const head = git(tmp, ['rev-parse', 'HEAD']).trim();
    if (head !== SHA) throw new Error(`fetched ${head}, expected ${SHA}`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`fetch failed: ${e.stderr ? e.stderr.toString().trim() : e.message}`);
  }
  fs.writeFileSync(path.join(tmp, MARKER), SHA + '\n');
  fs.renameSync(tmp, dir);
  return dir;
}

/** Test names (basename without extension) that have an .errors.txt baseline, any variant. */
function testsWithErrors(repo) {
  // Trees are fetched even with blob:none, so the baseline names need no checkout.
  const names = git(repo, ['ls-tree', '-r', '--name-only', 'HEAD', '--', BASELINES]).split('\n');
  const out = new Set();
  for (const n of names) {
    const m = /^([^/(]+?)(?:\(.*\))?\.errors\.txt$/.exec(path.posix.basename(n));
    if (m) out.add(m[1]);
  }
  return out;
}

function* walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else if (d.isFile()) yield p;
  }
}

const hasExt = (name) => EXT.some((e) => name.toLowerCase().endsWith(e));

function main() {
  const argv = process.argv.slice(2);
  const cacheRoot = process.env.TS_DIFF_CACHE || path.join(os.homedir(), '.cache', 'tree-sitter-typescript-differential');
  let out = path.join(cacheRoot, `typescript-suite-${SHA.slice(0, 12)}-split`);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) out = path.resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]} (usage: ts-suite.mjs [--out DIR])`);
  }
  const repo = fetchSuite(cacheRoot);
  const errored = testsWithErrors(repo);
  fs.rmSync(path.join(out, 'cases'), { recursive: true, force: true });
  const all = [];
  const clean = [];
  let tests = 0;
  for (const c of CASES) {
    for (const file of walk(path.join(repo, c))) {
      if (!hasExt(file)) continue;
      tests++;
      // latin1 keeps the bytes as they are: some tests are UTF-16 or not valid UTF-8. A part
      // keeps its own line breaks (CRLF, CR or LF; some tests use each), so line-break
      // handling is measured too; only the break before the next directive is dropped.
      const text = fs.readFileSync(file, 'latin1');
      const tok = text.split(/(\r\n|\r|\n)/);
      const lines = tok.filter((_, i) => i % 2 === 0);
      const starts = [];
      lines.forEach((l, i) => { if (FILENAME.test(l)) starts.push(i); });
      const body = (from, to) => tok.slice(2 * from, 2 * to - 1).join('');
      const parts = starts.length === 0
        ? [[path.basename(file), text]]
        : starts.map((s, k) => [FILENAME.exec(lines[s])[1], body(s + 1, starts[k + 1] ?? lines.length)]);
      const rel = path.relative(path.join(repo, 'tests', 'cases'), file);
      const base = path.basename(file).replace(/\.[^.]+$/, '');
      parts.forEach(([name, body], j) => {
        name = name.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!hasExt(name)) return;
        const dst = path.join('cases', rel, `${String(j).padStart(2, '0')}_${name.replace(/[^A-Za-z0-9._-]/g, '_')}`);
        fs.mkdirSync(path.join(out, path.dirname(dst)), { recursive: true });
        fs.writeFileSync(path.join(out, dst), body, 'latin1');
        all.push(dst);
        if (!errored.has(base)) clean.push(dst);
      });
    }
  }
  fs.writeFileSync(path.join(out, 'list.txt'), all.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'list-clean.txt'), clean.join('\n') + '\n');
  console.log(`TypeScript ${TAG}: ${tests} tests, ${all.length} parts (${clean.length} from tests with no .errors.txt baseline)`);
  console.log(`  ${path.join(out, 'list.txt')}\n  ${path.join(out, 'list-clean.txt')}`);
}

try {
  main();
} catch (e) {
  console.error(`ts-suite: ${e.message}`);
  process.exit(2);
}
