const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// Expected readings follow tsc's parseImportOrExportSpecifier, which both
// import and export specifiers share.
// [source specifier, typeOnly, name, alias, kinds]
const cases = [
  ['type', false, 'type', null, 'ie'],
  ['type as T', false, 'type', 'T', 'ie'],
  ['type as type', false, 'type', 'type', 'ie'],
  ['type as "s"', false, 'type', '"s"', 'e'],
  ['type as as', false, 'type', 'as', 'ie'],
  ['type as', true, 'as', null, 'ie'],
  ['type as as x', true, 'as', 'x', 'ie'],
  ['type as as as', true, 'as', 'as', 'ie'],
  ['type as as type', true, 'as', 'type', 'ie'],
  ['type type', true, 'type', null, 'ie'],
  ['type type as T', true, 'type', 'T', 'ie'],
  ['type x as type', true, 'x', 'type', 'ie'],
  ['type x as as', true, 'x', 'as', 'ie'],
  ['type "s" as x', true, '"s"', 'x', 'ie'],
  ['x as type', false, 'x', 'type', 'ie'],
  ['as as as', false, 'as', 'as', 'ie'],
  ['typeof', false, 'typeof', null, 'e'],
  ['typeof as x', false, 'typeof', 'x', 'ie'],
  ['typeof as as', false, 'typeof', 'as', 'ie'],
  ['typeof as type', false, 'typeof', 'type', 'ie'],
  ['typeof as "s"', false, 'typeof', '"s"', 'e'],
];

const statement = {
  i: (spec) => `import { ${spec} } from './a';`,
  e: (spec) => `export { ${spec} } from './a';`,
};
const nodeType = { i: 'import_specifier', e: 'export_specifier' };

for (const [dialect, language] of [['typescript', require('./typescript')], ['tsx', require('./tsx')]]) {
  const parser = new Parser();
  parser.setLanguage(language);

  for (const [spec, typeOnly, name, alias, kinds] of cases) {
    for (const kind of kinds) {
      const source = statement[kind](spec);
      test(`${dialect}: ${source}`, () => {
        const tree = parser.parse(source);
        assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
        const specifiers = tree.rootNode.descendantsOfType(nodeType[kind]);
        assert.equal(specifiers.length, 1);
        const node = specifiers[0];
        assert.equal(node.childForFieldName('name').text, name);
        assert.equal(node.childForFieldName('alias')?.text ?? null, alias);
        const first = node.child(0);
        assert.equal(!first.isNamed && first.type === 'type', typeOnly);
      });
    }
  }

  for (const kind of 'ie') {
    test(`${dialect}: ${kind === 'i' ? 'import' : 'export'} keyword-named specifiers in a list`, () => {
      const source = statement[kind]('type, type as as, type as, typeof as t, x');
      const tree = parser.parse(source);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      const names = tree.rootNode.descendantsOfType(nodeType[kind])
        .map((n) => n.childForFieldName('name').text);
      assert.deepEqual(names, ['type', 'type', 'as', 'typeof', 'x']);
    });
  }

  test(`${dialect}: Flow-style typeof modifier still parses`, () => {
    for (const source of ["import { typeof x } from './a';", "import { typeof x as y } from './a';"]) {
      const tree = parser.parse(source);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      assert.equal(tree.rootNode.descendantsOfType('import_specifier')[0].child(0).type, 'typeof');
    }
  });

  test(`${dialect}: local export of a binding named type`, () => {
    const tree = parser.parse('const type = 1;\nexport { type, type as default };');
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  });
}
