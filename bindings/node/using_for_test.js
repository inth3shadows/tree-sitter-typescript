const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// A `using` declaration in a for-of head (#69). The corpus cannot show unnamed
// tokens, so the `kind` field and the `await` before it are checked here.
// [source, kind, await before kind, left]
const cases = [
  ['for (using h of y) {}', 'using', false, 'h'],
  ['for (await using h of y) {}', 'using', true, 'h'],
  ['for await (await using h of y) {}', 'using', true, 'h'],
  ['for await (using h of y) {}', 'using', false, 'h'],
  ['for (using as of y) {}', 'using', false, 'as'],
  ['for (let x of y) {}', 'let', false, 'x'],
  // `using` as the left side, not a declaration
  ['for (using of y) {}', null, false, 'using'],
  ['for (using in o) {}', null, false, 'using'],
];

for (const [dialect, language] of [['typescript', require('./typescript')], ['tsx', require('./tsx')]]) {
  const parser = new Parser();
  parser.setLanguage(language);
  for (const [source, kind, awaitBefore, left] of cases) {
    test(`${dialect}: ${source}`, () => {
      const tree = parser.parse(`async function f() { ${source} }`);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      const loop = tree.rootNode.descendantsOfType('for_in_statement')[0];
      const kindNode = loop.childForFieldName('kind');
      assert.equal(kindNode ? kindNode.type : null, kind);
      assert.equal(loop.childForFieldName('left').text, left);
      const before = kindNode && kindNode.previousSibling;
      assert.equal(Boolean(before && before.type === 'await'), awaitBefore);
    });
  }
}
