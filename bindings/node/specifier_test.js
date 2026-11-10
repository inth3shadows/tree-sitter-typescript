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

// Each case also runs inside a type-only clause (`import type { ... }`,
// `export type { ... }`); the specifier reading must not change there.
const statements = {
  i: [(spec) => `import { ${spec} } from './a';`, (spec) => `import type { ${spec} } from './a';`],
  e: [(spec) => `export { ${spec} } from './a';`, (spec) => `export type { ${spec} } from './a';`],
};
const statement = { i: statements.i[0], e: statements.e[0] };

// Flow's `typeof` modifier: tsc rejects these, but they parsed before #31
// and must keep the modifier reading. [specifier, name, alias, kinds]
const flowTypeofCases = [
  ['typeof x', 'x', null, 'ie'],
  ['typeof x as y', 'x', 'y', 'ie'],
  ['typeof as', 'as', null, 'ie'],
  ['typeof as as x', 'as', 'x', 'ie'],
  ['typeof as as as', 'as', 'as', 'ie'],
  ['typeof as as type', 'as', 'type', 'ie'],
];
const nodeType = { i: 'import_specifier', e: 'export_specifier' };

for (const [dialect, language] of [['typescript', require('./typescript')], ['tsx', require('./tsx')]]) {
  const parser = new Parser();
  parser.setLanguage(language);

  for (const [spec, typeOnly, name, alias, kinds] of cases) {
    for (const source of [...kinds].flatMap((kind) => statements[kind].map((make) => [kind, make(spec)]))) {
      const [kind, text] = source;
      test(`${dialect}: ${text}`, () => {
        const source = text;
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

  for (const [spec, name, alias, kinds] of flowTypeofCases) {
    for (const kind of kinds) {
      const source = statement[kind](spec);
      test(`${dialect}: Flow typeof modifier: ${source}`, () => {
        const tree = parser.parse(source);
        assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
        const node = tree.rootNode.descendantsOfType(nodeType[kind])[0];
        assert.equal(node.child(0).type, 'typeof');
        assert.equal(node.childForFieldName('name').text, name);
        assert.equal(node.childForFieldName('alias')?.text ?? null, alias);
      });
    }
  }

  test(`${dialect}: an import cannot bind the reserved word typeof`, () => {
    const tree = parser.parse("import { typeof } from './a';");
    assert.equal(tree.rootNode.hasError, true, tree.rootNode.toString());
  });

  test(`${dialect}: local export of a binding named type`, () => {
    const tree = parser.parse('const type = 1;\nexport { type, type as default };');
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  });
}
