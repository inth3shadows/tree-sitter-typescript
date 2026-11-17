#!/usr/bin/env node
/**
 * Tree accuracy against tsc: how often this grammar's expression and type nodes are the
 * nodes tsc builds, over the pinned differential corpora.
 *
 *   oracle  ts.createSourceFile (the TypeScript parser, no type check)
 *   unit    a node as (category, start, end): its kind mapped to a category both trees
 *           share, and its exact span (UTF-16 offsets on both sides)
 *   files   every corpus file tsc parses with no diagnostics
 *
 *   precision  matched / tree-sitter nodes   (how often a node we emit is one tsc has)
 *   recall     matched / tsc nodes           (how many of tsc's nodes we reproduce)
 *
 * A wrong nesting (`(a + b)!` for `a + (b!)`) costs both: the wrong node is unmatched and
 * tsc's node is missing. Convention differences the grammar cannot change (comma
 * expressions, `typeof` operands in types, JSX) are left out on both sides, and unions and
 * intersections count only the outermost node because tsc's are flat. What remains is a
 * constant floor, so the change between builds is the signal.
 *
 * Usage:
 *   node scripts/tree-accuracy.mjs [--build NAME=TS_WASM,TSX_WASM]... [--corpus NAME]...
 *                                  [--json FILE] [--show N]
 *   Default build: this checkout's tree-sitter-typescript.wasm / tree-sitter-tsx.wasm
 *   (run `npm run build:wasm` first). Corpora come from the differential's cache
 *   (TS_DIFF_CACHE or ~/.cache/tree-sitter-typescript-differential); run
 *   `npm run differential` once to fetch them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');
const {Parser, Language} = await import(require.resolve('web-tree-sitter'));

const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const K = ts.SyntaxKind;

// tsc kind -> category
const TSC = new Map([
  [K.BinaryExpression, 'binary'],
  [K.PrefixUnaryExpression, 'unary'], [K.PostfixUnaryExpression, 'unary'],
  [K.TypeOfExpression, 'unary'], [K.VoidExpression, 'unary'], [K.DeleteExpression, 'unary'],
  [K.AwaitExpression, 'await'],
  [K.NonNullExpression, 'non_null'],
  [K.PropertyAccessExpression, 'member'],
  [K.ElementAccessExpression, 'subscript'],
  [K.CallExpression, 'call'], [K.TaggedTemplateExpression, 'call'],
  [K.NewExpression, 'new'],
  [K.AsExpression, 'cast'], [K.SatisfiesExpression, 'cast'],
  [K.TypeAssertionExpression, 'type_assertion'],
  [K.ConditionalExpression, 'ternary'],
  [K.ExpressionWithTypeArguments, 'instantiation'],
  [K.ArrowFunction, 'arrow'],
  [K.ParenthesizedExpression, 'parenthesized'],
  [K.YieldExpression, 'yield'],
  [K.SpreadElement, 'spread'], [K.SpreadAssignment, 'spread'],
  [K.UnionType, 'union_type'], [K.IntersectionType, 'intersection_type'],
  [K.FunctionType, 'function_type'], [K.ConstructorType, 'constructor_type'],
  [K.ConditionalType, 'conditional_type'],
  [K.ArrayType, 'array_type'], [K.TupleType, 'tuple_type'],
  [K.TypeOperator, 'type_operator'],
  [K.TypePredicate, 'type_predicate'],
  [K.ParenthesizedType, 'parenthesized_type'],
]);
// tsc subtrees left out: type queries (`typeof a.b` is a QualifiedName there), JSX.
const TSC_SKIP = new Set([K.TypeQuery, K.JsxElement, K.JsxSelfClosingElement, K.JsxFragment]);

// tree-sitter type -> category
const TSN = new Map(Object.entries({
  binary_expression: 'binary', assignment_expression: 'binary', augmented_assignment_expression: 'binary',
  unary_expression: 'unary', update_expression: 'unary',
  await_expression: 'await',
  non_null_expression: 'non_null',
  member_expression: 'member',
  subscript_expression: 'subscript',
  call_expression: 'call',
  new_expression: 'new',
  as_expression: 'cast', satisfies_expression: 'cast',
  type_assertion: 'type_assertion',
  ternary_expression: 'ternary',
  instantiation_expression: 'instantiation',
  arrow_function: 'arrow',
  parenthesized_expression: 'parenthesized',
  yield_expression: 'yield',
  spread_element: 'spread',
  union_type: 'union_type', intersection_type: 'intersection_type',
  function_type: 'function_type', constructor_type: 'constructor_type',
  conditional_type: 'conditional_type',
  array_type: 'array_type', tuple_type: 'tuple_type',
  readonly_type: 'type_operator', index_type_query: 'type_operator',
  type_predicate: 'type_predicate', asserts: 'type_predicate',
  parenthesized_type: 'parenthesized_type',
}));
const TSN_SKIP = new Set(['type_query', 'jsx_element', 'jsx_self_closing_element', 'extends_type_clause', 'implements_clause']);
const COND_PARENTS = new Set(['if_statement', 'while_statement', 'do_statement', 'switch_statement', 'with_statement']);

function tscNodes(text, isTsx) {
  const sf = ts.createSourceFile('x' + (isTsx ? '.tsx' : '.ts'), text, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) return null;
  const out = new Set();
  const visit = (n) => {
    if (TSC_SKIP.has(n.kind)) return;
    // interface `extends` and class `implements` lists are types on our side
    if (n.kind === K.HeritageClause && (n.token === K.ImplementsKeyword || (n.parent && n.parent.kind === K.InterfaceDeclaration))) return;
    let cat = TSC.get(n.kind);
    // a comma expression is a sequence_expression on our side, nested the other way
    if (n.kind === K.BinaryExpression && n.operatorToken.kind === K.CommaToken) cat = undefined;
    // heritage clauses are not instantiation expressions on our side
    if (n.kind === K.ExpressionWithTypeArguments && n.parent && n.parent.kind === K.HeritageClause) cat = undefined;
    // `unique symbol` is a type operator in tsc and a single token here
    if (n.kind === K.TypeOperator && n.operator === K.UniqueKeyword) cat = undefined;
    // flat unions/intersections: count only the outermost
    if ((n.kind === K.UnionType || n.kind === K.IntersectionType) && n.parent && n.parent.kind === n.kind) cat = undefined;
    if (cat) out.add(`${cat}:${n.getStart(sf)}:${n.end}`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function tsNodes(tree) {
  const out = new Set();
  let errors = 0;
  const cursor = tree.walk();
  const visit = (n) => {
    if (n.type === 'ERROR' || n.isMissing) errors++;
    if (TSN_SKIP.has(n.type)) return;
    let cat = TSN.get(n.type);
    // statement conditions, `if (x)`, are parenthesized here and bare in tsc
    if (n.type === 'parenthesized_expression' && n.parent && COND_PARENTS.has(n.parent.type)) cat = undefined;
    if ((n.type === 'union_type' || n.type === 'intersection_type') && n.parent && n.parent.type === n.type) cat = undefined;
    // the inner part of a qualified name (`a.b` in `a.b.c.D`, `import x = a.b.c`) is the
    // JavaScript grammar's nested_identifier aliased to member_expression; tsc has a QualifiedName
    if (n.type === 'member_expression' && n.parent && n.parent.type === 'nested_identifier') cat = undefined;
    if (cat) out.add(`${cat}:${n.startIndex}:${n.endIndex}`);
    for (let i = 0; i < n.namedChildCount; i++) visit(n.namedChild(i));
  };
  visit(tree.rootNode);
  cursor.delete();
  return {out, errors};
}

function listFiles(base, rel) {
  const out = [];
  const stack = [rel];
  while (stack.length) {
    const r = stack.pop();
    for (const d of fs.readdirSync(path.join(base, r), {withFileTypes: true})) {
      if (d.isSymbolicLink()) continue;
      const p = r ? `${r}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (d.name !== 'node_modules' && d.name !== '.git') stack.push(p);
      } else if (d.isFile() && EXTS.has(path.extname(d.name))) out.push(p);
    }
  }
  return out.sort();
}

function corpusDir(c, cacheRoot) {
  if (c.local) return path.join(ROOT, c.local);
  const subKey = c.subdir ? `-${crypto.createHash('sha1').update(c.subdir).digest('hex').slice(0, 8)}` : '';
  const dir = path.join(cacheRoot, `${c.name}-${c.sha.slice(0, 12)}${subKey}`);
  if (!fs.existsSync(dir)) throw new Error(`corpus ${c.name} is not in ${cacheRoot}; run \`npm run differential\` once to fetch it`);
  return c.subdir ? path.join(dir, c.subdir) : dir;
}

function parseArgs(argv) {
  const a = {builds: [], corpora: [], json: null, show: 0, showCat: null};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      if (i + 1 >= argv.length) throw new Error(`${k} needs a value`); return argv[++i];
    };
    if (k === '--build') {
      const [name, pair] = v().split('=');
      const [tsW, tsxW] = (pair ?? '').split(',');
      if (!name || !tsW || !tsxW) throw new Error('--build takes NAME=TS_WASM,TSX_WASM');
      a.builds.push({name, ts: tsW, tsx: tsxW});
    } else if (k === '--corpus') a.corpora.push(v());
    else if (k === '--json') a.json = v();
    else if (k === '--show') a.show = Number(v());
    else if (k === '--show-category') a.showCat = v();
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.builds.length) a.builds.push({name: 'this', ts: path.join(ROOT, 'tree-sitter-typescript.wasm'), tsx: path.join(ROOT, 'tree-sitter-tsx.wasm')});
  return a;
}

const pct = (n, d) => (d ? (100 * n / d).toFixed(3) : '-');

/**
 *
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  await Parser.init();
  const builds = [];
  for (const b of args.builds) {
    const mk = async (w) => {
      const p = new Parser(); p.setLanguage(await Language.load(fs.readFileSync(w))); return p;
    };
    builds.push({...b, p: {ts: await mk(b.ts), tsx: await mk(b.tsx)}, cats: {}, files: 0, errFiles: 0, samples: []});
  }
  const cacheRoot = process.env.TS_DIFF_CACHE || path.join(os.homedir(), '.cache', 'tree-sitter-typescript-differential');
  let corpora = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'ts-differential.corpora.json'), 'utf8')).filter((c) => !c.local);
  if (args.corpora.length) corpora = corpora.filter((c) => args.corpora.includes(c.name));
  let files = 0;
  let skipped = 0;
  for (const c of corpora) {
    const base = corpusDir(c, cacheRoot);
    for (const f of listFiles(base, '')) {
      const text = fs.readFileSync(path.join(base, f), 'utf8');
      const isTsx = f.endsWith('.tsx');
      const want = tscNodes(text, isTsx);
      if (!want) {
        skipped++; continue;
      }
      files++;
      const sample = (b, sign, x) => {
        if (b.samples.length >= args.show) return;
        const [cat, st, en] = x.split(':');
        if (args.showCat && cat !== args.showCat) return;
        b.samples.push(`${sign} ${c.name}/${f} ${cat} ${JSON.stringify(text.slice(+st, Math.min(+en, +st + 90)))}`);
      };
      for (const b of builds) {
        const tree = b.p[isTsx ? 'tsx' : 'ts'].parse(text);
        const {out: got, errors} = tsNodes(tree);
        tree.delete();
        b.files++;
        if (errors) b.errFiles++;
        const bump = (cat, k) => {
          const s = (b.cats[cat] ??= {tp: 0, fp: 0, fn: 0}); s[k]++;
        };
        for (const x of got) {
          const cat = x.slice(0, x.indexOf(':'));
          if (want.has(x)) bump(cat, 'tp');
          else {
            bump(cat, 'fp'); sample(b, '+', x);
          }
        }
        for (const x of want) {
          if (!got.has(x)) {
            bump(x.slice(0, x.indexOf(':')), 'fn'); sample(b, '-', x);
          }
        }
      }
    }
  }
  const report = {tsc: ts.version, corpora: corpora.map((c) => `${c.name}@${c.sha.slice(0, 12)}`), files, skippedTscErrors: skipped, builds: []};
  for (const b of builds) {
    const t = {tp: 0, fp: 0, fn: 0};
    for (const s of Object.values(b.cats)) {
      t.tp += s.tp; t.fp += s.fp; t.fn += s.fn;
    }
    report.builds.push({name: b.name, files: b.files, filesWithErrors: b.errFiles, total: t, precision: t.tp / (t.tp + t.fp), recall: t.tp / (t.tp + t.fn), categories: b.cats});
  }
  console.log(`tree accuracy vs tsc ${ts.version}: ${files} files tsc parses cleanly (${skipped} skipped) in ${report.corpora.join(', ')}`);
  console.log(['build'.padEnd(28), 'precision%'.padStart(11), 'recall%'.padStart(9), 'wrong'.padStart(8), 'missed'.padStart(8), 'err files'.padStart(10)].join(' '));
  for (const r of report.builds) {
    console.log([r.name.padEnd(28), pct(r.total.tp, r.total.tp + r.total.fp).padStart(11), pct(r.total.tp, r.total.tp + r.total.fn).padStart(9), String(r.total.fp).padStart(8), String(r.total.fn).padStart(8), String(r.filesWithErrors).padStart(10)].join(' '));
  }
  for (const b of builds) for (const s of b.samples) console.log(`${b.name} ${s}`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1) + '\n');
}

main().catch((e) => {
  console.error(`tree-accuracy: ${e.message}`); process.exit(2);
});
