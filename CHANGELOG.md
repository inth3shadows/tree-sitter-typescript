# Changelog

Changes in this fork since tree-sitter/tree-sitter-typescript v0.23.2. Every change to
`node-types.json` (a node added, renamed, moved or removed) is listed under **Node types**,
because editor queries match on node names.

## Unreleased

### Fixes
- `as` may name a variable right after `let`, as tsc allows: `let as = 1`,
  `let⏎as = 2`, `let as!: number` and `for (let as of x) {}` parse, where they were
  an ERROR (#45). After `let` the parser also allows `let` as an identifier followed
  by `as T`, so `as` lexed as that keyword. `const as` and `var as` already parsed.
  Node types are unchanged; the parse table grows by 17 states.
- A block comment that spans a line break counts as a line break for automatic
  semicolon insertion, as in tsc: `let a = b /* x⏎ */ c` is two statements, and
  `abstract /* x⏎ */ y: number` is a field named `abstract` followed by `y`. A lone
  `\r`, U+2028 or U+2029 now ends a line too (`a\rb` is two statements), and ends a
  `//` comment. When code follows such a comment on its last line, the comment is a
  sibling between the two statements; a trailing one stays the statement's last
  child (#26).
- A line break after `let`, `new`, `export`, `static`, `get` or `set`, or before `from`
  after an export clause, no longer ends the statement or member: tsc reads
  `let⏎x = 1`, `new⏎Foo()`, `export⏎const x = 1`, `export { a }⏎from "m"` and
  `static⏎x` as one construct (#26). As in tsc, `let` continues only before a binding
  name, `[` or `{` (`let⏎if (x) {}` stays two statements), and `static`, `get` and `set`
  (also `abstract get`/`set`) only before a property name. `static⏎private x` still
  reads as two members: the grammar has no modifier after `static`. `abstract get⏎x:
  number` is now an ERROR, as it is in tsc. Node types are unchanged; the parse table
  grows about 9%.
- More ASI cases follow tsc (#40). `get⏎*g() {}` (also `set`) is a field `get` followed
  by a generator, where it was an ERROR; `static⏎*g() {}` stays one member.
  `static⏎declare = 1`, `static⏎private() {}` and `static⏎public: number` are one
  member named after the word, where they were two; `get⏎private() {}` is a getter
  named `private`, where it was a field `get` and a method. `x⏎inä = 1` and
  `x⏎instanceofä = 1` get a semicolon before the identifier, where they were an
  ERROR. U+200B and U+2060 count as whitespace in the scanner, as in the grammar's
  extras, so `let⏎<U+200B>if (x) {}` is two statements. Node types are unchanged.
- No semicolon is inserted after an object type's last member before a `}` that is
  followed by `:` (comments may come between). So a typed object pattern in a
  function type parses: `type F = ({a⏎}: T) => R` (also after a lone `\r`, or as a
  conditional type's branch), where it was an ERROR (#42), and so does
  `c ? a < {b⏎} : z`. This applies wherever an object type can end, including
  interface bodies. A block that ends a ternary arm keeps its semicolon before
  `}:`, so `c ? () => { let a } : b` now parses too. Node types are unchanged; the
  parse table grows about 5%.
- After `static` on one line, a modifier word on the next line (`private`, `declare`
  and so on) is the member's name unless the token after it is on the same line and
  can follow a modifier, as in tsc: `static⏎private⏎x` is a member `static private`
  and then `x`, and `static⏎private /* c */ = 1` is one member (#43).
  `static⏎private x` still reads as two members. After a bare member name, a next
  line starting with `*`, `.`, `in` or `instanceof` starts a new member:
  `x⏎*g() {}` and `x⏎in = 1` are two members, where they were an ERROR.
- Export specifiers may name `type` (upstream #313): `export { type }`,
  `export { type as T }`, `export { type as as }` and `export { type as "s" }` export
  a name `type`, while `export { type as }` and `export { type as as x }` are type-only
  exports of `as`, matching tsc. The names keep the existing `identifier` node and the
  `name`/`alias` fields; node types are unchanged.
- Import specifiers read `type` and `as` the same way (#31): `import { type as }` and
  `import { type as as x }` are type-only imports of `as`. `typeof` may be a specifier
  name in both directions (`import { typeof as t }`, `export { typeof }`); the Flow-style
  `typeof x` modifier still parses. Both rules share one helper; node types are unchanged.
  Like `import { x as default }`, an import may bind the reserved word `typeof`
  (`import { typeof }`, `import { type typeof }`) without an error, although tsc rejects it.
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
