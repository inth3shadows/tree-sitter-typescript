# tsc differential

`tsc` is the ground truth for "is this file syntactically valid TypeScript". This job
builds this repo's `typescript` and `tsx` grammars to wasm and checks them against tsc
over pinned real-world corpora, on every grammar change. It only compares whether a file
has a parse error; node shapes are pinned by the corpus tests in `test/corpus/`.

## What it checks

`scripts/ts-differential.mjs` parses every `.ts`/`.tsx`/`.mts`/`.cts` file (`.d.ts`
included, `node_modules` excluded) in a set of pinned corpora with both parsers:

- **oracle**: `ts.createSourceFile(...).parseDiagnostics` (syntax only, no type check);
- **grammar**: `tree.rootNode.hasError` (`.tsx` uses the tsx wasm, everything else the typescript wasm).

Each file lands in one class: `agree-ok`, `agree-err` (both report an error),
`DIVERGENT` (tsc accepts it, tree-sitter reports an error) or `tsc-only-err` (counted only).

The baseline (`scripts/ts-differential.baseline.json`) is `divergent: {corpus: {path: firstErrorRow}}`
(an old array-of-paths baseline is still read, with unknown rows, and rewritten by `--update`).

The run **fails with exit 1** when:

- a `DIVERGENT` file is not in the baseline (printed as `corpus:path:row`);
- (pinned corpora only) a baselined `DIVERGENT` file's first error row moved **earlier** than the
  baselined row: a new error inside an already-divergent file (printed as `corpus:path:row (was R)`).
  The pinned code never changes, so the grammar changed error recovery or the pin moved: re-baseline
  with `--update` if that is intended. A later row is an improvement (reported, suggests `--update`,
  does not fail); an unknown baselined row accepts any row. The `local` corpus is exempt from this
  row gate (its rows shift whenever a fixture is edited, and it is strict per file already, below);
- (`local` fixtures only) tsc reports any syntax error in a fixture ("fixture is not valid TypeScript"),
  or a fixture that is not a gap fixture (`gap-*`) is `DIVERGENT`, even if baselined.

It **fails with exit 2** (setup) on bad args, a fetch failure, a corpus that scans 0 files,
a version mismatch, a blind oracle or grammar (see Canaries), a baselined path that is
absent from the run (`vanished`: renamed, deleted, wrong corpus root), on a full run a baseline
corpus that is no longer in `corpora.json`, a malformed baseline (a row must be a non-negative
integer, or the corpus an old-format array; anything else names the corpus and path), or
`WASM_RUNTIME_FLAGS` drifting from the source (below). Vanished paths are never counted as
`now-agree`; confirm the change and re-baseline. Every exit-2 path also appends
`## TS grammar differential` + `**Setup error:** <message>` to `$GITHUB_STEP_SUMMARY`
(best-effort), so the job summary is never empty.

Reported, never failing: `now-agree` counts only baselined paths that are now `agree-ok`; a
baselined path that tsc now rejects too is counted as `now-err`; `improved` is above.
The in-repo fixtures (`test/tsc-fixtures/`, one small file per modern construct) are
baselined the same way. `gap-*.ts` fixtures record constructs tsc accepts that the
grammar does not parse yet, **one construct per file** so fixing one is visible. A grammar that
fixes one reports it as `now-agree`, which is how a candidate grammar or fork is compared with ours.

Canaries (fail closed, exit 2): `sf.parseDiagnostics` must be an array, `let x: = ;` must
yield diagnostics and `let x: number = 1;` none under `ScriptKind.TS`, and under `ScriptKind.TSX`
`const a = <div>;` must yield diagnostics and `const a = <div />;` none (else the tsc oracle is blind); in both wasm grammars `let x: = ;` must
`hasError` and `let x: number = 1;` must not.

Corpora (`scripts/ts-differential.corpora.json`, pinned by SHA): Effect, Zod,
Excalidraw, VS Code `src/`, plus the fixtures.

## Run it

