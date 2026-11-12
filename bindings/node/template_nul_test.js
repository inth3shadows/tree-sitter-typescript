const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// A raw NUL byte (U+0000) is template content, as tsc reads it (#61). The
// corpus format cannot hold one without git treating the file as binary, so
// these cases live here. The timeout turns a scanner loop at end of input into
// a failure instead of a hung run.
const opts = { timeout: 5000 };
const parsers = {
  typescript: new Parser(),
  tsx: new Parser(),
};
parsers.typescript.setLanguage(require('./typescript'));
parsers.tsx.setLanguage(require('./tsx'));

// [source, node kind that must appear, text one string_fragment must equal]
const cases = [
  ['let a = `x\0y`;', 'template_string', 'x\0y'],
  ['let b = `\0`;', 'template_string', '\0'],
  ['let c = `a${1}\0b`;', 'template_string', '\0b'],
  ['let d = `a\0${1}\0`;', 'template_string', 'a\0'],
  ['let e = tag`\0`;', 'template_string', '\0'],
  ['let f = `$\0`;', 'template_string', null],
  ['type T = `a\0${string}`;', 'template_literal_type', null],
];

for (const [dialect, parser] of Object.entries(parsers)) {
  for (const [source, kind, fragment] of cases) {
    test(`${dialect}: ${JSON.stringify(source)}`, opts, () => {
      const root = parser.parse(source).rootNode;
      assert.equal(root.hasError, false, root.toString());
      assert.ok(root.descendantsOfType(kind).length > 0, root.toString());
      if (fragment !== null) {
        const texts = root.descendantsOfType('string_fragment').map((n) => n.text);
        assert.ok(texts.includes(fragment), JSON.stringify(texts));
      }
    });
  }

  for (const source of ['let a = `abc', 'let a = `abc\0', 'let a = `\0\0']) {
    test(`${dialect}: unterminated ${JSON.stringify(source)} ends at the end of input`, opts, () => {
      assert.equal(parser.parse(source).rootNode.hasError, true);
    });
  }
}
