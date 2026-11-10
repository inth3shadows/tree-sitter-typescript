const JavaScript = require('tree-sitter-javascript/grammar');

// Keywords a tuple label may be (`[symbol: string]`, `[readonly: T]`). Each already
// lexes as a keyword where a type starts, so accepting it as a label changes nothing
// else. Not every such word is here: void, null, undefined, this, typeof, infer,
// unique, true, false, import and abstract still fail as labels. And a contextual
// keyword that lexes as an identifier there (type, get, declare...) must NOT be
// listed: that would make `[type]` (a type named type) fail.
const TUPLE_LABEL_KEYWORDS = [
  'any', 'number', 'boolean', 'string', 'symbol', 'object', 'never', 'unknown',
  'readonly', 'new', 'keyof',
];

module.exports = function defineGrammar(dialect) {
  return grammar(JavaScript, {
    name: dialect,

    externals: ($, previous) => previous.concat([
      $._function_signature_automatic_semicolon,
      $.__error_recovery,
      // never produced. It is valid only between a member's
      // name and its signature, so the scanner can tell that a `<` or `(` on
      // the next line continues that member (tsc reads `find\n<T>(id): T` as
      // one method) rather than starting a call signature.
      $._member_signature_marker,
      // never produced. It is valid only where a class or object-type member
      // ends, so the scanner knows a member named `in` may start on the next
      // line (and not in a `for (var k\n in o)` header, where `in` is the operator).
      $._member_end_marker,
      // never produced. Valid right after `new` and a statement-level `export`,
      // where tsc continues the construct across any line break.
      $._no_asi_marker,
      // never produced. Valid right after `let`: tsc continues the declaration
      // across a line break only before a binding identifier, `[` or `{`.
      $._let_marker,
      // never produced. Valid right after a class or interface member's `static`,
      // `get` or `set`: tsc continues the member before a property name.
      $._modifier_marker,
      // never produced. Valid right after an export clause, so the scanner lets
      // `from` on the next line continue the statement.
      $._from_marker,
    ], dialect === 'tsx' ? [$._jsx_string_marker] : []),

    supertypes: ($, previous) => previous.concat([
      $.type,
      $.primary_type,
    ]),

    precedences: ($, previous) => previous.concat([
      [
        'call',
        'instantiation',
        'unary',
        'binary',
        $.await_expression,
        $.arrow_function,
      ],
      [
        'extends',
        'instantiation',
      ],
      [
        $.intersection_type,
        $.union_type,
        $.conditional_type,
        $.function_type,
        'binary',
        $.type_predicate,
        $.readonly_type,
      ],
      [$.mapped_type_clause, $.primary_expression],
      [$.accessibility_modifier, $.primary_expression],
      ['unary_void', $.expression],
      [$.extends_clause, $.primary_expression],
      ['unary', 'assign'],
      ['declaration', $.expression],
      [$.predefined_type, $.unary_expression],
      [$.type, $.flow_maybe_type],
      [$.tuple_type, $.array_type, $.pattern, $.type],
      [$.readonly_type, $.pattern],
      [$.readonly_type, $.primary_expression],
      [$.subscript_expression, $.expression],
      [$.type_query, $._type_query_subscript_expression],
      [$.nested_type_identifier, $.generic_type, $.primary_type, $.lookup_type, $.index_type_query, $.type],
      [$.as_expression, $.satisfies_expression, $.primary_type],
      [$.member_expression, $._type_query_member_expression_in_type_annotation],
      [$._type_query_call_expression, $.primary_expression],
      [$.override_modifier, $.primary_expression],
      [$.decorator_call_expression, $.decorator],
      [$.literal_type, $.pattern],
      [$.predefined_type, $.pattern],
      [$.call_expression, $._type_query_call_expression_in_type_annotation],
      [$.new_expression, $.primary_expression],
      [$.meta_property, $.primary_expression],
      [$.construct_signature, $._property_name],
    ]),

    conflicts: ($, previous) => previous.concat([
      // A tuple label that is also a predefined type: `[any?: T]` vs `[any?]`;
      // the token after `?` decides.
      [$.optional_tuple_parameter, $.predefined_type],
      // `<in out>` (modifier `in`, parameter named `out`)
      // vs `<in out T>`; the token after `out` decides.
      [$.variance],
      [$.call_expression, $.instantiation_expression, $.binary_expression],
      [$.call_expression, $.instantiation_expression, $.binary_expression, $.unary_expression],
      [$.call_expression, $.instantiation_expression, $.binary_expression, $.update_expression],
      [$.call_expression, $.instantiation_expression, $.binary_expression, $.await_expression],

      // This appears to be necessary to parse a parenthesized class expression
      [$.class],

      [$.nested_identifier, $.nested_type_identifier, $.primary_expression],
      [$.nested_identifier, $.nested_type_identifier],

      [$._call_signature, $.function_type],
      [$._call_signature, $.constructor_type],

      [$.primary_expression, $._parameter_name],
      [$.primary_expression, $._parameter_name, $.primary_type],
      [$.primary_expression, $.literal_type],
      [$.primary_expression, $.literal_type, $.rest_pattern],
      [$.primary_expression, $.predefined_type, $.rest_pattern],
      [$.primary_expression, $.primary_type],
      [$.primary_expression, $.generic_type],
      [$.primary_expression, $.predefined_type],
      // `typeof name["x"]` can be a lookup type or a runtime operand of
      // comparisons; a following `.property` rules out the type branch.
      [$.type_query, $.primary_expression],
      [$._type_query_member_expression, $.type_query],
      [$._type_query_instantiation_expression, $.type_query],
      [$._type_query_member_expression, $.primary_expression],
      [$._type_query_instantiation_expression, $.primary_expression],
      [$.primary_expression, $.pattern, $.primary_type],
      [$._parameter_name, $.primary_type],
      [$.pattern, $.primary_type],

      [$.optional_tuple_parameter, $.primary_type],
      [$.rest_pattern, $.primary_type, $.primary_expression],

      [$.object, $.object_type],
      [$.object, $.object_pattern, $.object_type],
      [$.object, $.object_pattern, $._property_name],
      [$.object_pattern, $.object_type],
      [$.object_pattern, $.object_type],

      [$.array, $.tuple_type],
      [$.array, $.array_pattern, $.tuple_type],
      [$.array_pattern, $.tuple_type],

      [$.template_literal_type, $.template_string],

      // `f<typeof import('m')>()` is a call with a type argument, and `a < typeof import('m')` is a
      // comparison, so the parser keeps both until one of them fails.
      [$.call_expression, $._type_query_call_expression],
    ]).concat(
      dialect === 'typescript' ? [
        [$.primary_type, $.type_parameter],
      ] : [
        [$.jsx_opening_element, $.type_parameter],
        [$.jsx_namespace_name, $.primary_type],
      ],
    ),

    inline: ($, previous) => previous
      .filter((rule) => ![
        '_formal_parameter',
        '_call_signature',
      ].includes(rule.name))
      .concat([
        $._type_identifier,
        $._type_query_identifier,
        $._jsx_start_opening_element,
      ]),

    rules: {
      // The field modifier competes with class member names, but the keyword
      // must not steal identifiers from types, expressions or object shorthand.
      _class_member_name: $ => choice(
        $._property_name,
        alias('accessor', $.property_identifier),
      ),

      public_field_definition: $ => seq(
        repeat(field('decorator', $.decorator)),
        optional(choice(
          seq('declare', optional($.accessibility_modifier)),
          seq($.accessibility_modifier, optional('declare')),
        )),
        choice(
          seq(optional(seq('static', optional($._modifier_marker))), optional($.override_modifier), optional('readonly')),
          seq(optional('abstract'), optional('readonly')),
          seq(optional('readonly'), optional('abstract')),
        ),
        optional('accessor'),
        field('name', $._class_member_name),
        optional(choice('?', '!')),
        field('type', optional($.type_annotation)),
        optional($._initializer),
      ),

      // override original catch_clause, add optional type annotation
      catch_clause: $ => seq(
        'catch',
        optional(
          seq(
            '(',
            field(
              'parameter',
              choice($.identifier, $._destructuring_pattern),
            ),
            optional(
              // only types that resolve to 'any' or 'unknown' are supported
              // by the language but it's simpler to accept any type here.
              field('type', $.type_annotation),
            ),
            ')',
          ),
        ),
        field('body', $.statement_block),
      ),

      call_expression: $ => choice(
        prec('call', seq(
          field('function', choice($.expression, $.import)),
          field('type_arguments', optional($.type_arguments)),
          field('arguments', $.arguments),
        )),
        // A tagged template with type arguments, sql<{ id: number }>`SELECT ...`, is
        // ambiguous with `<` / `>` comparisons exactly like f<T>(x), so it takes the
        // generic call's precedence and conflicts rather than template_call's.
        prec('call', seq(
          field('function', choice($.expression, $.import)),
          field('type_arguments', $.type_arguments),
          field('arguments', $.template_string),
        )),
        prec('template_call', seq(
          field('function', choice($.primary_expression, $.new_expression)),
          field('arguments', $.template_string),
        )),
        prec('member', seq(
          field('function', $.primary_expression),
          '?.',
          field('type_arguments', optional($.type_arguments)),
          field('arguments', $.arguments),
        )),
      ),

      new_expression: $ => prec.right('new', seq(
        'new',
        optional($._no_asi_marker),
        field('constructor', $.primary_expression),
        field('type_arguments', optional($.type_arguments)),
        field('arguments', optional($.arguments)),
      )),

      assignment_expression: $ => prec.right('assign', seq(
        optional('using'),
        field('left', choice($.parenthesized_expression, $._lhs_expression)),
        '=',
        field('right', $.expression),
      )),

      _augmented_assignment_lhs: ($, previous) => choice(previous, $.non_null_expression),

      _lhs_expression: ($, previous) => choice(previous, $.non_null_expression),

      primary_expression: ($, previous) => choice(
        previous,
        $.non_null_expression,
      ),

      // If the dialect is regular typescript, we exclude JSX expressions and
      // include type assertions. If the dialect is TSX, we do the opposite.
      expression: ($, previous) => {
        const choices = [
          $.as_expression,
          $.satisfies_expression,
          $.instantiation_expression,
          $.internal_module,
        ];

        if (dialect === 'typescript') {
          choices.push($.type_assertion);
          choices.push(...previous.members.filter((member) =>
            member.name !== '_jsx_element',
          ));
        } else if (dialect === 'tsx') {
          choices.push(...previous.members);
        } else {
          throw new Error(`Unknown dialect ${dialect}`);
        }

        return choice(...choices);
      },

      _jsx_start_opening_element: $ => seq(
        '<',
        optional(
          seq(
            choice(
              field('name', choice(
                $._jsx_identifier,
                $.jsx_namespace_name,
              )),
              seq(
                field('name', choice(
                  $.identifier,
                  alias($.nested_identifier, $.member_expression),
                )),
                field('type_arguments', optional($.type_arguments)),
              ),
            ),
            repeat(field('attribute', $._jsx_attribute)),
          ),
        ),
      ),

      // This rule is only referenced by expression when the dialect is 'tsx'
      jsx_opening_element: $ => prec.dynamic(-1, seq(
        $._jsx_start_opening_element,
        '>',
      )),

      // tsx only. See jsx_opening_element.
      jsx_self_closing_element: $ => prec.dynamic(-1, seq(
        $._jsx_start_opening_element,
        '/>',
      )),

      // The external text scanner stops at '&' so complete entities can keep
      // their own nodes. A shorter literal fallback handles the other cases.
      _jsx_child: ($, previous) => choice(previous, alias('&', $.jsx_text)),

      _jsx_string: $ => choice(
        seq(
          '"',
          repeat(choice(
            ...(dialect === 'tsx' ? [$._jsx_string_marker] : []),
            alias($.unescaped_double_jsx_string_fragment, $.string_fragment),
            alias($._jsx_character_reference, $.html_character_reference),
            alias(token.immediate('&'), $.string_fragment),
          )),
          token.immediate('"'),
        ),
        seq(
          '\'',
          repeat(choice(
            ...(dialect === 'tsx' ? [$._jsx_string_marker] : []),
            alias($.unescaped_single_jsx_string_fragment, $.string_fragment),
            alias($._jsx_character_reference, $.html_character_reference),
            alias(token.immediate('&'), $.string_fragment),
          )),
          token.immediate('\''),
        ),
      ),

      // Match the inherited entity pattern, but make every quoted-string
      // content token and the closing quote immediate, so JavaScript comment
      // extras cannot run anywhere inside the attribute value.
      _jsx_character_reference: _ => token.immediate(/&(#([xX][0-9a-fA-F]{1,6}|[0-9]{1,5})|[A-Za-z]{1,30});/),

      // End fragments before every ampersand. Looking one character past '&'
      // can let a longer comment token win after that speculative match fails.
      unescaped_double_jsx_string_fragment: _ => token.immediate(prec(1, /[^"&]+/)),
      unescaped_single_jsx_string_fragment: _ => token.immediate(prec(1, /[^'&]+/)),

      export_specifier: ($, previous) => specifier($, previous, $._module_export_name),

      _import_identifier: $ => choice($.identifier, keywordName($, 'type')),

      import_specifier: ($, previous) => specifier($, previous, $.identifier),

      import_attribute: $ => seq(choice('with', 'assert'), $.object),

      import_clause: $ => choice(
        $.namespace_import,
        $.named_imports,
        seq(
          $._import_identifier,
          optional(seq(
            ',',
            choice(
              $.namespace_import,
              $.named_imports,
            ),
          )),
        ),
      ),

      import_statement: $ => seq(
        'import',
        optional(choice('type', 'typeof')),
        choice(
          seq($.import_clause, $._from_clause),
          $.import_require_clause,
          field('source', $.string),
        ),
        optional($.import_attribute),
        $._semicolon,
      ),

      // The JavaScript rule, with markers so a line break after `export` or before
      // `from` does not end the statement (tsc reads both as one statement).
      export_statement: $ => choice(
        seq(
          'export',
          optional($._no_asi_marker),
          choice(
            seq('*', $._from_clause),
            seq($.namespace_export, $._from_clause),
            seq($.export_clause, choice($._from_clause, optional($._from_marker))),
          ),
          $._semicolon,
        ),
        seq(
          repeat(field('decorator', $.decorator)),
          'export',
          optional($._no_asi_marker),
          choice(
            field('declaration', $.declaration),
            seq(
              'default',
              choice(
                field('declaration', $.declaration),
                seq(
                  field('value', $.expression),
                  $._semicolon,
                ),
              ),
            ),
          ),
        ),
        seq(
          'export',
          'type',
          $.export_clause,
          choice($._from_clause, optional($._from_marker)),
          $._semicolon,
        ),
        seq(
          'export',
          'type',
          '*',
          $._from_clause,
          $._semicolon,
        ),
        seq(
          'export',
          'type',
          $.namespace_export,
          $._from_clause,
          $._semicolon,
        ),
        seq('export', '=', $.expression, $._semicolon),
        seq('export', 'as', 'namespace', $.identifier, $._semicolon),
      ),

      non_null_expression: $ => prec.left('unary', seq(
        $.expression, '!',
      )),

      lexical_declaration: $ => seq(
        choice(seq(field('kind', 'let'), optional($._let_marker)), field('kind', 'const')),
        commaSep1($.variable_declarator),
        $._semicolon,
      ),

      variable_declarator: $ => choice(
        seq(
          field('name', choice($.identifier, $._destructuring_pattern)),
          field('type', optional($.type_annotation)),
          optional($._initializer),
        ),
        prec('declaration', seq(
          field('name', $.identifier),
          '!',
          field('type', $.type_annotation),
        )),
      ),

      method_signature: $ => methodSignature($, $._property_name),

      _class_method_signature: $ => methodSignature($, $._class_member_name),

      abstract_method_signature: $ => seq(
        optional($.accessibility_modifier),
        'abstract',
        optional($.override_modifier),
        optional(choice('get', 'set', '*')),
        field('name', $._class_member_name),
        optional('?'),
        optional($._member_signature_marker),
        $._call_signature,
      ),

      parenthesized_expression: $ => seq(
        '(',
        choice(
          seq($.expression, field('type', optional($.type_annotation))),
          $.sequence_expression,
        ),
        ')',
      ),

      _formal_parameter: $ => choice(
        $.required_parameter,
        $.optional_parameter,
      ),

      function_signature: $ => seq(
        optional('async'),
        'function',
        field('name', $.identifier),
        $._call_signature,
        choice($._semicolon, $._function_signature_automatic_semicolon),
      ),

      decorator: $ => seq(
        '@',
        choice(
          $.identifier,
          alias($.decorator_member_expression, $.member_expression),
          alias($.decorator_call_expression, $.call_expression),
          alias($.decorator_parenthesized_expression, $.parenthesized_expression),
        ),
      ),

      decorator_call_expression: $ => prec('call', seq(
        field('function', choice(
          $.identifier,
          alias($.decorator_member_expression, $.member_expression),
        )),
        optional(field('type_arguments', $.type_arguments)),
        field('arguments', $.arguments),
      )),

      decorator_parenthesized_expression: $ => seq(
        '(',
        choice(
          $.identifier,
          alias($.decorator_member_expression, $.member_expression),
          alias($.decorator_call_expression, $.call_expression),
        ),
        ')',
      ),

      class_body: $ => seq(
        '{',
        repeat(choice(
          seq(
            repeat(field('decorator', $.decorator)),
            alias($._class_method_definition, $.method_definition),
            optional($._semicolon),
          ),
          // As it happens for functions, the semicolon insertion should not
          // happen if a block follows the closing paren, because then it's a
          // *definition*, not a declaration. Example:
          //     public foo()
          //     { <--- this brace made the method signature become a definition
          //     }
          // The same rule applies for functions and that's why we use
          // "_function_signature_automatic_semicolon".
          seq(alias($._class_method_signature, $.method_signature), choice($._function_signature_automatic_semicolon, ',')),
          $.class_static_block,
          seq(
            choice(
              $.abstract_method_signature,
              $.index_signature,
              alias($._class_method_signature, $.method_signature),
              $.public_field_definition,
            ),
            choice(seq(optional($._member_end_marker), $._semicolon), ','),
          ),
          ';',
        )),
        '}',
      ),

      // Object-literal methods: no markers, so `{ get\n x }` as a block keeps ASI.
      method_definition: $ => prec.left(seq(
        methodSignature($, $._property_name, false),
        field('body', $.statement_block),
      )),

      _class_method_definition: $ => prec.left(seq(
        methodSignature($, $._class_member_name),
        field('body', $.statement_block),
      )),

      declaration: ($, previous) => choice(
        previous,
        $.function_signature,
        $.abstract_class_declaration,
        $.module,
        prec('declaration', $.internal_module),
        $.type_alias_declaration,
        $.enum_declaration,
        $.interface_declaration,
        $.import_alias,
        $.ambient_declaration,
      ),

      type_assertion: $ => prec.left('unary', seq(
        $.type_arguments,
        $.expression,
      )),

      as_expression: $ => prec.left('binary', seq(
        $.expression,
        'as',
        choice('const', $.type),
      )),

      satisfies_expression: $ => prec.left('binary', seq(
        $.expression,
        'satisfies',
        $.type,
      )),

      instantiation_expression: $ => prec('instantiation', seq(
        $.expression,
        field('type_arguments', $.type_arguments),
      )),

      class_heritage: $ => choice(
        seq($.extends_clause, optional($.implements_clause)),
        $.implements_clause,
      ),

      import_require_clause: $ => seq(
        $.identifier,
        '=',
        'require',
        '(',
        field('source', $.string),
        ')',
      ),

      extends_clause: $ => seq(
        'extends',
        commaSep1($._extends_clause_single),
      ),

      _extends_clause_single: $ => prec('extends', seq(
        field('value', $.expression),
        field('type_arguments', optional($.type_arguments)),
      )),

      implements_clause: $ => seq(
        'implements',
        commaSep1($.type),
      ),

      ambient_declaration: $ => seq(
        'declare',
        choice(
          $.declaration,
          seq('global', $.statement_block),
          seq('module', '.', alias($.identifier, $.property_identifier), ':', $.type, $._semicolon),
        ),
      ),

      class: $ => prec('literal', seq(
        repeat(field('decorator', $.decorator)),
        'class',
        field('name', optional($._type_identifier)),
        field('type_parameters', optional($.type_parameters)),
        optional($.class_heritage),
        field('body', $.class_body),
      )),

      abstract_class_declaration: $ => prec('declaration', seq(
        repeat(field('decorator', $.decorator)),
        'abstract',
        'class',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        optional($.class_heritage),
        field('body', $.class_body),
      )),

      class_declaration: $ => prec.left('declaration', seq(
        repeat(field('decorator', $.decorator)),
        'class',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        optional($.class_heritage),
        field('body', $.class_body),
        optional($._automatic_semicolon),
      )),

      module: $ => seq(
        'module',
        $._module,
      ),

      internal_module: $ => seq(
        'namespace',
        $._module,
      ),

      _module: $ => prec.right(seq(
        field('name', choice($.string, $.identifier, $.nested_identifier)),
        // On .d.ts files "declare module foo" desugars to "declare module foo {}",
        // hence why it is optional here
        field('body', optional($.statement_block)),
      )),

      import_alias: $ => seq(
        'import',
        $.identifier,
        '=',
        choice($.identifier, $.nested_identifier),
        $._semicolon,
      ),

      nested_type_identifier: $ => prec('member', seq(
        field('module', choice($.identifier, $.nested_identifier)),
        '.',
        field('name', $._type_identifier),
      )),

      interface_declaration: $ => seq(
        'interface',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        optional($.extends_type_clause),
        field('body', alias($.object_type, $.interface_body)),
      ),

      extends_type_clause: $ => seq(
        'extends',
        commaSep1(field('type', choice(
          $._type_identifier,
          $.nested_type_identifier,
          $.generic_type,
        ))),
      ),

      enum_declaration: $ => seq(
        optional('const'),
        'enum',
        field('name', $.identifier),
        field('body', $.enum_body),
      ),

      enum_body: $ => seq(
        '{',
        optional(seq(
          sepBy1(',', choice(
            field('name', $._property_name),
            $.enum_assignment,
          )),
          optional(','),
        )),
        '}',
      ),

      enum_assignment: $ => seq(
        field('name', $._property_name),
        $._initializer,
      ),

      type_alias_declaration: $ => seq(
        'type',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        '=',
        field('value', $.type),
        $._semicolon,
      ),

      accessibility_modifier: _ => choice(
        'public',
        'private',
        'protected',
      ),

      override_modifier: _ => 'override',

      // TypeScript 4.7 variance annotations on type parameters.
      // `in` marks a type parameter as contravariant, `out` as covariant,
      // and `in out` explicitly marks it as invariant.
      variance: _ => choice(
        seq('in', 'out'),
        'in',
        'out',
      ),

      required_parameter: $ => seq(
        $._parameter_name,
        field('type', optional($.type_annotation)),
        optional($._initializer),
      ),

      optional_parameter: $ => seq(
        $._parameter_name,
        '?',
        field('type', optional($.type_annotation)),
        optional($._initializer),
      ),

      _parameter_name: $ => seq(
        repeat(field('decorator', $.decorator)),
        optional($.accessibility_modifier),
        optional($.override_modifier),
        optional('readonly'),
        field('pattern', choice($.pattern, $.this)),
      ),

      omitting_type_annotation: $ => seq('-?:', $.type),
      adding_type_annotation: $ => seq('+?:', $.type),
      opting_type_annotation: $ => seq('?:', $.type),
      type_annotation: $ => seq(
        ':',
        $.type,
      ),

      // Oh boy
      // The issue is these special type queries need a lower relative precedence than the normal ones,
      // since these are used in type annotations whereas the other ones are used where `typeof` is
      // required beforehand. This allows for parsing of annotations such as
      // foo: import('x').y.z;
      // but was a nightmare to get working.
      _type_query_member_expression_in_type_annotation: $ => seq(
        field('object', choice(
          $.import,
          alias($._type_query_member_expression_in_type_annotation, $.member_expression),
          alias($._type_query_call_expression_in_type_annotation, $.call_expression),
        )),
        '.',
        field('property', choice(
          $.private_property_identifier,
          alias($.identifier, $.property_identifier),
          alias('abstract', $.property_identifier),
        )),
      ),
      _type_query_call_expression_in_type_annotation: $ => seq(
        field('function', choice(
          $.import,
          alias($._type_query_member_expression_in_type_annotation, $.member_expression),
        )),
        field('arguments', $.arguments),
      ),

      asserts: $ => seq(
        'asserts',
        choice($.type_predicate, $.identifier, $.this),
      ),

      asserts_annotation: $ => seq(
        seq(':', $.asserts),
      ),

      type: $ => choice(
        $.primary_type,
        $.function_type,
        $.readonly_type,
        $.constructor_type,
        $.infer_type,
      ),

      // A tuple label may be a contextual keyword that also names a type:
      // [symbol: string], [string: number, number?: string].
      tuple_parameter: $ => seq(
        field('name', choice($.identifier, ...TUPLE_LABEL_KEYWORDS.map((k) => keywordName($, k)), $.rest_pattern)),
        field('type', $.type_annotation),
      ),

      optional_tuple_parameter: $ => seq(
        field('name', choice($.identifier, ...TUPLE_LABEL_KEYWORDS.map((k) => keywordName($, k)))),
        '?',
        field('type', $.type_annotation),
      ),

      optional_type: $ => seq($.type, '?'),
      rest_type: $ => seq('...', $.type),

      _tuple_type_member: $ => choice(
        alias($.tuple_parameter, $.required_parameter),
        alias($.optional_tuple_parameter, $.optional_parameter),
        $.optional_type,
        $.rest_type,
        $.type,
      ),

      constructor_type: $ => prec.left(seq(
        optional('abstract'),
        'new',
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.formal_parameters),
        '=>',
        field('type', $.type),
      )),

      primary_type: $ => choice(
        $.parenthesized_type,
        $.predefined_type,
        $._type_identifier,
        $.nested_type_identifier,
        $.generic_type,
        $.object_type,
        $.array_type,
        $.tuple_type,
        $.flow_maybe_type,
        $.type_query,
        $.index_type_query,
        alias($.this, $.this_type),
        $.existential_type,
        $.literal_type,
        $.lookup_type,
        $.conditional_type,
        $.template_literal_type,
        $.intersection_type,
        $.union_type,
        'const',
        prec(-1, alias($._type_query_member_expression_in_type_annotation, $.member_expression)),
        prec(-1, alias($._type_query_call_expression_in_type_annotation, $.call_expression)),
      ),

      // A tagged template may contain escapes that are invalid elsewhere (ES2018), e.g.
      // String.raw`\usepackage` (upstream #353). JavaScript's escape_sequence rejects a
      // bare `\x` or `\u` (no hex digits after it), so template strings also take this
      // token, under the same node name. The longest match still gives `\x41` and `\u0041`
      // to escape_sequence. Template literal types take it too: tsc accepts `\u` in a
      // type template without substitutions, and in `f<`\u`>(1)` the type-argument reading
      // must survive as long as the comparison reading does (the two are a declared conflict).
      // Strings keep JavaScript's rule. A token cannot see the tag, so untagged templates,
      // and type templates with substitutions, accept the bare form though tsc rejects it.
      _template_bare_escape: _ => token.immediate(seq('\\', /[xu]/)),

      template_string: $ => seq(
        '`',
        repeat(choice(
          alias($._template_chars, $.string_fragment),
          $.escape_sequence,
          alias($._template_bare_escape, $.escape_sequence),
          $.template_substitution,
        )),
        '`',
      ),

      template_type: $ => seq('${', choice($.primary_type, $.infer_type), '}'),

      template_literal_type: $ => seq(
        '`',
        repeat(choice(
          alias($._template_chars, $.string_fragment),
          $.escape_sequence,
          alias($._template_bare_escape, $.escape_sequence),
          $.template_type,
        )),
        '`',
      ),

      infer_type: $ => prec.right(seq(
        'infer',
        $._type_identifier,
        optional(seq(
          'extends',
          $.type,
        )),
      )),

      conditional_type: $ => prec.right(seq(
        field('left', $.type),
        'extends',
        field('right', $.type),
        '?',
        field('consequence', $.type),
        ':',
        field('alternative', $.type),
      )),

      generic_type: $ => prec('call', seq(
        field('name', choice(
          $._type_identifier,
          $.nested_type_identifier,
          alias($._type_query_member_expression_in_type_annotation, $.member_expression),
        )),
        field('type_arguments', $.type_arguments),
      )),

      type_predicate: $ => seq(
        field('name', choice(
          $.identifier,
          $.this,
          // Sometimes tree-sitter contextual lexing is not good enough to know
          // that 'object' in ':object is foo' is really an identifier and not
          // a predefined_type, so we must explicitely list all possibilities.
          // TODO: should we use '_reserved_identifier'? Should all the element in
          // 'predefined_type' be added to '_reserved_identifier'?
          alias($.predefined_type, $.identifier),
        )),
        'is',
        field('type', $.type),
      ),

      type_predicate_annotation: $ => seq(
        seq(':', $.type_predicate),
      ),

      // Type query expressions are more restrictive than regular expressions
      // `abstract` is also an expression keyword token. Keep the identifier
      // interpretation in competing type parses such as f<typeof abstract>(x).
      _type_query_identifier: $ => choice(
        $.identifier,
        keywordName($, 'abstract'),
      ),

      _type_query_member_expression: $ => seq(
        field('object', choice(
          $._type_query_identifier,
          $.this,
          alias($._type_query_member_expression, $.member_expression),
          alias($._type_query_call_expression, $.call_expression),
        )),
        '.',
        field('property', choice(
          $.private_property_identifier,
          alias($.identifier, $.property_identifier),
          alias('abstract', $.property_identifier),
        )),
      ),
      _type_query_subscript_expression: $ => seq(
        field('object', choice(
          $.identifier,
          $.this,
          alias($._type_query_subscript_expression, $.subscript_expression),
          alias($._type_query_member_expression, $.member_expression),
          alias($._type_query_call_expression, $.call_expression),
        )),
        '[', field('index', choice($.predefined_type, $.string, $.number)), ']',
      ),
      _type_query_call_expression: $ => seq(
        // Only import calls belong in a type query. Other calls must keep
        // their runtime-expression branch, e.g. f < typeof abstract(x) > (x).
        field('function', $.import),
        field('arguments', $.arguments),
      ),
      _type_query_instantiation_expression: $ => seq(
        field('function', choice(
          $.import,
          $._type_query_identifier,
          alias($._type_query_member_expression, $.member_expression),
        )),
        field('type_arguments', $.type_arguments),
      ),
      type_query: $ => seq(
        'typeof',
        choice(
          alias($._type_query_subscript_expression, $.subscript_expression),
          alias($._type_query_member_expression, $.member_expression),
          alias($._type_query_call_expression, $.call_expression),
          alias($._type_query_instantiation_expression, $.instantiation_expression),
          $._type_query_identifier,
          $.this,
        ),
      ),

      index_type_query: $ => seq(
        'keyof',
        $.primary_type,
      ),

      lookup_type: $ => seq(
        $.primary_type,
        '[',
        $.type,
        ']',
      ),

      mapped_type_clause: $ => seq(
        field('name', $._type_identifier),
        'in',
        field('type', $.type),
        optional(seq('as', field('alias', $.type))),
      ),

      literal_type: $ => choice(
        alias($._number, $.unary_expression),
        $.number,
        $.string,
        $.true,
        $.false,
        $.null,
        $.undefined,
      ),

      _number: $ => prec.left(1, seq(
        field('operator', choice('-', '+')),
        field('argument', $.number),
      )),

      existential_type: _ => '*',

      flow_maybe_type: $ => prec.right(seq('?', $.primary_type)),

      parenthesized_type: $ => seq('(', $.type, ')'),

      predefined_type: _ => choice(
        'any',
        'number',
        'boolean',
        'string',
        'symbol',
        // One token, so `unique` alone is never a keyword: it stays a name in
        // `i < unique.length` and `[unique: T]`. Between the words: whitespace
        // (the same class as `extras`) and comments; a line comment must reach
        // its newline, so `unique // the symbol` does not complete the token.
        alias(token(seq('unique', /([\s\p{Zs}\uFEFF\u2028\u2029\u2060\u200B]|\/\/[^\r\n\u2028\u2029]*(\r\n|\r|\n|\u2028|\u2029)|\/\*[^*]*\*+([^/*][^*]*\*+)*\/)+/, 'symbol')), 'unique symbol'),
        'void',
        'unknown',
        'string',
        'never',
        'object',
      ),

      type_arguments: $ => seq(
        '<',
        commaSep1($.type),
        optional(','),
        '>',
      ),

      object_type: $ => seq(
        choice('{', '{|'),
        optional(seq(
          optional(choice(',', ';')),
          sepBy1(
            choice(',', seq(optional($._member_end_marker), $._semicolon)),
            choice(
              $.export_statement,
              $.property_signature,
              $.call_signature,
              $.construct_signature,
              $.index_signature,
              $.method_signature,
            ),
          ),
          optional(choice(',', seq(optional($._member_end_marker), $._semicolon))),
        )),
        choice('}', '|}'),
      ),

      call_signature: $ => $._call_signature,

      property_signature: $ => seq(
        optional($.accessibility_modifier),
        optional('static'),
        optional($.override_modifier),
        optional('readonly'),
        field('name', $._property_name),
        optional('?'),
        field('type', optional($.type_annotation)),
      ),

      _call_signature: $ => seq(
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.formal_parameters),
        field('return_type', optional(
          choice($.type_annotation, $.asserts_annotation, $.type_predicate_annotation),
        )),
      ),

      type_parameters: $ => seq(
        '<', commaSep1($.type_parameter), optional(','), '>',
      ),

      type_parameter: $ => seq(
        optional('const'),
        optional($.variance),
        // `out` stays usable as a parameter name (`<out>`,
        // `<out = X>`, `<in out>` = modifier `in` on a parameter named `out`),
        // as tsc accepts it (brajevicm@9fcaa13). tsc also takes `const` on
        // either side of the variance (`<in const T>`).
        optional('const'),
        field('name', choice($._type_identifier, alias('out', $.type_identifier))),
        field('constraint', optional($.constraint)),
        field('value', optional($.default_type)),
      ),

      default_type: $ => seq(
        '=',
        $.type,
      ),

      constraint: $ => seq(
        choice('extends', ':'),
        $.type,
      ),

      construct_signature: $ => seq(
        optional('abstract'),
        'new',
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.formal_parameters),
        field('type', optional($.type_annotation)),
      ),

      index_signature: $ => seq(
        optional(
          seq(
            field('sign', optional(choice('-', '+'))),
            'readonly',
          ),
        ),
        '[',
        choice(
          seq(
            field('name', choice(
              $.identifier,
              alias($._reserved_identifier, $.identifier),
            )),
            ':',
            field('index_type', $.type),
          ),
          $.mapped_type_clause,
        ),
        ']',
        field('type', choice(
          $.type_annotation,
          $.omitting_type_annotation,
          $.adding_type_annotation,
          $.opting_type_annotation,
        )),
      ),

      array_type: $ => seq($.primary_type, '[', ']'),
      tuple_type: $ => seq(
        '[', commaSep($._tuple_type_member), optional(','), ']',
      ),
      readonly_type: $ => seq('readonly', $.type),

      union_type: $ => prec.left(seq(optional($.type), '|', $.type)),
      intersection_type: $ => prec.left(seq(optional($.type), '&', $.type)),

      function_type: $ => prec.left(seq(
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.formal_parameters),
        '=>',
        field('return_type', choice($.type, $.asserts, $.type_predicate)),
      )),

      _type_identifier: $ => alias($.identifier, $.type_identifier),

      _reserved_identifier: (_, previous) => choice(
        'abstract',
        'declare',
        'namespace',
        'type',
        'public',
        'private',
        'protected',
        'override',
        'readonly',
        'module',
        'any',
        'number',
        'boolean',
        'string',
        'symbol',
        'export',
        'object',
        'new',
        'readonly',
        previous,
      ),
    },
  });
};

/**
 * The whole import or export specifier rule. Specifiers whose first word is
 * the keyword `type` or `typeof` are read as tsc's
 * parseImportOrExportSpecifier reads them:
 * `{ type }`, `{ type as x }` and `{ type as as }` name `type`; `{ type as }`
 * and `{ type as as x }` are type-only specifiers of `as`; `{ typeof as x }`
 * and `{ typeof }` name `typeof`. Flow's `typeof`
 * modifier mirrors `type`: `{ typeof as }` and `{ typeof as as x }` keep it on
 * a name `as`. After these keywords `as` lexes as the keyword, so every such
 * name is an aliased keyword token.
 * Specifiers with an ordinary first name use the inherited JavaScript rule,
 * optionally after a `type` or `typeof` modifier.
 *
 * @param {GrammarSymbols<string>} $
 * @param {RuleOrLiteral} previous the JavaScript import/export specifier rule
 * @param {RuleOrLiteral} aliasName what may follow `as` besides `type`/`as`
 * @returns {ChoiceRule}
 */
function specifier($, previous, aliasName) {
  const typeName = keywordName($, 'type');
  const asName = keywordName($, 'as');
  const typeofName = keywordName($, 'typeof');
  const aliasTail = seq('as', field('alias', choice(aliasName, typeName, asName)));
  return choice(
    seq(optional(choice('type', 'typeof')), previous),
    seq(field('name', typeName), optional(aliasTail)),
    seq('type', field('name', asName), optional(aliasTail)),
    seq(field('name', typeofName), optional(aliasTail)),
    seq('typeof', field('name', asName), optional(aliasTail)),
  );
}

/**
 * A keyword token used as a name: it keeps the `identifier` node kind.
 *
 * @param {GrammarSymbols<string>} $
 * @param {string} word
 * @returns {AliasRule}
 */
function keywordName($, word) {
  return alias(word, $.identifier);
}

/**
 * Share method syntax while keeping contextual keyword names local to classes.
 *
 * @param {GrammarSymbols<string>} $
 * @param {RuleOrLiteral} name
 * @param {boolean} [markers] the ASI markers after `static`, `get` and `set`
 * @returns {SeqRule}
 */
function methodSignature($, name, markers = true) {
  const modifier = word => markers ? seq(word, optional($._modifier_marker)) : word;
  return seq(
    optional($.accessibility_modifier),
    optional(modifier('static')),
    optional($.override_modifier),
    optional('readonly'),
    optional('async'),
    optional(choice(modifier('get'), modifier('set'), '*')),
    field('name', name),
    optional('?'),
    optional($._member_signature_marker),
    $._call_signature,
  );
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return sepBy1(',', rule);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep(rule) {
  return sepBy(',', rule);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a separator
 *
 * @param {RuleOrLiteral} sep
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {ChoiceRule}
 */
function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a separator
 *
 * @param {RuleOrLiteral} sep
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}
