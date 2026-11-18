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
 *                                  [--files LIST] [--spans] [--show-span KINDS] [--json FILE] [--show N]
 *   --files LIST  measure the files named in LIST (one path per line, deduplicated by
 *                 content) instead of the corpora
 *   --spans       also compare every node's span, whatever its kind (tsc nodes vs this
 *                 grammar's named nodes), and list the node kinds whose spans most often
 *                 have no match: a triage aid for wrong trees the categories do not see
 *   --show-span KINDS  with --show N: list up to N unmatched spans of each node kind in the
 *                 comma-separated KINDS (tree-sitter or tsc kind names), one per file
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
  [K.ImportType, 'import_type'],
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
  import_type: 'import_type',
  type_predicate: 'type_predicate', asserts: 'type_predicate',
  parenthesized_type: 'parenthesized_type',
}));
const TSN_SKIP = new Set(['type_query', 'jsx_element', 'jsx_self_closing_element', 'extends_type_clause', 'implements_clause']);
const COND_PARENTS = new Set(['if_statement', 'while_statement', 'do_statement', 'switch_statement', 'with_statement']);

function tscNodes(text, isTsx) {
  const sf = ts.createSourceFile('x' + (isTsx ? '.tsx' : '.ts'), text, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) return null;
  const out = new Set();
  out.sf = sf;
  const visit = (n) => {
    if (TSC_SKIP.has(n.kind)) return;
    // `typeof import('m')` is an ImportType in tsc and a type_query (left out) here
    if (n.kind === K.ImportType && n.isTypeOf) return;
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
    // (`a.b.c.d.E` nests a member_expression inside it once per extra part)
    if (n.type === 'member_expression') {
      let q = n.parent;
      while (q && q.type === 'member_expression') q = q.parent;
      if (q && q.type === 'nested_identifier') cat = undefined;
    }
    // `asserts x is T` is one TypePredicate in tsc; here `asserts` (counted above) wraps a type_predicate
    if (n.type === 'type_predicate' && n.parent && n.parent.type === 'asserts') cat = undefined;
    if (cat) out.add(`${cat}:${n.startIndex}:${n.endIndex}`);
    for (let i = 0; i < n.namedChildCount; i++) visit(n.namedChild(i));
  };
  visit(tree.rootNode);
  cursor.delete();
  return {out, errors};
}

// Span-only comparison: every tsc node and every named tree-sitter node, kind ignored.
// Leaves (tokens, names, literals) are left out on both sides, and so are list wrappers that
// only one side has: tree-sitter's argument, parameter and body containers, tsc's
// declaration lists and template spans.
const TSC_SPAN_SKIP = new Set([K.SourceFile, K.EndOfFileToken, K.VariableDeclarationList, K.TemplateSpan, K.HeritageClause, K.ThisType,
  K.JsxAttributes, K.TemplateLiteralTypeSpan, K.MetaProperty,
  // `import x = require('m')`: tsc's reference is `require('m')`, the clause here is `x = require('m')`
  K.ExternalModuleReference]);
const TSN_SPAN_SKIP = new Set(['program', 'comment', 'html_comment', 'ERROR',
  'arguments', 'formal_parameters', 'type_arguments', 'type_parameters', 'type_annotation',
  'template_substitution', 'class_body', 'interface_body', 'enum_body', 'else_clause',
  'extends_clause', 'implements_clause', 'class_heritage', 'extends_type_clause',
  'constraint', 'default_type', 'string', 'regex', 'literal_type', 'finally_clause',
  'type_predicate_annotation', 'template_type', 'opting_type_annotation', 'adding_type_annotation',
  'omitting_type_annotation', 'asserts_annotation',
  // `[K in keyof A as N]`: here the clause spans `as N`, tsc's TypeParameter stops before it
  'mapped_type_clause', 'import_require_clause']);
