# Tree accuracy against tsc

The [tsc differential](differential.md) asks whether a file has a parse error. It cannot see a
wrong tree that has no ERROR in it, such as `a + b!` read as `(a + b)!`, and most of this fork's
recent fixes were wrong trees of that kind. `scripts/tree-accuracy.mjs` measures them: it compares
the nodes this grammar builds with the nodes the TypeScript parser builds for the same file.

## Method

- **Oracle**: `ts.createSourceFile` (typescript 5.9.3, pinned in `package-lock.json`). It is the
  TypeScript parser itself, with no type check.
- **Files**: every `.ts`/`.tsx`/`.mts`/`.cts` file in the differential's pinned corpora that tsc
  parses with no diagnostics: 14,533 files from Effect, Zod, Excalidraw and VS Code `src/`.
- **Unit**: a node as `(category, start, end)`. Each side's node kinds map to shared categories
  (binary, unary, await, non_null, member, subscript, call, new, cast, type_assertion, ternary,
  instantiation, arrow, parenthesized, yield, spread, and the union, intersection, function,
  constructor, conditional, array, tuple, operator, predicate, parenthesized and import types). Spans are
  exact UTF-16 offsets on both sides.
- **Precision** = matched / nodes this grammar emits. **Recall** = matched / nodes tsc emits.
  A wrong nesting costs both: the wrong node is unmatched and tsc's node is missing.

A few differences are conventions the grammar cannot change. They are left out on both sides:
comma expressions, `typeof` operands in types, JSX, interface `extends` and `implements` lists
(types here, expressions in tsc), statement conditions (`if (x)` is parenthesized here), inner
union or intersection nodes (tsc's are flat), and the inner part of a qualified name (`a.b` in
`a.b.c.D` is a `member_expression` here, from the JavaScript grammar, and a `QualifiedName` in
tsc). What remains is a small constant floor,
so the change between builds is the signal.

## Results

Each row is a build of that commit's committed `src/`, measured over 6,218,919 tsc nodes.
"Wrong" counts nodes this grammar emits that tsc does not have. "Missed" counts tsc nodes this
grammar does not reproduce. "Error files" counts files tsc accepts that contain an ERROR or
MISSING node.

| Build | Commit | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|
| upstream v0.23.2 | f975a62 | 99.721 | 99.790 | 17,384 | 13,071 | 231 |
| fork seed (marionebl base) | 53071c9 | 99.867 | 99.881 | 8,254 | 7,371 | 17 |
| fork v0.24.0 | aabbc68 | 99.879 | 99.886 | 7,520 | 7,090 | 1 |
| #81 readonly precedence | 85f779e | 99.915 | 99.921 | 5,281 | 4,892 | 1 |
| #86, #89 asserts | 31f7f61 | 99.915 | 99.921 | 5,281 | 4,892 | 1 |
| #91 prefix op before `f<T>(x)` | 4fbb2d0 | 99.957 | 99.962 | 2,695 | 2,355 | 1 |
| #94 `await x as T` | 79cc301 | 99.963 | 99.968 | 2,311 | 1,971 | 1 |
| #96 `as` / `satisfies` precedence | 84574d1 | 99.964 | 99.970 | 2,211 | 1,871 | 1 |
| #99 `a + b!` | 713d1ba | 99.989 | 99.995 | 676 | 336 | 1 |
| #102 `x as a.b.C` | 3d86d76 | 99.995 | 99.997 | 330 | 178 | 1 |
| #107 `([B?])` | 43fed12 | 99.996 | 99.998 | 227 | 96 | 0 |
| #110 `import('m').A` type | 69e93e3 | 99.999 | 100.000 | 49 | 7 | 0 |

Every merged fix either improved both numbers or left them unchanged. #86 and #89 fixed `asserts`
forms that these corpora do not use. From upstream v0.23.2 to #110, wrong nodes fell from 17,384
to 49 and missed nodes from 13,071 to 7, and no file tsc accepts has an ERROR. Precision is
99.999% and recall rounds to 100.000%. The raw numbers, per category, are in
`scripts/tree-accuracy.history.json`. All rows were re-measured on 2026-11-17 when the
qualified-name convention and the import-type category were added; builds before #110 have no
import-type node, so each misses tsc's 89 `ImportType`s.

What remains at #110, by category (wrong / missed):

