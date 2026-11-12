const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// A raw NUL byte (U+0000) is template content, as tsc reads it (#61). The
// corpus format cannot hold one without git treating the file as binary, so
// these cases live here.
const parsers = {
  typescript: new Parser(),
  tsx: new Parser(),
};
parsers.typescript.setLanguage(require('./typescript'));
parsers.tsx.setLanguage(require('./tsx'));

const cases = [
  'let a = `x\0y`;',
  'let b = `\0`;',
  'let c = `a${1}\0b`;',
  'let d = `a\0${1}\0`;',
  'let e = tag`\0`;',
];

for (const [dialect, parser] of Object.entries(parsers)) {
  for (const source of cases) {
    test(`${dialect}: ${JSON.stringify(source)}`, () => {
      const root = parser.parse(source).rootNode;
      assert.equal(root.hasError, false, root.toString());
      assert.ok(root.descendantsOfType('template_string').length > 0, root.toString());
    });
  }
}

test('an unterminated template still ends at the end of input', () => {
  const root = parsers.typescript.parse('let a = `abc').rootNode;
  assert.equal(root.hasError, true);
});
