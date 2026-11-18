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
const OUT_MARKER = '.ts-suite-out';
const BOM = '\u00ef\u00bb\u00bf'; // a UTF-8 byte-order mark, read as latin1
const FILENAME = /^\s*\/\/\s*@filename\s*:\s*(.+?)\s*$/i;

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
}

const markerText = () => JSON.stringify({ sha: SHA, cases: CASES }) + '\n';
const markerMatches = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, MARKER), 'utf8') === markerText();
  } catch {
    return false;
  }
};

function fetchSuite(cacheRoot) {
  const dir = path.join(cacheRoot, `typescript-suite-${SHA.slice(0, 12)}`);
  // The marker names the sha and the sparse dirs, so a checkout of other dirs is refetched.
  if (markerMatches(dir)) return dir;
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
  fs.writeFileSync(path.join(tmp, MARKER), markerText());
  try {
    fs.renameSync(tmp, dir);
  } catch (e) {
    // A concurrent run may have finished the same checkout first.
    fs.rmSync(tmp, { recursive: true, force: true });
    if (markerMatches(dir)) return dir;
    throw new Error(`cannot move the fetched checkout into ${dir} (${e.code ?? e.message}); remove that directory and retry`);
  }
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

// Case-sensitive, as tree-accuracy.mjs checks extensions.
const hasExt = (name) => EXT.some((e) => name.endsWith(e));

function main() {
  const argv = process.argv.slice(2);
  const cacheRoot = process.env.TS_DIFF_CACHE || path.join(os.homedir(), '.cache', 'tree-sitter-typescript-differential');
  let out = path.join(cacheRoot, `typescript-suite-${SHA.slice(0, 12)}-split`);
  let ownOut = true; // the default is this script's own cache dir
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('-')) throw new Error('--out needs a directory');
      out = path.resolve(v);
      ownOut = false;
    } else {
      throw new Error(`unknown argument: ${argv[i]} (usage: ts-suite.mjs [--out DIR])`);
    }
  }
  // Only a directory this script made (or an empty or new one) is cleared.
  if (!ownOut && fs.existsSync(out) && fs.readdirSync(out).length > 0 && !fs.existsSync(path.join(out, OUT_MARKER))) {
    throw new Error(`${out} is not empty and was not made by ts-suite.mjs; pass an empty or new --out`);
  }
  const repo = fetchSuite(cacheRoot);
  const errored = testsWithErrors(repo);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, OUT_MARKER), '');
  // The lists go first, so an interrupted run leaves no list naming deleted parts.
  for (const l of ['list.txt', 'list-clean.txt']) fs.rmSync(path.join(out, l), { force: true });
  fs.rmSync(path.join(out, 'cases'), { recursive: true, force: true });
  const all = [];
  const clean = [];
  let tests = 0;
  for (const c of CASES) {
    for (const file of walk(path.join(repo, c))) {
      if (!hasExt(file)) continue;
      tests++;
      // latin1 keeps the bytes as they are (a file that is not valid UTF-8 is written back
      // unchanged; UTF-16 tests are then skipped by tree-accuracy, which reads UTF-8).
      const text = fs.readFileSync(file, 'latin1');
      // Lines as tsc's harness splits them (splitContentByNewlines): at CRLF if the file has
      // one, else LF, else CR. The parts match tsc's units at v5.9.3 but for one test, whose
      // directive tsc finds after an LF inside a CRLF line. Unlike tsc, a part keeps the other
      // `// @option` lines, which in a mixed-break file can hold code.
      const sep = text.includes('\r\n') ? '\r\n' : text.includes('\n') ? '\n' : '\r';
      const lines = text.split(sep);
      // The harness reads the file without its BOM, so a directive may start line 1.
      const directive = (l, i) => FILENAME.exec(i === 0 && l.startsWith(BOM) ? l.slice(BOM.length) : l);
      const starts = [];
      lines.forEach((l, i) => { if (directive(l, i)) starts.push(i); });
      const parts = starts.length === 0
        ? [[path.basename(file), text]]
        : starts.map((s, k) => [directive(lines[s], s)[1], lines.slice(s + 1, starts[k + 1]).join(sep)]);
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