- **type_predicate** (40 / 0): not yet examined.
- **new** (2 / 2) and **non_null** (2 / 2): `!` after `new` wraps the `new_expression`
  (`new a.b!.C()`, #100).
- **call** (2 / 0), **member** (2 / 2) and **arrow** (1 / 1): not yet examined.

## Other forks

Measured 2026-11-17 (re-measured with the rules above, finished 18:34 UTC), with the same files
and tsc as above. The table includes upstream `master` and every fork on GitHub whose grammar
differs from upstream: 15 of the 192 forks fetched that day. The others are upstream as it was at
some past commit. Each row is the branch tip with its committed `typescript/src` and `tsx/src`
compiled to wasm (tree-sitter-cli 0.25.10). Rows are sorted by wrong + missed. This fork's row is
the #110 build (69e93e3).

| Fork | Branch | Commit | Committed | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|---|---|
| **this fork, main** | `main` | 69e93e3 | 2026-11-17 | 99.999 | 100.000 | 49 | 7 | 0 |
| dokimasia | `master` | 839d520 | 2026-10-21 | 99.897 | 99.906 | 6,432 | 5,822 | 127 |
| marionebl | `master` | 53071c9 | 2026-03-27 | 99.867 | 99.881 | 8,254 | 7,371 | 17 |
| lzehrung | `codegraph-main` | f0a42fe | 2026-11-11 | 99.857 | 99.871 | 8,905 | 8,019 | 141 |
| dive2Pro | `master` | a867410 | 2026-01-13 | 99.846 | 99.859 | 9,586 | 8,776 | 162 |
| TobiasBak | `parse-fixes` | 795c315 | 2026-11-10 | 99.778 | 99.833 | 13,796 | 10,378 | 168 |
| vincentkoc | `master` | 2ec69f5 | 2026-11-03 | 99.725 | 99.807 | 17,147 | 11,986 | 247 |
| vmikhailov | `master` | 4f96ecd | 2026-11-10 | 99.732 | 99.794 | 16,665 | 12,801 | 224 |
| bavovna | `master` | e0a41f4 | 2026-10-24 | 99.728 | 99.794 | 16,902 | 12,811 | 231 |
| tree-sitter (upstream) | `master` | 75b3874 | 2025-01-30 | 99.721 | 99.790 | 17,384 | 13,071 | 231 |
| QuiltLang | `master` | 25f4db1 | 2026-06-12 | 99.721 | 99.790 | 17,384 | 13,071 | 231 |
| HerringtonDarkholme | `master` | c6a1b87 | 2025-04-29 | 99.721 | 99.790 | 17,384 | 13,071 | 229 |
| NzSN | `master` | ad3165c | 2025-02-14 | 99.721 | 99.790 | 17,384 | 13,071 | 231 |
| etchpad | `development` | bf45087 | 2026-03-06 | 99.765 | 99.744 | 14,607 | 15,902 | 239 |
| BrokkAi | `master` | bb76a11 | 2026-10-16 | 99.720 | 99.789 | 17,430 | 13,124 | 224 |
| SegaraRai | `master` | 82b3609 | 2026-09-02 | 99.703 | 99.766 | 18,479 | 14,560 | 180 |
| plewg | `master` | 051c106 | 2026-08-20 | 98.754 | 97.714 | 76,651 | 142,179 | 6,698 |

- marionebl's tip is the commit this fork started from, and its numbers match the fork-seed row
  above exactly. Upstream `master` matches the v0.23.2 release.
- Several forks change only queries, packaging or one construct, so their totals equal upstream.
- plewg's committed parser may not have been regenerated from its grammar. That was not checked,
  so treat its row as a measurement of what the branch ships, not of its grammar.
- The full numbers, per category, are in `scripts/tree-accuracy.forks.json`.

## Reproduce

```sh
npm run differential          # once: fetches the pinned corpora into the cache
npm run build:wasm
npm run accuracy              # this checkout
node scripts/tree-accuracy.mjs \
  --build main=tree-sitter-typescript.wasm,tree-sitter-tsx.wasm \
  --build other=/path/other-ts.wasm,/path/other-tsx.wasm \
  --json out.json             # several builds in one pass; tsc parses each file once
```

`--corpus NAME` limits the run to one corpus. `--show N --show-category CAT` prints mismatched
nodes with their source text. A full run of one build takes about two minutes.
