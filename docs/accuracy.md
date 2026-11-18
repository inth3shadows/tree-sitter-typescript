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
union or intersection nodes (tsc's are flat), the inner parts of a qualified name (`a.b` and
`a.b.c` in `a.b.c.d.E` are `member_expression`s here, from the JavaScript grammar, and
`QualifiedName`s in tsc), and the predicate inside `asserts x is T` (one `TypePredicate` in tsc,
an `asserts` around a `type_predicate` here, counted once). What remains is a small constant
floor, so the change between builds is the signal.

### Span check

`--spans` adds a second, kind-agnostic comparison as a triage aid: every tsc node and every
named node here, compared by span alone. It finds wrong trees in node kinds the categories do
not cover. Leaves, list wrappers that only one side has, and the layout conventions of each
grammar (decorators beside a method, `?:` annotations, `for (let …;` declaration lists, a
same-line comment after a statement, and others listed in the script) are left out on both
sides. `--show-span KINDS --show N` prints unmatched spans of the named kinds. Span numbers
are not part of the results below; on the corpora, every unmatched span the check found was
either a convention, now filtered, or a bug that is now fixed (#115).

`--files LIST` measures the files named in a list (one path per line, deduplicated by content)
instead of the corpora. Over 41,485 parse-clean local TypeScript files, it found no class of
wrong tree beyond the corpora's, apart from one parse of `unique symbol[]`, a type tsc's
checker rejects.

## Results

Each row is a build of that commit's committed `src/`, measured over 6,219,008 tsc nodes.
"Wrong" counts nodes this grammar emits that tsc does not have. "Missed" counts tsc nodes this
grammar does not reproduce. "Error files" counts files tsc accepts that contain an ERROR or
MISSING node.

| Build | Commit | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|
| upstream v0.23.2 | f975a62 | 99.721 | 99.790 | 17,344 | 13,071 | 231 |
| fork seed (marionebl base) | 53071c9 | 99.868 | 99.881 | 8,214 | 7,371 | 17 |
| fork v0.24.0 | aabbc68 | 99.880 | 99.886 | 7,480 | 7,090 | 1 |
| #81 readonly precedence | 85f779e | 99.916 | 99.921 | 5,241 | 4,892 | 1 |
| #86, #89 asserts | 31f7f61 | 99.916 | 99.921 | 5,241 | 4,892 | 1 |
| #91 prefix op before `f<T>(x)` | 4fbb2d0 | 99.957 | 99.962 | 2,655 | 2,355 | 1 |
| #94 `await x as T` | 79cc301 | 99.963 | 99.968 | 2,271 | 1,971 | 1 |
| #96 `as` / `satisfies` precedence | 84574d1 | 99.965 | 99.970 | 2,171 | 1,871 | 1 |
| #99 `a + b!` | 713d1ba | 99.990 | 99.995 | 636 | 336 | 1 |
| #102 `x as a.b.C` | 3d86d76 | 99.995 | 99.997 | 290 | 178 | 1 |
| #107 `([B?])` | 43fed12 | 99.997 | 99.998 | 187 | 96 | 0 |
| #110 `import('m').A` type | a0bcea7 | 100.000 | 100.000 | 9 | 7 | 0 |
| #111 `import_type` node | 24749bf | 100.000 | 100.000 | 9 | 7 | 0 |
| #112 `new A!()` | d558bd2 | 100.000 | 100.000 | 1 | 1 | 0 |
| #116 comments after a body | 2387388 | 100.000 | 100.000 | 0 | 0 | 0 |

Every merged fix either improved both numbers or left them unchanged. #86 and #89 fixed `asserts`
forms that these corpora do not use. From upstream v0.23.2 to #116, wrong nodes fell from
17,344 to 0 and missed nodes from 13,071 to 0, and no file tsc accepts has an ERROR. The raw
numbers, per category, are in `scripts/tree-accuracy.history.json`. All rows were re-measured on
2026-11-18, when the `asserts` predicate and the deeper parts of qualified names became
conventions (the latter changes no row here; it matters for longer names in other code); builds before #110 have no import-type node, so each misses tsc's 89 `ImportType`s.

The last mismatches went as follows: 40 `type_predicate`s were the `asserts` convention, now
counted once; #112 fixed `new a.b!.C()` (#100), which accounted for the `new`, `non_null`,
`call` and `member` pairs; and #116 fixed the last one, an arrow function whose span took in
the comment after it (#115). The [span check](#span-check) finds no
remaining mismatch on the corpora either.

## Other forks

Measured 2026-11-18 with the rules above, with the same files
and tsc as above. The table includes upstream `master` and every fork on GitHub whose grammar
differs from upstream: 15 of the 192 forks fetched that day. The others are upstream as it was at
some past commit. Each row is the branch tip with its committed `typescript/src` and `tsx/src`
compiled to wasm (tree-sitter-cli 0.25.10). Rows are sorted by wrong + missed. This fork's row is
the #116 build (2387388); the other forks are the same commits as in the 2026-11-17
measurement.

| Fork | Branch | Commit | Committed | Precision % | Recall % | Wrong | Missed | Error files |
|---|---|---|---|---|---|---|---|---|
| **this fork, main** | `main` | 2387388 | 2026-11-18 | 100.000 | 100.000 | 0 | 0 | 0 |
| dokimasia | `master` | 839d520 | 2026-10-21 | 99.897 | 99.906 | 6,392 | 5,822 | 127 |
| marionebl | `master` | 53071c9 | 2026-03-27 | 99.868 | 99.881 | 8,214 | 7,371 | 17 |
| lzehrung | `codegraph-main` | f0a42fe | 2026-11-11 | 99.857 | 99.871 | 8,865 | 8,019 | 141 |
| dive2Pro | `master` | a867410 | 2026-01-13 | 99.847 | 99.859 | 9,546 | 8,776 | 162 |
| TobiasBak | `parse-fixes` | 795c315 | 2026-11-10 | 99.779 | 99.833 | 13,756 | 10,378 | 168 |
| vincentkoc | `master` | 2ec69f5 | 2026-11-03 | 99.725 | 99.807 | 17,107 | 11,986 | 247 |
| vmikhailov | `master` | 4f96ecd | 2026-11-10 | 99.733 | 99.794 | 16,625 | 12,801 | 224 |
| bavovna | `master` | e0a41f4 | 2026-10-24 | 99.729 | 99.794 | 16,862 | 12,811 | 231 |
| tree-sitter (upstream) | `master` | 75b3874 | 2025-01-30 | 99.721 | 99.790 | 17,344 | 13,071 | 231 |
| QuiltLang | `master` | 25f4db1 | 2026-06-12 | 99.721 | 99.790 | 17,344 | 13,071 | 231 |
| HerringtonDarkholme | `master` | c6a1b87 | 2025-04-29 | 99.721 | 99.790 | 17,344 | 13,071 | 229 |
| NzSN | `master` | ad3165c | 2025-02-14 | 99.721 | 99.790 | 17,344 | 13,071 | 231 |
| etchpad | `development` | bf45087 | 2026-03-06 | 99.766 | 99.744 | 14,567 | 15,902 | 239 |
| BrokkAi | `master` | bb76a11 | 2026-10-16 | 99.721 | 99.789 | 17,390 | 13,124 | 224 |
| SegaraRai | `master` | 82b3609 | 2026-09-02 | 99.704 | 99.766 | 18,439 | 14,560 | 180 |
| plewg | `master` | 051c106 | 2026-08-20 | 98.755 | 97.713 | 76,601 | 142,212 | 6698 |

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
nodes with their source text. `--spans`, `--show-span KINDS` and `--files LIST` are described
under [Span check](#span-check). A full run of one build takes about two minutes.
