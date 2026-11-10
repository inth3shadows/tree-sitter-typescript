const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// Deliberate leniency (docs/differential.md, "Known leniency"): the tsx grammar
// accepts a generic arrow written `<T>(x) => x`, which tsc rejects in .tsx.
// It must never cost valid JSX that starts the same way.
const tsx = new Parser();
tsx.setLanguage(require('./tsx'));
const typescript = new Parser();
typescript.setLanguage(require('./typescript'));

// [dialect, source, hasError, node kind that must appear]
const cases = [
  ['tsx', 'const f = <T>(x: T) => x;', false, 'arrow_function'],
  ['tsx', 'const f = <T,>(x: T) => x;', false, 'arrow_function'],
  ['tsx', 'const e = <b>(x)</b>;', false, 'jsx_element'],
  ['tsx', 'const e = <T>(x)</T>;', false, 'jsx_element'],
  ['tsx', 'const e = <T>(x) =&gt; x</T>;', false, 'jsx_element'],
  ['typescript', 'const f = <T>(x: T) => x;', false, 'arrow_function'],
  ['typescript', 'let a = <string>x;', false, 'type_assertion'],
  ['tsx', 'let a = <string>x;', true, null],
];

for (const [dialect, source, hasError, kind] of cases) {
  test(`${dialect}: ${source}`, () => {
    const root = (dialect === 'tsx' ? tsx : typescript).parse(source).rootNode;
    assert.equal(root.hasError, hasError, root.toString());
    if (kind) assert.ok(root.descendantsOfType(kind).length > 0, root.toString());
  });
}
