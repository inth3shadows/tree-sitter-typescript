# tree-sitter-typescript (tsc-checked fork)

[![CI](https://github.com/inth3shadows/tree-sitter-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/inth3shadows/tree-sitter-typescript/actions/workflows/ci.yml)
[![tsc differential](https://github.com/inth3shadows/tree-sitter-typescript/actions/workflows/differential.yml/badge.svg)](https://github.com/inth3shadows/tree-sitter-typescript/actions/workflows/differential.yml)

A maintained fork of [tree-sitter/tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript),
which has had no commits since v0.23.2 (January 2025). Every grammar change here is checked
against `tsc`.

## Why this fork exists

I maintain a fork of [codegraph](https://github.com/colbymchenry/codegraph)
([mine](https://github.com/inth3shadows/codegraph)), which builds a code graph from tree-sitter
parses. When a TypeScript file fails to parse, its symbols and calls silently drop out of the
index. Tracking those losses down meant checking the grammar against the compiler, and the
fixes ended up here.

## How it is checked

- **tsc differential** ([docs/differential.md](docs/differential.md)): `tsc`'s syntax
  diagnostics are the ground truth, and every `.ts`/`.tsx` file in pinned corpora (Effect, Zod,
  Excalidraw and VS Code `src/`, about 14.5k files; a second set adds Angular, NestJS, Vue
  and TanStack Query, about 9.6k more) plus one-construct fixtures in `test/tsc-fixtures/` is
  parsed with both grammars. A file that tsc accepts and the grammar
  rejects fails CI unless it is already in the baseline. On the first set, upstream v0.23.2
  fails 259 files; this fork fails none. On the second, it fails none
  either.
- **Tree accuracy** ([docs/accuracy.md](docs/accuracy.md)): the first set of corpora, node by node.
  Each expression and type node is compared with the node tsc builds (kind and exact span). From
  upstream v0.23.2 to this fork's main, wrong nodes fell from 17,344 to 0 and missed nodes from
  13,071 to 0, out of 6.2 million. Measured on 2026-11-18 against upstream `master` and the 15
  other forks that change the grammar, this fork had the fewest wrong and missed nodes. The next
  best had 6,392 and 5,822. The second set has none either
  ([docs/accuracy.md](docs/accuracy.md#extra-corpora)).
  TypeScript's own test suite is an edge-case corpus for the same check
  ([docs/accuracy.md](docs/accuracy.md#typescript-test-suite)).
- **Corpus tests** (`test/corpus/`) pin node shapes, and node tests in `bindings/node/` pin
  field readings for the trickier cases.

## Provenance and policy

- Based on [marionebl's fork](https://github.com/marionebl/tree-sitter-typescript) (`53071c9`,
  which includes upstream v0.23.2), with commits from
  [dokimasia's fork](https://github.com/dokimasia/tree-sitter-typescript) (authorship kept).
  MIT, as upstream.
- Generated with tree-sitter-cli 0.25.10 (ABI 15).
- **Node types**: every change to `node-types.json` is listed in the [CHANGELOG](CHANGELOG.md),
  because editor queries match on node names. Most fixes change no node types.
- Published as `tree-sitter-typescript-next` on
  [npm](https://www.npmjs.com/package/tree-sitter-typescript-next) and
  [crates.io](https://crates.io/crates/tree-sitter-typescript-next) (see [Usage](#usage)). No
  PyPI release yet; if you need one, open an issue.
- Issues and PRs are welcome. A reproduction that `tsc` accepts is the most useful bug report.

## Usage

TypeScript and TSX grammars for [tree-sitter][].

Because TSX and TypeScript are actually two different dialects, this module defines two grammars. Require them as follows:

```js
require("tree-sitter-typescript").typescript; // TypeScript grammar
require("tree-sitter-typescript").tsx; // TSX grammar
```

For Javascript files with [flow] type annotations you can use the `tsx` parser.

On npm the package is named `tree-sitter-typescript-next`. Installed under upstream's name with
an alias, it replaces `tree-sitter-typescript` without code changes:

```sh
npm install tree-sitter-typescript@npm:tree-sitter-typescript-next
```

In Rust, the crate is named `tree-sitter-typescript-next`, but its library keeps upstream's
name, so it replaces `tree-sitter-typescript` without code changes:

```toml
[dependencies]
tree-sitter-typescript = { package = "tree-sitter-typescript-next", version = "0.25" }
```

```rust
let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT; // or LANGUAGE_TSX
```

[tree-sitter]: https://github.com/tree-sitter/tree-sitter
[flow]: https://flow.org/en/

References

- [TypeScript Language Spec](https://github.com/microsoft/TypeScript/blob/30cb20434a6b117e007a4959b2a7c16489f86069/doc/spec-ARCHIVED.md)
