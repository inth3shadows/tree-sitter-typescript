const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// Expected readings follow tsc's parseImportOrExportSpecifier.
// [source specifier, typeOnly, name, alias]
const cases = [
  ['type', false, 'type', null],
  ['type as T', false, 'type', 'T'],
  ['type as type', false, 'type', 'type'],
  ['type as "s"', false, 'type', '"s"'],
  ['type as as', false, 'type', 'as'],
  ['type as', true, 'as', null],
  ['type as as x', true, 'as', 'x'],
  ['type as as as', true, 'as', 'as'],
  ['type as as type', true, 'as', 'type'],
  ['type type', true, 'type', null],
  ['type type as T', true, 'type', 'T'],
  ['type x as type', true, 'x', 'type'],
  ['type x as as', true, 'x', 'as'],
  ['x as type', false, 'x', 'type'],
  ['as as as', false, 'as', 'as'],
];

for (const [dialect, language] of [['typescript', require('./typescript')], ['tsx', require('./tsx')]]) {
  const parser = new Parser();
  parser.setLanguage(language);

  for (const [spec, typeOnly, name, alias] of cases) {
    for (const prefix of ['export', 'export type']) {
      const source = `${prefix} { ${spec} } from './a';`;
      test(`${dialect}: ${source}`, () => {
        const tree = parser.parse(source);
        assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
        const specifiers = tree.rootNode.descendantsOfType('export_specifier');
        assert.equal(specifiers.length, 1);
        const node = specifiers[0];
        assert.equal(node.childForFieldName('name').text, name);
        assert.equal(node.childForFieldName('alias')?.text ?? null, alias);
        const modifier = node.child(0);
        assert.equal(!modifier.isNamed && modifier.type === 'type', typeOnly);
      });
    }
  }

  test(`${dialect}: type-named specifiers in a list`, () => {
    const tree = parser.parse("export { type, type as as, type as, x } from './a';");
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    const names = tree.rootNode.descendantsOfType('export_specifier')
      .map((n) => n.childForFieldName('name').text);
    assert.deepEqual(names, ['type', 'type', 'as', 'x']);
  });

  test(`${dialect}: local export of a binding named type`, () => {
    const tree = parser.parse('const type = 1;\nexport { type, type as default };');
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  });
}
