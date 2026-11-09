const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');
const TSX = require('./tsx');

function parse(source) {
  const parser = new Parser();
  parser.setLanguage(TSX);
  return parser.parse(source).rootNode;
}

for (const text of [
  'Privacy & Data', 'AT&T', '&', 'A && B', 'a &# b', 'a &amp b',
  'a &notareference b', 'a &; b', 'trailing &', '&leading', 'a &\n  b',
]) {
  test('JSX literal ampersand text: ' + JSON.stringify(text), () => {
    const root = parse('const value = <div>' + text + '</div>;');
    assert.equal(root.hasError, false);
    assert.equal(root.descendantsOfType('jsx_text').map(n => n.text).join(''), text);
    assert.equal(root.descendantsOfType('html_character_reference').length, 0);
  });
}

for (const quote of ['"', "'"]) {
  for (const value of [
    'https://example.test/?a=1&b=2', '&', 'trailing&', '&leading',
    'A & B', 'a && b', '&#', '&unknown', 'a&1',
  ]) {
    test('JSX literal ampersand attribute: ' + quote + value + quote, () => {
      const root = parse('const value = <a title=' + quote + value + quote + ' />;');
      assert.equal(root.hasError, false);
      const string = root.descendantsOfType('string')[0];
      assert.equal(string.text, quote + value + quote);
      assert.equal(string.namedChildren.map(n => n.text).join(''), value);
      assert.equal(root.descendantsOfType('html_character_reference').length, 0);
    });
  }
}

test('JSX keeps named and numeric character-reference nodes', () => {
  const root = parse('<div title="&amp; &#38; &#x26;">&amp; &#38; &#x26;</div>;');
  assert.equal(root.hasError, false);
  // Every quoted content token is immediate: spaces remain literal fragments,
  // rather than trivia absorbed into a later entity's range.
  assert.deepEqual(root.descendantsOfType('html_character_reference').map(n => n.text),
    ['&amp;', '&#38;', '&#x26;', '&amp;', '&#38;', '&#x26;']);
  assert.equal(root.descendantsOfType('string')[0].namedChildren.map(n => n.text).join(''),
    '&amp; &#38; &#x26;');
});

test('a bare ampersand before an entity does not swallow the entity', () => {
  const root = parse('<div title="&&amp;">&&amp;</div>;');
  assert.equal(root.hasError, false);
  assert.deepEqual(root.descendantsOfType('html_character_reference').map(n => n.text),
    ['&amp;', '&amp;']);
});

test('literal attribute fragments preserve every byte across ampersands', () => {
  const root = parse('<div title="A & B" />;');
  assert.equal(root.hasError, false);
  assert.deepEqual(root.descendantsOfType('string_fragment').map(n => n.text), ['A ', '&', ' B']);
  assert.equal(root.descendantsOfType('string_fragment').map(n => n.text).join(''), 'A & B');
});

test('mixed attribute runs keep both entity lexemes and all literal text', () => {
  const root = parse('<div title="&&amp; &#38;" />;');
  assert.equal(root.hasError, false);
  const string = root.descendantsOfType('string')[0];
  assert.equal(string.namedChildren.map(n => n.text).join(''), '&&amp; &#38;');
  const entities = root.descendantsOfType('html_character_reference');
  assert.deepEqual(entities.map(n => n.text.trimStart()), ['&amp;', '&#38;']);
  assert.deepEqual(entities.map(n => n.startIndex + n.text.length - n.text.trimStart().length), [13, 19]);
});

test('JSX text queries capture literal ampersands and entities', () => {
  const root = parse('<div>A & B &amp; C</div>;');
  assert.equal(root.hasError, false);
  const query = new Parser.Query(TSX, '[(jsx_text) (html_character_reference)] @content');
  assert.equal(query.captures(root).map(capture => capture.node.text).join(''), 'A & B &amp; C');
});

test('entity queries capture immediate quoted references', () => {
  const root = parse('<a title="&&amp; /* &#38; */"/>;');
  assert.equal(root.hasError, false);
  const query = new Parser.Query(TSX, '(html_character_reference) @entity');
  assert.deepEqual(query.captures(root).map(capture => capture.node.text), ['&amp;', '&#38;']);
});

for (const quote of ['"', "'"]) {
  for (const value of ['&&amp;//&#38;', '&&amp;/*&#38;*/', '&amp;//&#38;', '&amp;/*&#38;*/',
    '&&amp;-->&#38;', '&&amp;<!--&#38;', '&amp;-->&#38;', '&amp;<!--&#38;',
  ]) {
    test('comment markers stay inside quoted JSX payload: ' + quote + value + quote, () => {
      const root = parse('<a title=' + quote + value + quote + '/>;');
      assert.equal(root.hasError, false);
      assert.equal(root.descendantsOfType(['comment', 'html_comment']).length, 0);
      const string = root.descendantsOfType('string')[0];
      assert.equal(string.text, quote + value + quote);
      assert.equal(string.namedChildren.map(n => n.text).join(''), value);
      assert.deepEqual(root.descendantsOfType('html_character_reference').map(n => n.text.trimStart()),
        ['&amp;', '&#38;']);
    });
  }
}

test('comments outside quoted JSX attributes remain comments', () => {
  const root = parse('/* outside */ <a /* attribute */ title=/* value */ "&amp;" other={/* expression */ 1}/>;');
  assert.equal(root.hasError, false);
  assert.equal(root.descendantsOfType('comment').length, 4);
  const html = parse('<!-- outside\n<a title="&amp;"/>;');
  assert.equal(html.hasError, false);
  assert.equal(html.descendantsOfType('html_comment').length, 1);
});

test('ampersands remain operators and ordinary string contents outside JSX', () => {
  const root = parse('const result = a & b; const text = "A & B"; <div>{a & b}</div>;');
  assert.equal(root.hasError, false);
  assert.equal(root.descendantsOfType('binary_expression').length, 2);
  assert.equal(root.descendantsOfType('html_character_reference').length, 0);
});

for (const text of ['a > b', 'a } b', 'x => y']) {
  test('JSX still rejects unescaped delimiters: ' + text, () => {
    assert.equal(parse('<div>' + text + '</div>;').hasError, true);
  });
}