// a trailing `;` or `,` belongs to a member in tsc and not here; drop it on both sides, with
// the whitespace and block comments before it (`a: T /* c */;` ends after `T` here)
const spanKey = (text, st, en) => {
  while (en > st && (text[en - 1] === ';' || text[en - 1] === ',')) {
    en--;
    for (;;) {
      while (en > st && /\s/.test(text[en - 1])) en--;
      if (en - 2 <= st || text[en - 1] !== '/' || text[en - 2] !== '*') break;
      const open = text.lastIndexOf('/*', en - 3);
      if (open < st) break;
      en = open;
    }
  }
  return `${st}:${en}`;
};
const METHODISH = new Set([K.MethodDeclaration, K.GetAccessor, K.SetAccessor, K.Constructor]);
function tscSpans(sf) {
  const out = new Map();
  const text = sf.text;
  const visit = (n) => {
    // a bare type name is a TypeReference (or ExpressionWithTypeArguments) around a name in tsc
    // a bare type name is a TypeReference around a name in tsc, and a class's `extends A<T>`
    // has no node for `A<T>` here
    const p = n.parent;
    const bareRef = n.kind === K.TypeReference && !n.typeArguments || n.kind === K.ExpressionWithTypeArguments && p?.kind === K.HeritageClause;
    // a node that is only a wrapper around one name (`{a}`, `for (const a of b)`), or has no
    // child node (`{}`, `break`), is a leaf here; flat unions count once, as above
    const kids = [];
    ts.forEachChild(n, (c) => {
      kids.push(c);
    });
    // a bodiless `constructor()` and an empty `class {}` have no child node in tsc but a
    // name or a class_body here
    // (a wrapper around one childless node is a leaf, as below for tree-sitter: `yield;`)
    const leafish = kids.length === 0 && n.kind !== K.Constructor && n.kind !== K.ClassExpression ||
      (kids.length === 1 && ts.forEachChild(kids[0], () => true) === undefined &&
      spanKey(text, kids[0].getStart(sf), kids[0].end) === spanKey(text, n.getStart(sf), n.end));
    const innerFlat = (n.kind === K.UnionType || n.kind === K.IntersectionType) && n.parent && n.parent.kind === n.kind ||
      // `unique symbol` is one token here; `import type {a}` starts its clause after `type` here
      n.kind === K.TypeOperator && n.operator === K.UniqueKeyword || n.kind === K.ImportClause && n.isTypeOnly ||
      // nodes with no wrapper here: `[x: string]`, `catch (e: any)`, a mapped type's `K in A`
      n.kind === K.Parameter && p?.kind === K.IndexSignature || n.kind === K.VariableDeclaration && p?.kind === K.CatchClause ||
      n.kind === K.TypeParameter && (p?.kind === K.MappedType || p?.kind === K.InferType) ||
      // `a, b, c` is one flat sequence_expression here; `namespace a.b {}` is one internal_module
      n.kind === K.BinaryExpression && n.operatorToken.kind === K.CommaToken && p?.kind === K.BinaryExpression && p.operatorToken.kind === K.CommaToken ||
      n.kind === K.ModuleDeclaration && p?.kind === K.ModuleDeclaration;
    // `for (let i = 0; ...)` has no VariableStatement; its list is the lexical_declaration here
    const forInit = n.kind === K.VariableDeclarationList && p?.kind === K.ForStatement;
    if ((!TSC_SPAN_SKIP.has(n.kind) || forInit) && !ts.isJSDoc(n) && n.kind > K.LastToken && !bareRef && !leafish && !innerFlat) {
      // an exported declaration starts at `export` in tsc, as export_statement does here
      let st = n.getStart(sf);
      // a class method's decorators are its siblings here, so its span starts after them
      if (METHODISH.has(n.kind) && ts.isClassLike(p)) {
        const decs = ts.getDecorators(n);
        if (decs?.length) st = ts.skipTrivia(text, decs[decs.length - 1].end);
      }
      const k = spanKey(text, st, n.end);
      if (!out.has(k)) out.set(k, K[n.kind]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
// A same-line comment after a statement or `}` is inside that node here, as in
// tree-sitter-javascript; tsc never puts trivia in a node. A node's span ends at its last
// non-comment child. The exception: a class method's body keeps it, because there the
// comment belongs to class_body in tree-sitter-javascript and that difference is a bug here.
function contentEnd(n, memo) {
  let e = memo.get(n.id);
  if (e !== undefined) return e;
  e = n.endIndex;
  if (!(n.type === 'statement_block' && n.parent?.type === 'method_definition')) {
    for (let i = n.childCount - 1; i >= 0; i--) {
      const c = n.child(i);
      if (c.type !== 'comment' && c.type !== 'html_comment') {
        e = contentEnd(c, memo); break;
      }
    }
  }
  memo.set(n.id, e);
  return e;
}
function tsSpans(tree, text) {
  const out = new Map();
  const memo = new Map();
  const visit = (n) => {
    const p = n.parent;
    const kids = n.namedChildren.filter((c) => c.type !== 'comment' && c.type !== 'html_comment');
    const skip = TSN_SPAN_SKIP.has(n.type) || kids.length === 0 ||
      // a rest parameter is one Parameter in tsc, with its annotation
      (n.type === 'rest_pattern' && p && (p.type === 'required_parameter' || p.type === 'optional_parameter')) ||
      (p && p.type === 'ambient_declaration' && n.type !== 'statement_block' && p.namedChild(0)?.id === n.id) ||
      // the declaration inside export_statement: tsc's declaration spans the export
      (p && p.type === 'export_statement' && p.childForFieldName('declaration')?.id === n.id) ||
      (n.type === 'parenthesized_expression' && p && COND_PARENTS.has(p.type)) ||
      (n.type === 'template_string' && !n.namedChildren.some((c) => c.type === 'template_substitution')) ||
      ((n.type === 'union_type' || n.type === 'intersection_type') && p && p.type === n.type) ||
      (n.type === 'literal_type' && n.namedChild(0)?.type === 'undefined') ||
      // a mapped type is an index_signature in an object_type here and one MappedType in tsc
      (n.type === 'index_signature' && n.namedChildren.some((c) => c.type === 'mapped_type_clause')) ||
      // a directive (`"use client"`) is a leaf in tsc
      (n.type === 'expression_statement' && kids.length === 1 && kids[0].type === 'string') ||
      // `typeof import("a")` is one ImportType in tsc; `implements A<T>` and an interface's
      // `extends A<T>` are heritage entries; `{...props}` is one JsxSpreadAttribute
      (n.type === 'import_type' && p?.type === 'type_query') ||
      (n.type === 'generic_type' && (p?.type === 'implements_clause' || p?.type === 'extends_type_clause')) ||
      (n.type === 'spread_element' && p?.type === 'jsx_expression') ||
      // `export default function () {}` is one FunctionDeclaration in tsc, spanning the export
      ((n.type === 'function_expression' || n.type === 'class') && p?.type === 'export_statement' && p.childForFieldName('value')?.id === n.id) ||
      (n.type === 'type_predicate' && p?.type === 'asserts') ||
      // `typeof f<T>` is one TypeQuery; `{a: b = 1}` is one BindingElement; `with {type: "json"}`
      // is one ImportAttributes; `\`a\`` is a literal
      (n.type === 'instantiation_expression' && p?.type === 'type_query') ||
      (n.type === 'assignment_pattern' && p?.type === 'pair_pattern') ||
      (n.type === 'object' && p?.type === 'import_attribute') ||
      (n.type === 'template_literal_type' && !n.namedChildren.some((c) => c.type === 'template_type')) ||
      (n.type === 'nested_identifier' && (p?.type === 'internal_module' || p?.type === 'module')) ||
      (n.namedChildCount === 1 && n.namedChild(0).namedChildCount === 0 &&
        spanKey(text, n.namedChild(0).startIndex, n.namedChild(0).endIndex) === spanKey(text, n.startIndex, n.endIndex));
    if (!skip) {
      const k = spanKey(text, n.startIndex, contentEnd(n, memo));
      if (!out.has(k)) out.set(k, n.type);
    }
    for (let i = 0; i < n.namedChildCount; i++) visit(n.namedChild(i));
  };
  visit(tree.rootNode);
  return out;
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
  const a = {builds: [], corpora: [], json: null, show: 0, showCat: null, files: null, spans: false};
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
    else if (k === '--files') a.files = v();
    else if (k === '--spans') a.spans = true;
    else if (k === '--show-span') {
      a.showSpan = new Set(v().split(',')); a.spans = true;
    } else throw new Error(`unknown argument ${k}`);
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
    builds.push({...b, p: {ts: await mk(b.ts), tsx: await mk(b.tsx)}, cats: {}, files: 0, errFiles: 0, samples: [], spanShown: {},
      span: {tp: 0, fp: 0, fn: 0, fpKinds: {}, fnKinds: {}}});
  }
  const cacheRoot = process.env.TS_DIFF_CACHE || path.join(os.homedir(), '.cache', 'tree-sitter-typescript-differential');
  let corpora = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'ts-differential.corpora.json'), 'utf8')).filter((c) => !c.local);
  if (args.corpora.length) corpora = corpora.filter((c) => args.corpora.includes(c.name));
  let files = 0;
  let skipped = 0;
  const sources = [];
  if (args.files) {
    const seen = new Set();
    const list = fs.readFileSync(args.files, 'utf8').split('\n').filter((l) => l && EXTS.has(path.extname(l)));
    const group = {name: 'files', files: []};
    for (const f of list) {
      let text;
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (text.length > 2_000_000) continue;
      const h = crypto.createHash('sha1').update(text).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h); group.files.push(f);
    }
    sources.push({name: 'files', base: '', files: group.files});
    corpora = [{name: `files:${path.basename(args.files)}`, sha: `${group.files.length}-unique`}];
  } else {
    for (const c of corpora) {
      const base = corpusDir(c, cacheRoot);
      sources.push({name: c.name, base, files: listFiles(base, '')});
    }
  }
  for (const c of sources) {
    const base = c.base;
    for (const f of c.files) {
      const text = fs.readFileSync(base ? path.join(base, f) : f, 'utf8');
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
      // --show-span: up to --show samples per listed kind, at most one per file and kind
      const spanSample = (b, sign, kind, k) => {
        if (!args.showSpan?.has(kind)) return;
        const n = (b.spanShown[kind] ??= {n: 0, file: null});
        if (n.n >= args.show || n.file === f) return;
        n.n++; n.file = f;
        const [st, en] = k.split(':').map(Number);
        b.samples.push(`${sign} ${c.name}/${f}:${st} ${kind} ${JSON.stringify(text.slice(st, Math.min(en, st + 90)))}`);
      };
      for (const b of builds) {
        const tree = b.p[isTsx ? 'tsx' : 'ts'].parse(text);
        const {out: got, errors} = tsNodes(tree);
        if (args.spans) {
          const ws = (want.spans ??= tscSpans(want.sf));
          const gs = tsSpans(tree, text);
          const sp = b.span;
          for (const [k, kind] of gs) {
            if (ws.has(k)) sp.tp++;
            else {
              sp.fp++; sp.fpKinds[kind] = (sp.fpKinds[kind] ?? 0) + 1;
              spanSample(b, '+', kind, k);
            }
          }
          for (const [k, kind] of ws) {
            if (!gs.has(k)) {
              sp.fn++; sp.fnKinds[kind] = (sp.fnKinds[kind] ?? 0) + 1;
              spanSample(b, '-', kind, k);
            }
          }
        }
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
    const r = {name: b.name, files: b.files, filesWithErrors: b.errFiles, total: t,
      precision: t.tp / (t.tp + t.fp), recall: t.tp / (t.tp + t.fn), categories: b.cats};
    if (args.spans) r.spans = b.span;
    report.builds.push(r);
  }
  console.log(`tree accuracy vs tsc ${ts.version}: ${files} files tsc parses cleanly (${skipped} skipped) in ${report.corpora.join(', ')}`);
  console.log(['build'.padEnd(28), 'precision%'.padStart(11), 'recall%'.padStart(9), 'wrong'.padStart(8), 'missed'.padStart(8), 'err files'.padStart(10)].join(' '));
  for (const r of report.builds) {
    console.log([r.name.padEnd(28), pct(r.total.tp, r.total.tp + r.total.fp).padStart(11), pct(r.total.tp, r.total.tp + r.total.fn).padStart(9), String(r.total.fp).padStart(8), String(r.total.fn).padStart(8), String(r.filesWithErrors).padStart(10)].join(' '));
  }
  if (args.spans) {
    const top = (o) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', ');
    for (const b of builds) {
      const sp = b.span;
      console.log(`${b.name} spans: precision ${pct(sp.tp, sp.tp + sp.fp)}% recall ${pct(sp.tp, sp.tp + sp.fn)}%` +
        ` (${sp.fp} unmatched here, ${sp.fn} unmatched in tsc)`);
      console.log(`  unmatched here, by kind: ${top(sp.fpKinds)}`);
      console.log(`  unmatched in tsc, by kind: ${top(sp.fnKinds)}`);
    }
  }
  for (const b of builds) for (const s of b.samples) console.log(`${b.name} ${s}`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1) + '\n');
}

main().catch((e) => {
  console.error(`tree-accuracy: ${e.message}`); process.exit(2);
});
