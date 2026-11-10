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
  Excalidraw and VS Code `src/`, about 14.5k files) plus one-construct fixtures in
  `test/tsc-fixtures/` is parsed with both grammars. A file that tsc accepts and the grammar
  rejects fails CI unless it is already in the baseline. On those corpora, upstream v0.23.2
  fails 259 files; this fork fails 2.
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
- No npm, crates.io or PyPI releases yet; depend on a commit of this repository. If you need a
  published package, open an issue.
- Issues and PRs are welcome. A reproduction that `tsc` accepts is the most useful bug report.

## Usage

TypeScript and TSX grammars for [tree-sitter][].

Because TSX and TypeScript are actually two different dialects, this module defines two grammars. Require them as follows:

```js
require("tree-sitter-typescript").typescript; // TypeScript grammar
require("tree-sitter-typescript").tsx; // TSX grammar
```

For Javascript files with [flow] type annotations you can use the `tsx` parser.

[tree-sitter]: https://github.com/tree-sitter/tree-sitter
[flow]: https://flow.org/en/

References

- [TypeScript Language Spec](https://github.com/microsoft/TypeScript/blob/30cb20434a6b117e007a4959b2a7c16489f86069/doc/spec-ARCHIVED.md)
