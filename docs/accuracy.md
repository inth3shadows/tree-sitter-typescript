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
  constructor, conditional, array, tuple, operator, predicate and parenthesized types). Spans are
  exact UTF-16 offsets on both sides.
- **Precision** = matched / nodes this grammar emits. **Recall** = matched / nodes tsc emits.
  A wrong nesting costs both: the wrong node is unmatched and tsc's node is missing.

A few differences are conventions the grammar cannot change. They are left out on both sides:
comma expressions, `typeof` operands in types, JSX, interface `extends` and `implements` lists
(types here, expressions in tsc), statement conditions (`if (x)` is parenthesized here), and
inner union or intersection nodes (tsc's are flat). What remains is a small constant floor,
so the change between builds is the signal.

## Results

Each row is a build of that commit's committed `src/`, measured over 6,218,919 tsc nodes.
"Wrong" counts nodes this grammar emits that tsc does not have. "Missed" counts tsc nodes this
grammar does not reproduce. "Error files" counts files tsc accepts that contain an ERROR or
MISSING node.

| Build | Commit | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|
| upstream v0.23.2 | f975a62 | 99.720 | 99.791 | 17,404 | 12,978 | 231 |
| fork seed (marionebl base) | 53071c9 | 99.867 | 99.883 | 8,274 | 7,282 | 17 |
| fork v0.24.0 | aabbc68 | 99.879 | 99.887 | 7,540 | 7,001 | 1 |
| #81 readonly precedence | 85f779e | 99.915 | 99.923 | 5,301 | 4,803 | 1 |
| #86, #89 asserts | 31f7f61 | 99.915 | 99.923 | 5,301 | 4,803 | 1 |
| #91 prefix op before `f<T>(x)` | 4fbb2d0 | 99.956 | 99.964 | 2,716 | 2,266 | 1 |
| #94 `await x as T` | 79cc301 | 99.963 | 99.970 | 2,332 | 1,882 | 1 |
| #96 `as` / `satisfies` precedence | 84574d1 | 99.964 | 99.971 | 2,232 | 1,782 | 1 |
| #99 `a + b!` | 713d1ba | 99.989 | 99.996 | 697 | 247 | 1 |

Every merged fix either improved both numbers or left them unchanged. #86 and #89 fixed `asserts`
forms that these corpora do not use. From upstream v0.23.2 to #99, wrong nodes fell by 96%
(17,404 to 697) and missed nodes by 98% (12,978 to 247). The raw numbers, per category, are in
`scripts/tree-accuracy.history.json`.

What remains at #99, by category (wrong / missed):

- **cast** (152 / 152) and most of **member** (300 / 2): `x as a.b.C` reads as `(x as a.b).C`
  (#102). Every sampled member mismatch was this pattern.
- **call** (155 / 69): every sampled case is in the one file with an ERROR, effect's
  `typetest/schema/Schema.tst.ts`.
- **type_predicate** (40 / 0) and **instantiation** (36 / 0): not yet examined.

## Other forks

Measured 2026-11-17, 11:27–11:55 UTC, with the same files, tsc and rules as above. The table includes
upstream `master` and every fork on GitHub whose grammar differs from upstream: 15 of the 192
forks fetched that day. The others are upstream as it was at some past commit. Each row is the
branch tip with its committed `typescript/src` and `tsx/src` compiled to wasm (tree-sitter-cli
0.25.10). Rows are sorted by wrong + missed. This fork's row is the #99 build; main has the same
grammar.

| Fork | Branch | Commit | Committed | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|---|---|
| **this fork, main** | `main` | 713d1ba | 2026-11-16 | 99.989 | 99.996 | 697 | 247 | 1 |
| dokimasia | `master` | 839d520 | 2026-10-21 | 99.896 | 99.908 | 6,452 | 5,733 | 127 |
| marionebl | `master` | 53071c9 | 2026-03-27 | 99.867 | 99.883 | 8,274 | 7,282 | 17 |
| lzehrung | `codegraph-main` | f0a42fe | 2026-11-11 | 99.857 | 99.872 | 8,925 | 7,930 | 141 |
| dive2Pro | `master` | a867410 | 2026-01-13 | 99.846 | 99.860 | 9,606 | 8,685 | 162 |
| TobiasBak | `parse-fixes` | 795c315 | 2026-11-10 | 99.778 | 99.835 | 13,817 | 10,285 | 168 |
| vincentkoc | `master` | 2ec69f5 | 2026-11-03 | 99.724 | 99.809 | 17,167 | 11,893 | 247 |
| vmikhailov | `master` | 4f96ecd | 2026-11-10 | 99.732 | 99.796 | 16,685 | 12,708 | 224 |
| bavovna | `master` | e0a41f4 | 2026-10-24 | 99.728 | 99.795 | 16,922 | 12,718 | 231 |
| tree-sitter (upstream) | `master` | 75b3874 | 2025-01-30 | 99.720 | 99.791 | 17,404 | 12,978 | 231 |
| QuiltLang | `master` | 25f4db1 | 2026-06-12 | 99.720 | 99.791 | 17,404 | 12,978 | 231 |
| HerringtonDarkholme | `master` | c6a1b87 | 2025-04-29 | 99.720 | 99.791 | 17,404 | 12,978 | 229 |
| NzSN | `master` | ad3165c | 2025-02-14 | 99.720 | 99.791 | 17,404 | 12,978 | 231 |
| etchpad | `development` | bf45087 | 2026-03-06 | 99.765 | 99.746 | 14,628 | 15,811 | 239 |
| BrokkAi | `master` | bb76a11 | 2026-10-16 | 99.720 | 99.790 | 17,450 | 13,031 | 224 |
| SegaraRai | `master` | 82b3609 | 2026-09-02 | 99.703 | 99.767 | 18,499 | 14,467 | 180 |
| plewg | `master` | 051c106 | 2026-08-20 | 98.754 | 97.721 | 76,697 | 141,703 | 6,698 |

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
