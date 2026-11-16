# Changelog

Changes in this fork since tree-sitter/tree-sitter-typescript v0.23.2. Every change to
`node-types.json` (a node added, renamed, moved or removed) is listed under **Node types**,
because editor queries match on node names.

## Unreleased

### Fixes
- `readonly` binds only to the type directly after it, as `keyof` does, so a following
  union, intersection or conditional type now sits outside it, as in tsc (#75):
  `readonly string[] | null` is a `union_type` of a `readonly_type` and `null`, and
  `readonly T[] & U` and `readonly T[] extends U ? A : B` nest the same way; each was a
  `readonly_type` around the whole type. `keyof readonly T[] | U` is a `union_type` of
  the `index_type_query` and `U`; it was an `index_type_query` of a `readonly_type` of
  the union. From dokimasia/tree-sitter-typescript (Roy Klopper).
  A constructor type's return type takes a following union, intersection or
  conditional type, as a function type's return type does: `new () => A | B` is a
  `constructor_type` returning the union; it was a `union_type` of the
  `constructor_type` and `B`. The same holds for `abstract new`, `&` and `extends`.
  Tree shape only: node types are unchanged. Of 34,956 real files, 263 parse
  differently: 257 for `readonly` and 6 for a constructor's return type
  (`new () => HTMLElement | undefined`). None errors before or after. The parse table
  grows by 3 states (tsx 3).
- A constructor type may return a type predicate or an assertion, as a function type
  may: `new () => x is T`, `abstract new () => asserts x` and
  `new () => asserts x is T` were an ERROR (#85). The parse table grows by 36 states
  (tsx 36).
- `asserts` starts an assertion return type only when an identifier or keyword
  follows on the same line, as in tsc; otherwise it names a type (#87). The scanner
  decides, as for `global`, so `asserts` is never a keyword anywhere else.
  `() => asserts`, `new () => asserts.a.b`, `() => asserts<T> | U` and
  `function f(): asserts {}` were an ERROR or a MISSING identifier, and
  `() => asserts⏎x` took `x` as the asserted name; it now ends the type at the line
  break, as does a block comment containing one. The parse table is unchanged.
  Known limit: a type predicate on a parameter named `asserts` (`(asserts) => asserts is T`)
  is still an ERROR; tsc reads `asserts is` as that predicate.
- A prefix operator before a generic call or a tagged template with type arguments
  applies to the whole call, as in tsc (#77): `await f<T>(x)` is an
  `await_expression` around the `call_expression`; it was a `call_expression` whose
  callee was `await f`. The same holds for `!`, `void`, `typeof`, `-` and `delete`,
  for binary operators (`a + b.c<T>(x)`), for tagged templates (``await f<T>`t` ``)
  and for chains after the call (`await f<T>(x)<U>(y)`, `!x.get<T>().y`). A generic
  call now wins whenever its type arguments parse, as in tsc, so `x as A.B.C<T>` is an
  `as_expression` of a `generic_type`, not an `instantiation_expression`. Comparisons
  that tsc cannot read as type arguments stay comparisons: `a < b && c > (d)` (a
  leading `&` or `|` inside a type is penalized). Of 14,625 files in the differential
  corpora, 380 parse differently (1,234 sites, 1,054 of them `await`); none errors
  before or after. The parse table grows by 3 states (tsx 3).
  Known limits: a prefix operator before a generic instantiation with no call,
  `await f<T>`, still applies to `f` alone. After an instantiation with no call,
  `as`, `satisfies`, `instanceof` and `in` can now be read as identifiers in a
  comparison, where tsc and the previous release read the operator (#93):
  `a<T> as | A`, `a<A.B> as [B]`, `a<A.B> instanceof (b)`. ``new new B<T>`t` `` now
  has a missing `!`; it was a clean tree of the wrong shape.
- `await x as T` casts the awaited value, as in tsc (#92): it is an `as_expression`
  around the `await_expression`; it was an `await_expression` around `x as T`. The
  same holds for `satisfies`. Of 14,625 files in the differential corpora, 71 parse
  differently (191 sites, all this case); none errors before or after. The parse
  table size is unchanged. Tree shape only: node types are unchanged, but a query for
  `(await_expression (as_expression))` now needs `(as_expression (await_expression))`.
  Known limit: `await f<T> as U` keeps the `await f<T>` limit above.
- `as` and `satisfies` take tsc's relational precedence, the level of `<` and
  `instanceof` (#95). They bind tighter than `==`, `&`, `^`, `|`, `&&`, `||` and
  `??`: `a ?? b as T` is a `binary_expression` whose right side is `b as T`; it was
  an `as_expression` of `a ?? b`. They bind looser than `**`: `a ** b as T` is now an
  `as_expression` of `a ** b`. `a || await x as T` is `a || ((await x) as T)`. Of
  14,625 files in the differential corpora, 36 parse differently (47 sites, all
  this case: 28 `??`, 8 `===`, 7 `&&`, 4 `||`); none errors before or after. The
  parse table size is unchanged. Tree shape only: node types are unchanged, but a
  query for `(as_expression (binary_expression))` on `a ?? b as T` now needs
  `(binary_expression (as_expression))`. Known limit: `<T>a < b` is still
  `<T>(a < b)` (#97).
- A non-null assertion binds to the operand right before it, as in tsc (#98): `a + b!`
  is a `binary_expression` whose right side is `b!`; it was a `non_null_expression`
  around `a + b`, so `a ?? b!.c` read `.c` off `a ?? b`. The same holds after any
  binary operator, `?:`, a prefix or update operator (`!x!` is `!(x!)`, `typeof x!`,
  `void x!`, `delete x!.y`, `++x!`, `await x!`) and a type assertion (`<T>x!` is
  `<T>(x!)`; `<T>new A().b` now asserts the whole member chain, as tsc does). Of 14,625 files in the differential
  corpora, 282 parse differently (494 sites); compared with tsc's tree, 224 of them
  come closer and none moves away, and none errors before or after. In 52,867 unique
  real files on one machine, 2,242 `non_null_expression`s wrapped a binary
  expression. The parse table size is unchanged. Tree shape only: node types are
  unchanged. Known limits: after `new`, `!` still wraps the `new_expression`
  (`new A!()`, `new a.b!.c()`; #100), and `a as T!` wraps the cast where tsc reads a
  JSDoc-style `T!` type.

### Node types
- `constructor_type.type` may also be `type_predicate` or `asserts` (#85), as
  `function_type.return_type` already may.

## 0.24.0

### Packaging
- The Rust crate is published to crates.io as `tree-sitter-typescript-next`; its library
  is still `tree_sitter_typescript` (#72). Version 0.24.0, since node types changed
  since upstream v0.23.2.

### Fixes
- A `using` or `await using` declaration is a `using_declaration` node, the shape
  tree-sitter-javascript v0.25 gives it: `kind` is `using`, or `await` and `using`, and
  each binding is a `variable_declarator` (#69). New forms that tsc accepts parse:
  a type annotation (`using x: Disposable = f()`), several declarators
  (`using a = f(), b = g()`, which was a sequence expression, and an array pattern
  after the first, `using a = f(), [b] = g()`), `using x;`, `using x!: T = f()`,
  `export using x = f()`, and a for-of head (`for (using h of y)`,
  `for (await using h of y)`, `for await (await using h of y)`, `for (using {a} of y)`,
  `for (await using of of y)`), where `kind` and `left` match `for (const h of y)`. `f(using x = 1)` and
  `let y = using x = 1`, which tsc rejects, are now an ERROR. `using` as an identifier
  (#57) and `using⏎x = 1` as two statements are unchanged. The parse table grows by
  59 states (tsx 59).
  Known limits: a reserved word after `using` is read as the declared name
  (`using new = f()`, `for (using enum of y)`), as after `let` (`let enum = 1`).
  In a for head a line break after `using` does not stop the declaration
  (`for (using⏎h of y)`). `for (using x, y of z)` and `for (using x: T of z)`, which
  tsc's parser accepts and its checker rejects, are an ERROR, and so is
  `for (await using of y)`. Some forms tsc rejects parse: `export default using x = f()`
  (as `export default const` does), `!` in a for head (`for (using x! = 1;;)`, as
  `for (let x!: T;;)` does), and `for (using as T;;)`, read as a cast.
- A re-export takes import attributes, as an import does:
  `export * from "./m.json" with { type: "json" }`, `export * as ns from … with {…}`,
  `export { a } from … with {…}`, the `export type` forms and the older `assert {…}`
  were an ERROR (#78). As in tsc, a `with` after a line break starts a new statement.
  The parse table grows by 2 states (tsx 2).
- A mapped type's key may be named `type`: `{ [type in keyof T]: T[type] }` was an
  ERROR (#59). Behaviour change: `[type in K]: T` in an object type, interface or
  class, which parsed as a member with a computed name, is now an `index_signature`
  with a `mapped_type_clause`, as `[K in K]: T` already was.
  Known limit: without a `: T` after it, `[type in X]` is now an ERROR as a class
  member name (`class C { [type in obj] = 1 }`) or a mapped type member with no value
  type (`{ [type in X] }`), as `[K in X]` already was (#74).
- Whitespace or a comment may separate the mapped type modifiers from the colon:
  `]? : T`, `]- ? : T` and `]+ ?/* c */: T` were an ERROR (#60); bundled declarations
  print `]? :`. `?:`, `-?:` and `+?:` are no longer single tokens, so the `-` or `+`
  of a mapped type modifier now gets the `@operator` highlight.
  Together the parse table grows by 17 states (tsx 17).
- A raw NUL byte (a literal U+0000, not the `\0` escape) in a template string is
  template content, as tsc reads it; it was an ERROR (#61). Only the real end of input
  ends a template scan now. From vmikhailov/tree-sitter-typescript and
  BrokkAi/tree-sitter-typescript. Scanner only: node types and the parse table are
  unchanged. Still an ERROR: a backslash directly before the NUL in a template, and a
  raw NUL in a quoted string, regex, comment or JSX text.
- `keyof` takes a `readonly` or `infer` type: `keyof readonly any[]`, which TypeScript's
  own `lib.es2015.symbol.wellknown.d.ts` uses, and `U extends keyof infer V ? V : never`
  were an ERROR (#58). From dokimasia/tree-sitter-typescript (Roy Klopper). The parse
  table grows by 9 states (tsx 9).
  Known limit: `readonly` still takes everything after it, so
  `keyof readonly T[] | U`, `& U` and `extends U ? A : B` nest inside `readonly` (as
  `readonly string[] | null` already did) where tsc binds them outside `keyof`.
- `using` parses as an ordinary identifier: `let y = using`, `if (using) x`,
  `using[1]`, `using++`, `x = using as T`, `class A extends using {}` and a parameter
  or method named `using` were an ERROR (#57). `using` declares only when a binding
  follows it on the same line (`using x = f()`, as in tsc's isUsingDeclaration): a
  name (including `as`, `satisfies`, `of` and `undefined`), a name with `!` (`x!`,
  `as!`), or an object pattern.
  Which reading holds is decided by the tokens that follow (a GLR conflict), so
  `using as = f()` declares and `using as T` casts. `using [a] = b` is now an
  assignment to `using[a]`, as tsc reads it, and `using a.b = c`, which tsc rejects, is
  an ERROR. In a statement, a line break after `using` ends it: `using⏎x = 1` is two
  statements (in a `for` head it still declares, as before). The parse table shrinks by
  49 states (tsx 48).
- An import type inside parentheses parses: `let x: (import("m").A)[]` and
  `type T = (import("m").A | B)[]`, which `tsc --declaration` emits, were an ERROR
  (#56). Wherever an import type and an expression can both start (after `(` in a
  type, in type arguments, return types, `satisfies`, mapped-type `in`, asserts
  predicates), the parser now keeps both readings until one fails, where a static
  precedence used to drop the import type. The parse table shrinks by 225 states
  (tsx 95).
- Behaviour change: an import type as a type argument in an expression now reads as
  type arguments, like every other type form: `f<import("m").A>(x)` and
  `a < import("m").b > (c)` are a `call_expression` (was `binary_expression`), and
  `a < import("m").b > + c` is an `instantiation_expression`, as `a < b.c > + c`
  already was.
- A default-exported function signature may omit its name, as `tsc --declaration`
  emits for every anonymous default export: `export default function (a: string):
  void;` and `export default async function <T>(a: T): Promise<T>;` are a
  `function_signature` with no `name`, where they were an ERROR (#55). Generator
  signatures parse too (`function* g(): Iterator<number>;`,
  `export default function* (): Iterator<number>;`). The parse table grows by 86
  states (tsx 86).
- `global { ... }` without `declare`, as `@types/node` writes it inside
  `declare module "m" { ... }`, is an `ambient_declaration` like `declare global`,
  where it was an ERROR (#54). As in tsc's parser, it is accepted in any statement
  position (`function f() { global {} }`), across line breaks and comments
  (`global⏎{}`, `global /* c */ {}`), and
  `declare⏎global {}` is `declare` followed by an augmentation. The scanner emits
  the keyword only when `{` follows, so `global` stays an identifier everywhere else,
  including types (`x<global>()`, `(global)[]`). It is a statement rather than a
  declaration, so `export default global {}`, which tsc rejects, stays an ERROR.
  Still unlike tsc: `export global {}` is an ERROR, and `global {}` on the same
  line right after a block (`{} global {}`) is still an expression and a block
  with a missing `;`, as before. The parse table grows by 343
  states (tsx 343).
- `as` may name a declared variable wherever tsc allows: `let as = 1`, `let⏎as = 2`,
  `let as!: number`, `for (let as of x) {}` and `for (const as of x) {}` parse,
  where they were an ERROR (#45). After `let` the parser also allows `let` as an
  identifier followed by `as T`, so `as` lexed as that keyword. `let as T`, which
  tsc rejects, is now a declaration with an ERROR instead of an `as` expression.
  Node types are unchanged; the parse table grows by 2 states.
- `satisfies` may name a variable declared right after `let`, for the same reason:
  `let satisfies = 1`, `let satisfies!: number`, `for (let satisfies of x) {}` and
  `for (let satisfies in x) {}` parse, where they were an ERROR, and `let satisfies;`
  and `for (let satisfies; ;) {}` are declarations instead of `satisfies`
  expressions (#51). `let satisfies T` and `for (let satisfies T; ;) {}`, which tsc
  rejects, are now a declaration with an ERROR. Node types and the parse table size
  are unchanged.
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
- The same holds before `?` and `=`: `type F = ({a}?: T) => R`, `({a}?) => R` and
  `({a} = {}) => R` parse, where they were an ERROR (#47), also with a line break
  or a comment before the token, and so do `x = a < {b} ? c : d` and
  `a < {b} ?? c`. Before `,`, `)`, `}` and `]` the semicolon stays, because there
  the parser would pick the wrong reading of `g(e, f<{b}, c>(d))` or
  `x = <T>f<[{b}]>(d)`; so `({a}, b) => R`, `({a}) => R`, `({a: {b}}: T) => R`,
  `([{a}]: T) => R` and `({a: string}: T) => R` are still an ERROR, and
  `if (a < {b}) {}` is still read as type arguments with a missing `>`.
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
- New node `using_declaration` (a `declaration`, also allowed as a `for_statement`
  initializer): `using x = f()` was an `expression_statement` holding an
  `assignment_expression`, and is now `(using_declaration (variable_declarator …))`
  (#69). `for_in_statement.kind` may also be `using` or `await` `using`, so it is now
  `multiple`. `variable_declarator.name` may also be `undefined`.
- `export_statement` may hold an `import_attribute` child after its source, so its
  unnamed children are now `multiple` (`export * as ns from … with {…}` has both a
  `namespace_export` and an `import_attribute`) (#78).
- The anonymous tokens `?:`, `-?:` and `+?:` are gone: `opting_type_annotation`,
  `omitting_type_annotation` and `adding_type_annotation` now hold separate `-`/`+`,
  `?` and `:` tokens (#60). A query matching `"?:"` must match `"?" ":"` instead.
- `index_type_query`'s child may also be `readonly_type` or `infer_type` (#58).
- `function_signature.name` is optional: absent in `export default function (…): T;` (#55).
- `ambient_declaration` is now also a direct subtype of `statement` (for `global { ... }`
  without `declare`, #54).
- `instantiation_expression.function` no longer lists `subscript_expression`: indexed
  values cannot continue as instantiated type queries.
- In the tree, `unique symbol` is now one anonymous token under `predefined_type` (it was
  `unique` then `symbol`); node-types.json is unchanged.
- New `variance` node inside `type_parameter`, holding the `in` / `out` keywords (marionebl).
- New `escape_sequence` child of `template_literal_type` (marionebl).
- An import type is now a `primary_type`, and `generic_type`'s `name` may be a
  `member_expression` (dokimasia).
