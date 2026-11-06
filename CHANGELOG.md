# Changelog

Changes in this fork since tree-sitter/tree-sitter-typescript v0.23.2. Every change to
`node-types.json` (a node added, renamed, moved or removed) is listed under **Node types**,
because editor queries match on node names.

## Unreleased

### Fixes
- A member named `in` is recognised only between class or object-type members, so `for (var k\n in!o)`
  and `for (var k\n in<T>x)` stay for-in loops; `in(): T {}` after a block-bodied arrow field, and `in?:`
  after any member, start a member named `in` (inth3shadows/codegraph#17 review S1, S2).
- `unique symbol` accepts any whitespace the grammar skips elsewhere (`unique\u00A0symbol`), and a line
  comment between the words must end at its newline: `unique // the symbol` stays a name (S3, S4).
- The tsx parser no longer hangs on `<a {{b:>c:d(e f)` (upstream #323). The livelock is in
  tree-sitter's error recovery, not this grammar (tree-sitter/tree-sitter#5997), so the fix is
  a runtime of 0.27.1 or later: web-tree-sitter is now pinned to 0.27.1, and the differential
  fails if any input in `test/hang/` takes over 2s or any corpus file over 30s. **Consumers on
  an older runtime still hang on this input**, including the Node binding (`tree-sitter` 0.25.1
  on npm is the latest).
- ASI before a line starting with an identifier such as `in2` or `in$x` (upstream #373), and before
  members named `in` written `in?:`, `in<T>()` or `in!:`; `a\n in(b)` stays `a in (b)`.
- `unique` is a name everywhere except `unique symbol` (`i < unique.length`, `let x: unique`,
  `[unique: T]`, `implements unique`).
- A tuple label may be named like a type keyword: `[symbol: string]`, `[number?: string]` (upstream #378).
- A tagged template with type arguments parses: ``sql<{ id: number }>`SELECT ...` ``.
- A member name followed by its signature on the next line (`find\n  <T>(id): T`,
  `find\n  (id): T`) stays one method.
- `out` works as a type-parameter name (`type F<out> = out[]`, `<in out>`), and `<in const T>` parses.
- From dokimasia/tree-sitter-typescript: an import type works wherever a primary type can
  appear (`import("m").X[]`), and `f<typeof import("m")>()` parses as a call.
- From marionebl/tree-sitter-typescript (the base of this fork): variance annotations
  (`<in T>`, `<out T>`, `<in out T>`), `export type *`, escape sequences in template literal
  types, ASI before a generic call signature (upstream #335), ASI before `in` used as a name.

### Node types
- In the tree, `unique symbol` is now one anonymous token under `predefined_type` (it was
  `unique` then `symbol`); node-types.json is unchanged.
- New `variance` node inside `type_parameter`, holding the `in` / `out` keywords (marionebl).
- New `escape_sequence` child of `template_literal_type` (marionebl).
- An import type is now a `primary_type`, and `generic_type`'s `name` may be a
  `member_expression` (dokimasia).