```bash
npm ci --ignore-scripts && npm rebuild tree-sitter-cli   # pinned tsc, web-tree-sitter, CLI
npm run build:wasm                               # tree-sitter-{typescript,tsx}.wasm at the repo root
node scripts/ts-differential.mjs                 # all corpora
node scripts/ts-differential.mjs --only local    # just the fixtures (fast)
node scripts/ts-differential.mjs --json out.json # full per-file results (first error row each)
```

The script re-execs itself once under `node --liftoff-only` (V8's optimizing wasm compiler
can run out of Zone memory on a grammar this size), so a plain `node scripts/ts-differential.mjs`
is fine. `TS_DIFF_RELAUNCHED` guards the loop; if it is set but `--liftoff-only` is missing
from `process.execArgv`, the run exits 2 rather than running unflagged.

Corpora are cloned (depth 1; VS Code blobless + sparse `src/`) into
`$TS_DIFF_CACHE`, default `~/.cache/tree-sitter-typescript-differential/<name>-<sha12>` (CI: `$RUNNER_TEMP/ts-diff-cache`) (plus `-<sha1(subdir)[0:8]>`
for a sparse corpus), and re-used on later runs only if the completion marker (JSON `{sha, subdir}`)
matches. The first run downloads a few hundred MB.

Exit codes: `0` ok, `1` gate failure (above), `2` setup failure (above) or the installed
`typescript` / `web-tree-sitter` version differs from the baseline's.

## Re-baseline

```bash
node scripts/ts-differential.mjs --update
```

Rewrites `scripts/ts-differential.baseline.json` (versions, wasm sha256, sorted
divergent paths per corpus, each with its first error row). It refuses (exit 1) if a local
fixture is not valid TypeScript or a non-gap fixture diverges. Review the diff and commit it
with the change that caused it.
Re-baseline when:

- a grammar patch lands and the report says files `now-agree` / `improved` (the baseline should shrink);
- the report lists `vanished` paths (a fixture was renamed or removed);
- `typescript` or `web-tree-sitter` is bumped (exit 2 asks for this): check that new
  divergences are real grammar gaps and not an oracle change;
- a corpus pin changes.

Never re-baseline to silence a new divergence on a file that tsc accepts: fix the
grammar, or record the gap deliberately in the commit message.

## CI

`.github/workflows/differential.yml` runs on PRs and pushes to `main` that touch the grammar
(`common/`, `*/grammar.js`, `*/src/`), the script, corpora, baseline or fixtures, or
`package.json` / `package-lock.json`. It first checks that the checked-in `src/` is what
`tree-sitter generate` produces, then builds the wasm (in the emscripten Docker image) and runs
the differential. The job summary lists per-corpus counts and the first 20 new divergences as
`corpus:path:line`. The `--json` results are uploaded as the `ts-differential-json` artifact
(14 days, even when the job fails). The corpus cache lives in `$RUNNER_TEMP/ts-diff-cache`
(`actions/cache` rejects a `path` containing `..`), is restored up front, and is saved with
`if: always()` once a corpus has finished fetching, so a failing run still keeps the downloads.

## Adding a fixture

Add one small file to `test/tsc-fixtures/` for **one** construct tsc accepts, and
run `node scripts/ts-differential.mjs --only local`. If the current grammar parses it,
you're done. If it doesn't, name the file `gap-<construct>.ts` and re-baseline
(`--update`), so the gap is recorded and its fix shows up as `now-agree`. A file that is not
valid TypeScript, or a non-gap name that diverges, fails the run and blocks `--update`.

## Triage upstream issues

`npm run triage` (after `npm run build:wasm`; needs `gh`) runs the same oracle over the
code blocks in upstream's open issues and prints the ones this fork still gets wrong:
`DIVERGENT` (tsc parses the snippet, tree-sitter errors) or `TIMEOUT` (a parse over 5s).
`--all` prints every issue, `--state all` includes closed ones, `--issue N` checks one,
`--wasm-dir DIR` points at another build (e.g. upstream's, to see what the fork already
fixed), `--json PATH` keeps per-snippet results. It reads `hasError` only: an issue about a
wrong but error-free tree, or about queries, reads `agree-ok`. It costs seconds and no
judgment, so run it before reading issues by hand.
