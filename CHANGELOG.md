# Changelog

Changes in this fork since tree-sitter/tree-sitter-typescript v0.23.2. Every change to
`node-types.json` (a node added, renamed, moved or removed) is listed under **Node types**,
because editor queries match on node names.

## Unreleased

### Fixes
- TSX accepts literal ampersands in JSX text and quoted attributes, including URL
  query parameters and a trailing ampersand. Complete named and numeric character
  references retain their existing nodes; ordinary strings and operators are unchanged.
  Literal ampersands use the existing `jsx_text` and `string_fragment` node kinds;
  quoted literals split before every ampersand, and spaces between entities remain
  string fragments rather than leading trivia in entity spans. No text or reference is lost.
  Quoted JSX content is tokenized without JavaScript comment extras, so `//` and
  `/* ... */`, `<!--` and `-->` after an entity remain literal attribute text and
  cannot hide a quote. A TSX-only scanner marker keeps HTML comment scanning outside
  quoted attributes.
- A value named `abstract` stays an identifier in type queries: `f<typeof abstract>(x)`,
  typed tags, qualified queries such as `typeof abstract.value`, and parenthesized
  `(typeof abstract)` types retain their type interpretation instead of becoming comparisons
  or errors. Runtime `typeof` calls, optional chains and indexed property expressions keep their comparison
  interpretation when they are not valid type-query operands. Existing `abstract` member
  names and modifiers continue to parse.
- A class, interface or object-type member may be named `accessor`, including fields,
  methods and optional members (upstream #369). Auto-accessor fields also parse after
  `static`, `override` or `abstract`, including static private names. A bare `accessor`
  followed by a line break before an ordinary field or method stays a separate field;
  a signature on the next line still belongs to a method named `accessor`. The word
  stays a type name in parenthesized types, generic calls, typed tags and class heritage.
- A class, interface or object-type member named `abstract` parses: `abstract?: boolean`,
  `abstract(): void`, `abstract = 1` (upstream #377). `abstract` is also an ordinary identifier in
  expressions (`abstract = 5`, `abstract()`). A bare `abstract` followed by a line break now ends the
  member or statement, as in tsc: `abstract\n m(): void` is a field `abstract` and a method `m`
  (it was one abstract method), and `abstract\nclass A {}` is an expression statement and a
  `class_declaration` (it was an `abstract_class_declaration`). Still failing after a line break:
  a next member named `in` or `instanceof`, a generator `*m()`, or a multi-line comment between.
- A template string may contain a bare `\x` or `\u` (no hex digits after it), as ES2018 allows in
  tagged templates: String.raw`\usepackage{x}` no longer errors (upstream #353; effect Json5.test.ts
  now agrees with tsc). Template literal types take it too, so `type T = `\u`` and
  `f<`\u`>(1)` (a call, not a comparison) parse as tsc does. The token cannot see the tag, so
  untagged templates and type templates with substitutions accept it though tsc rejects them.
  Strings still reject it.
- After a class field initializer, `in(b) ? 1 : 2` on the next line is again `(x in (b)) ? 1 : 2`;
  the previous fix dropped `in(b)` from the tree without an error. A `)` inside a string or comment
  in `in(…)` no longer decides member vs operator, `in () {}` (a space before the parameters) is a
  method, and U+2028/U+2029 end a line comment inside `unique // … symbol` (codegraph#17 round 2).
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
- `instantiation_expression.function` no longer lists `subscript_expression`: indexed
  values cannot continue as instantiated type queries.
- In the tree, `unique symbol` is now one anonymous token under `predefined_type` (it was
  `unique` then `symbol`); node-types.json is unchanged.
- New `variance` node inside `type_parameter`, holding the `in` / `out` keywords (marionebl).
- New `escape_sequence` child of `template_literal_type` (marionebl).
- An import type is now a `primary_type`, and `generic_type`'s `name` may be a
  `member_expression` (dokimasia).
