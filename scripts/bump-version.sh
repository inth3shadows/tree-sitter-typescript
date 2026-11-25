#!/usr/bin/env bash
# Sets the package version everywhere it is written, turns the CHANGELOG's
# `## Unreleased` heading into the version, and regenerates both parsers (parser.c
# embeds the version). Fails unless the regenerated parsers differ only in their
# version fields. Used by the weekly release workflow; also runs by hand.
#
# Usage: scripts/bump-version.sh X.Y.Z   (needs `npm ci` first, for the pinned tree-sitter CLI)
set -euo pipefail

new=${1:-}
if [[ ! $new =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "usage: $0 X.Y.Z" >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"

old=$(node -p "require('./package.json').version")
if [[ $old == "$new" ]]; then
  echo "the version is already $new" >&2
  exit 2
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "the working tree has changes; commit or stash them first" >&2
  exit 1
fi

# Replaces the one line that is exactly $2 in file $1 with $3, and checks it took.
replace_line() {
  local file=$1 from=$2 to=$3 count
  count=$(grep -cxF -- "$from" "$file" || true)
  if [[ $count != 1 ]]; then
    echo "$file: expected one line '$from', found $count" >&2
    exit 1
  fi
  FROM=$from TO=$to perl -0pi -e 's/^\Q$ENV{FROM}\E$/$ENV{TO}/m' "$file"
  if [[ $(grep -cxF -- "$to" "$file" || true) != 1 ]]; then
    echo "$file: the line '$to' is not there once after the edit" >&2
    exit 1
  fi
}

replace_line CHANGELOG.md '## Unreleased' "## $new"
replace_line Cargo.toml "version = \"$old\"" "version = \"$new\""
replace_line pyproject.toml "version = \"$old\"" "version = \"$new\""
replace_line common/common.mak "VERSION := $old" "VERSION := $new"
replace_line CMakeLists.txt "        VERSION \"$old\"" "        VERSION \"$new\""
replace_line tree-sitter.json "    \"version\": \"$old\"," "    \"version\": \"$new\","
# Cargo.lock: only this package's entry (a dependency may share the version string).
OLD=$old NEW=$new perl -0pi -e \
  's/(name = "tree-sitter-typescript-next"\nversion = ")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/ or die "Cargo.lock: package entry not found\n"' \
  Cargo.lock
# package.json and package-lock.json (root entries only).
npm version "$new" --no-git-tag-version >/dev/null

for dialect in typescript tsx; do
  (cd "$dialect" && npx tree-sitter generate)
done

# Regenerating must change nothing but the version: same grammar.json and
# node-types.json, and only the version fields of parser.c.
if ! git diff --quiet -- typescript/src/grammar.json tsx/src/grammar.json \
  typescript/src/node-types.json tsx/src/node-types.json; then
  echo "tree-sitter generate changed grammar.json or node-types.json; the generated files were stale" >&2
  exit 1
fi
other=$(git diff --unified=0 -- typescript/src/parser.c tsx/src/parser.c |
  grep -E '^[-+]' | grep -vE '^(\+\+\+|---) (a/|b/|/dev/null)' |
  grep -vE '^[-+] +\.(major|minor|patch)_version = [0-9]+,$' || true)
if [[ -n $other ]]; then
  echo "tree-sitter generate changed parser.c beyond its version fields:" >&2
  echo "$other" | head -20 >&2
  exit 1
fi

if [[ $(node -p "require('./package.json').version") != "$new" ]]; then
  echo "package.json is not at $new after npm version" >&2
  exit 1
fi
echo "bumped $old -> $new"
