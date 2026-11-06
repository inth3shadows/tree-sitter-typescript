# Changelog

Changes in this fork since tree-sitter/tree-sitter-typescript v0.23.2. Every change to
`node-types.json` (a node added, renamed, moved or removed) is listed under **Node types**,
because editor queries match on node names.

## Unreleased

### Fixes
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
- New `variance` node inside `type_parameter`, holding the `in` / `out` keywords (marionebl).
- New `escape_sequence` child of `template_literal_type` (marionebl).
- An import type is now a `primary_type`, and `generic_type`'s `name` may be a
  `member_expression` (dokimasia).
