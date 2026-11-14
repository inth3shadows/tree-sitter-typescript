const assert = require('node:assert/strict');
const { test } = require('node:test');
const Parser = require('tree-sitter');

// `using` declarations (#69). The corpus cannot show unnamed tokens, so the
// `kind` field is checked here. Its shape follows tree-sitter-javascript v0.25:
// `using`, or `await` and `using`.
// [source, node type, kind tokens, declared name]
const cases = [
  ['for (using h of y) {}', 'for_in_statement', 'using', 'h'],
  ['for (await using h of y) {}', 'for_in_statement', 'await using', 'h'],
  ['for await (await using h of y) {}', 'for_in_statement', 'await using', 'h'],
  ['for await (using h of y) {}', 'for_in_statement', 'using', 'h'],
  ['for (using as of y) {}', 'for_in_statement', 'using', 'as'],
  ['for (using satisfies of y) {}', 'for_in_statement', 'using', 'satisfies'],
  ['for (let x of y) {}', 'for_in_statement', 'let', 'x'],
  ['using x = f();', 'using_declaration', 'using', 'x'],
  ['await using x = f();', 'using_declaration', 'await using', 'x'],
  ['using as = f();', 'using_declaration', 'using', 'as'],
  ['using of = f();', 'using_declaration', 'using', 'of'],
  ['for (await using x = f();;) {}', 'using_declaration', 'await using', 'x'],
  // `using` as the left side or an expression, not a declaration
  ['for (using of y) {}', 'for_in_statement', '', 'using'],
  ['for (using in o) {}', 'for_in_statement', '', 'using'],
];

// tsc reports a parse error for these; so does the grammar.
const errors = [
  'for (using of of y) {}',
  'f(using x = 1);',
  'let y = using x = 1;',
];

const declaredName = (node) => node.type === 'for_in_statement'
  ? node.childForFieldName('left')
  : node.namedChildren[0].childForFieldName('name');

for (const [dialect, language] of [['typescript', require('./typescript')], ['tsx', require('./tsx')]]) {
  const parser = new Parser();
  parser.setLanguage(language);
  for (const [source, type, kind, name] of cases) {
    test(`${dialect}: ${source}`, () => {
      const tree = parser.parse(`async function f() { ${source} }`);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
      const node = tree.rootNode.descendantsOfType(type)[0];
      assert.equal(node.childrenForFieldName('kind').map((n) => n.type).join(' '), kind);
      assert.equal(declaredName(node).text, name);
    });
  }
  for (const source of errors) {
    test(`${dialect}: ${source} is an error`, () => {
      assert.equal(parser.parse(`async function f() { ${source} }`).rootNode.hasError, true);
    });
  }
}
