#include "tree_sitter/parser.h"

#include <string.h>
#include <wctype.h>

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
    HTML_COMMENT,
    LOGICAL_OR,
    ESCAPE_SEQUENCE,
    REGEX_PATTERN,
    JSX_TEXT,
    FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON,
    ERROR_RECOVERY,
    MEMBER_SIGNATURE_MARKER,
    MEMBER_END_MARKER,
    NO_ASI_MARKER,
    LET_MARKER,
    MODIFIER_MARKER,
    FROM_MARKER,
    // TSX-only, never produced: quoted JSX must not scan HTML comments.
    JSX_STRING_MARKER,
};

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_line_terminator(int32_t c) { return c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029; }

static bool scan_template_chars(TSLexer *lexer) {
    lexer->result_symbol = TEMPLATE_CHARS;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        switch (lexer->lookahead) {
            case '`':
                return has_content;
            case '\0':
                return false;
            case '$':
                advance(lexer);
                if (lexer->lookahead == '{') {
                    return has_content;
                }
                break;
            case '\\':
                return has_content;
            default:
                advance(lexer);
        }
    }
}

// JS whitespace and line terminators above ASCII (Zs, U+FEFF, U+2028/9), which
// iswspace does not report in the C locale.
static bool is_unicode_space(int32_t c) {
    return c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 ||
           c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
}

static bool scan_whitespace_and_comments(TSLexer *lexer, bool *scanned_comment) {
    for (;;) {
        while (iswspace(lexer->lookahead) || is_unicode_space(lexer->lookahead)) {
            skip(lexer);
        }

        if (lexer->lookahead == '/') {
            skip(lexer);

            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && !is_line_terminator(lexer->lookahead)) {
                    skip(lexer);
                }
                *scanned_comment = true;
            } else if (lexer->lookahead == '*') {
                skip(lexer);
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                    } else {
                        skip(lexer);
                    }
                }
            } else {
                return false;
            }
        } else {
            return true;
        }
    }
}

/**
 * At `(`: skip a balanced parameter list and report whether `:` or `{` follows
 * (a method's return type or body), with whitespace and comments allowed between.
 * Strings, template literals and comments inside the list are skipped, so a `)`
 * inside them does not end it. Only looks ahead (the caller's token is already
 * marked), but the lexer does move: the caller must not scan anything else after.
 */
static bool scan_method_parameters(TSLexer *lexer) {
    unsigned depth = 0;
    for (unsigned n = 0; n < 4096; n++) {
        if (lexer->eof(lexer)) {
            return false;
        }
        int32_t c = lexer->lookahead;
        if (c == '"' || c == '\'' || c == '`') {
            skip(lexer);
            while (lexer->lookahead != c) {
                if (lexer->eof(lexer) || (c != '`' && lexer->lookahead == '\n')) {
                    return false;
                }
                if (lexer->lookahead == '\\') {
                    skip(lexer);
                }
                skip(lexer);
            }
            skip(lexer);
            continue;
        }
        if (c == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead)) {
                    skip(lexer);
                }
            } else if (lexer->lookahead == '*') {
                skip(lexer);
                for (;;) {
                    if (lexer->eof(lexer)) {
                        return false;
                    }
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                    } else {
                        skip(lexer);
                    }
                }
            }
            continue;
        }
        if (c == '(') {
            depth++;
        } else if (c == ')') {
            depth--;
            if (depth == 0) {
                skip(lexer);
                bool comment = false;
                if (!scan_whitespace_and_comments(lexer, &comment)) {
                    return false;
                }
                return lexer->lookahead == ':' || lexer->lookahead == '{';
            }
        }
        skip(lexer);
    }
    return false;
}

static bool is_identifier_start(int32_t c) {
    return iswalpha(c) || c == '_' || c == '$' || c == '\\' || (c >= 0x80 && !is_unicode_space(c));
}

static bool is_identifier_part(int32_t c) { return is_identifier_start(c) || iswdigit(c); }

// Skips the word at the lookahead and copies it into `word` when it is short and
// ASCII lowercase (every keyword is); otherwise `word` is left empty.
static void scan_word(TSLexer *lexer, char *word, unsigned size) {
    unsigned length = 0;
    bool keyword_like = true;
    while (is_identifier_part(lexer->lookahead)) {
        if (lexer->lookahead < 'a' || lexer->lookahead > 'z' || length + 1 >= size) {
            keyword_like = false;
        } else if (keyword_like) {
            word[length++] = (char)lexer->lookahead;
        }
        skip(lexer);
    }
    word[keyword_like ? length : 0] = '\0';
}

static bool word_in(const char *word, const char *const *list) {
    for (; *list; list++) {
        if (strcmp(word, *list) == 0) {
            return true;
        }
    }
    return false;
}

// tsc's reserved words (isReservedWord): after `let` they make `let` an identifier
// and end the statement. `in` and `instanceof` are left out: they continue `let`
// as an operand, as on main.
static const char *const RESERVED_WORDS[] = {
    "break", "case",  "catch",  "class",   "const",    "continue", "debugger", "default", "delete",
    "do",    "else",  "enum",   "export",  "extends",  "false",    "finally",  "for",     "function",
    "if",    "import", "new",   "null",    "return",   "super",    "switch",   "this",    "throw",
    "true",  "try",   "typeof", "var",     "void",     "while",    "with",     NULL,
};

// Modifiers the grammar does not accept after `static`, `get` or `set`: before them
// the keyword stays a member name, as on main.
static const char *const NON_FOLLOWING_MODIFIERS[] = {
    "public", "private", "protected", "declare", "abstract", NULL,
};

static bool scan_automatic_semicolon(TSLexer *lexer, const bool *valid_symbols, bool *scanned_comment) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    for (;;) {
        if (lexer->lookahead == 0) {
            return true;
        }
        if (lexer->lookahead == '}') {
            // Automatic semicolon insertion breaks detection of object patterns
            // in a typed context:
            //   type F = ({a}: {a: number}) => number;
            // Therefore, disable automatic semicolons when followed by typing
            do {
                skip(lexer);
            } while (iswspace(lexer->lookahead));
            if (lexer->lookahead == ':') {
                return valid_symbols[LOGICAL_OR]; // Don't return false if we're in a ternary by checking if || is valid
            }
            return true;
        }
        // A block comment that contains a line terminator is a line break for ASI
        // (`a /* x\n */ b` is two statements). The parser would otherwise consume the
        // comment as an extra and call this scanner after it, past the line break.
        // Other comments keep the old path: the next call starts at their newline.
        if (lexer->lookahead == '/') {
            // The lexer moves from here on, so the caller's `?` fallback must not run.
            *scanned_comment = true;
            skip(lexer);
            if (lexer->lookahead != '*') {
                return false;
            }
            skip(lexer);
            bool line_break = false;
            for (;;) {
                if (lexer->eof(lexer)) {
                    return false;
                }
                if (lexer->lookahead == '*') {
                    skip(lexer);
                    if (lexer->lookahead == '/') {
                        skip(lexer);
                        break;
                    }
                    continue;
                }
                if (is_line_terminator(lexer->lookahead)) {
                    line_break = true;
                }
                skip(lexer);
            }
            if (!line_break) {
                return false;
            }
            // Only spaces and comments left on the comment's last line, or a `}`: let the
            // parser take the comment as an extra, so it stays inside the statement (a
            // trailing comment, not a doc comment for the next declaration), and the
            // next call decides from the line break or the `}` as main does.
            for (;;) {
                while (!is_line_terminator(lexer->lookahead) &&
                       (iswspace(lexer->lookahead) || is_unicode_space(lexer->lookahead))) {
                    skip(lexer);
                }
                if (lexer->lookahead != '/') {
                    break;
                }
                skip(lexer);
                if (lexer->lookahead == '/') {
                    return false;
                }
                if (lexer->lookahead != '*') {
                    break;
                }
                skip(lexer);
                while (!lexer->eof(lexer)) {
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                        continue;
                    }
                    skip(lexer);
                }
            }
            if (lexer->eof(lexer) || is_line_terminator(lexer->lookahead) || lexer->lookahead == '}') {
                return false;
            }
            break;
        }
        // `\r` alone, U+2028 and U+2029 end a line as `\n` does.
        if (is_line_terminator(lexer->lookahead)) {
            skip(lexer);
            break;
        }
        if (!iswspace(lexer->lookahead) && !is_unicode_space(lexer->lookahead)) {
            return false;
        }
        skip(lexer);
    }

    if (!scan_whitespace_and_comments(lexer, scanned_comment)) {
        return false;
    }

    // The markers below are never produced; the grammar makes each valid right
    // after a keyword that tsc may continue across a line break. A `}` or EOF still
    // ends a statement or member that used the keyword as a name.
    bool at_end = lexer->lookahead == '}' || lexer->eof(lexer);
    char word[16];

    // `new\nFoo()`, `export\nconst x = 1`: always one construct. In an object type
    // `export` may also be a member name (`export\n default: T` is two members), and
    // there MEMBER_SIGNATURE_MARKER and MEMBER_END_MARKER are both valid, so the usual
    // rules apply. Checking MEMBER_SIGNATURE_MARKER alone is not enough: the parse state
    // after `new` in a bare block or arrow body is merged with one where it is valid
    // (see object_type in define-grammar.js).
    if (valid_symbols[NO_ASI_MARKER] && !(valid_symbols[MEMBER_SIGNATURE_MARKER] && valid_symbols[MEMBER_END_MARKER]) && !at_end) {
        return false;
    }

    // `let\nx = 1`, `let\n[a] = b`: a declaration only before a binding identifier
    // or a destructuring pattern; `let\nif (x) {}` is the identifier `let`.
    if (valid_symbols[LET_MARKER] && !at_end) {
        if (lexer->lookahead == '[' || lexer->lookahead == '{') {
            return false;
        }
        if (is_identifier_start(lexer->lookahead)) {
            *scanned_comment = true;
            scan_word(lexer, word, sizeof word);
            return word_in(word, RESERVED_WORDS);
        }
    }

    // `static\nx = 1`, `get\nx() {}`: one member before a property name, but not
    // before a decorator or a modifier the grammar cannot place after the keyword.
    if (valid_symbols[MODIFIER_MARKER] && !at_end) {
        if (lexer->lookahead == '[' || lexer->lookahead == '#' || lexer->lookahead == '"' ||
            lexer->lookahead == '\'' || iswdigit(lexer->lookahead)) {
            return false;
        }
        if (is_identifier_start(lexer->lookahead)) {
            *scanned_comment = true;
            scan_word(lexer, word, sizeof word);
            return word_in(word, NON_FOLLOWING_MODIFIERS);
        }
    }

    // FROM_MARKER is valid right after an export clause: `export { a }\nfrom "m"`
    // continues with the from clause (tsc reads `from` there as the keyword whatever
    // follows); `export { a }\nfromage()` does not.
    if (valid_symbols[FROM_MARKER] && lexer->lookahead == 'f') {
        *scanned_comment = true;
        scan_word(lexer, word, sizeof word);
        if (strcmp(word, "from") != 0) {
            return true;
        }
        return is_identifier_part(lexer->lookahead);
    }

    switch (lexer->lookahead) {
        case '`':
        case ',':
        case '.':
        case ';':
        case '*':
        case '%':
        case '>':
        case '=':
        case '?':
        case '^':
        case '|':
        case '&':
        case '/':
        case ':':
            return false;

        case '{':
            if (valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
                return false;
            }
            break;

            // Don't insert a semicolon before a '[', '(', or '<', unless we're
            // parsing a type. Detect whether we're parsing a type or an expression
            // using the validity of a binary operator token.
            //
            // This covers the case where a generic call-signature overload starts
            // on a new line inside an object type, e.g.:
            //
            //   const f: {
            //     (): string
            //     <T>(): T    ← the `<` here needs an implicit semicolon before it
            //   }
        case '(':
        case '[':
        case '<':
            if (valid_symbols[LOGICAL_OR]) {
                return false;
            }
            // right after a member name (`find`, `find?`) a
            // `<` or `(` on the next line opens that member's signature, as tsc
            // reads it, so no semicolon. MEMBER_SIGNATURE_MARKER is never
            // produced; the grammar makes it valid only in that position.
            if ((lexer->lookahead == '<' || lexer->lookahead == '(') && valid_symbols[MEMBER_SIGNATURE_MARKER]) {
                return false;
            }
            break;

            // Insert a semicolon before `--` and `++`, but not before binary `+` or `-`.
        case '+':
            skip(lexer);
            return lexer->lookahead == '+';
        case '-':
            skip(lexer);
            return lexer->lookahead == '-';

            // Don't insert a semicolon before `!=`, but do insert one before a unary `!`.
        case '!':
            skip(lexer);
            return lexer->lookahead != '=';

            // Don't insert a semicolon before the `in` or `instanceof` operator, but do
            // insert one before an identifier (`in2`, `instanceofX`) and before a member
            // named `in`: `in:` anywhere, and between class or object-type members
            // `in?`, `in(`, `in<`, `in!` (see the rules below), because
            //   interface Foo { name: string\n  in: string }
            // must parse `in:` as a property name, not as a keyword operator.
        case 'i':
            skip(lexer);

            if (lexer->lookahead != 'n') {
                return true;
            }
            skip(lexer);

            if (!iswalnum(lexer->lookahead) && lexer->lookahead != '_' && lexer->lookahead != '$') {
                // `in` itself, not an identifier such as `in2` or `in$x` (those get ASI below).
                // `in:` is a property name.
                if (lexer->lookahead == ':') {
                    return true;
                }
                // Anywhere but between class or object-type members, `in` is the operator
                // (`a\n in(b)` is `a in (b)`, `for (var k\n in!o)` is a for-in).
                // MEMBER_END_MARKER is never produced; the grammar makes it valid only
                // where a member ends.
                if (!valid_symbols[MEMBER_END_MARKER]) {
                    return false;
                }
                // `in ()`, `in <T>()`: spaces may sit between the name and what follows.
                while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
                    skip(lexer);
                }
                // `x in ?` is never an expression, so `in?` starts a member.
                if (lexer->lookahead == '?') {
                    return true;
                }
                // After a member that cannot continue (no `||`: a typed member, a method),
                // `in(`, `in<` and `in!` start a member named `in`.
                if (!valid_symbols[LOGICAL_OR] &&
                    (lexer->lookahead == '(' || lexer->lookahead == '<' || lexer->lookahead == '!')) {
                    return true;
                }
                // After an initializer `||` is valid, and tsc reads `a = x\n in(b)` as the
                // operator. A parameter list followed by `:` or `{` is a method, though,
                // which covers `a = () => {}\n in(): void {}`: an arrow body cannot continue.
                if (lexer->lookahead == '(') {
                    // The scan moves the lexer, so the caller's `?` fallback (a ternary
                    // after the newline) must not run from wherever it stopped:
                    // `a = x\n in(b) ? 1 : 2` is `(x in (b)) ? 1 : 2`.
                    *scanned_comment = true;
                    return scan_method_parameters(lexer);
                }
                return false;
            }

            for (unsigned i = 0; i < 8; i++) {
                if (lexer->lookahead != "stanceof"[i]) {
                    return true;
                }
                skip(lexer);
            }

            if (!iswalnum(lexer->lookahead) && lexer->lookahead != '_' && lexer->lookahead != '$') {
                return false;
            }
            break;
    }

    return true;
}

static bool scan_ternary_qmark(TSLexer *lexer) {
    for (;;) {
        if (!iswspace(lexer->lookahead)) {
            break;
        }
        skip(lexer);
    }

    if (lexer->lookahead == '?') {
        advance(lexer);

        /* Optional chaining. */
        if (lexer->lookahead == '?' || lexer->lookahead == '.') {
            return false;
        }

        lexer->mark_end(lexer);
        lexer->result_symbol = TERNARY_QMARK;

        /* TypeScript optional arguments contain the ?: sequence, possibly
           with whitespace. */
        for (;;) {
            if (!iswspace(lexer->lookahead)) {
                break;
            }
            advance(lexer);
        }

        if (lexer->lookahead == ':' || lexer->lookahead == ')' || lexer->lookahead == ',') {
            return false;
        }

        if (lexer->lookahead == '.') {
            advance(lexer);
            if (iswdigit(lexer->lookahead)) {
                return true;
            }
            return false;
        }
        return true;
    }
    return false;
}

static bool scan_closing_comment(TSLexer *lexer) {
    while (iswspace(lexer->lookahead) || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
        skip(lexer);
    }

    const char *comment_start = "<!--";
    const char *comment_end = "-->";

    if (lexer->lookahead == '<') {
        for (unsigned i = 0; i < 4; i++) {
            if (lexer->lookahead != comment_start[i]) {
                return false;
            }
            advance(lexer);
        }
    } else if (lexer->lookahead == '-') {
        for (unsigned i = 0; i < 3; i++) {
            if (lexer->lookahead != comment_end[i]) {
                return false;
            }
            advance(lexer);
        }
    } else {
        return false;
    }

    while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
           lexer->lookahead != 0x2029) {
        advance(lexer);
    }

    lexer->result_symbol = HTML_COMMENT;
    lexer->mark_end(lexer);

    return true;
}

static bool scan_jsx_text(TSLexer *lexer) {
    // saw_text will be true if we see any non-whitespace content, or any whitespace content that is not a newline and
    // does not immediately follow a newline.
    bool saw_text = false;
    // at_newline will be true if we are currently at a newline, or if we are at whitespace that is not a newline but
    // immediately follows a newline.
    bool at_newline = false;

    while (lexer->lookahead != 0 && lexer->lookahead != '<' && lexer->lookahead != '>' && lexer->lookahead != '{' &&
           lexer->lookahead != '}' && lexer->lookahead != '&') {
        bool is_wspace = iswspace(lexer->lookahead);
        if (lexer->lookahead == '\n') {
            at_newline = true;
        } else {
            // If at_newline is already true, and we see some whitespace, then it must stay true.
            // Otherwise, it should be false.
            //
            // See the table below to determine the logic for computing `saw_text`.
            //
            // |------------------------------------|
            // | at_newline | is_wspace | saw_text  |
            // |------------|-----------|-----------|
            // | false (0)  | false (0) | true  (1) |
            // | false (0)  | true  (1) | true  (1) |
            // | true  (1)  | false (0) | true  (1) |
            // | true  (1)  | true  (1) | false (0) |
            // |------------------------------------|

            at_newline &= is_wspace;
            if (!at_newline) {
                saw_text = true;
            }
        }

        advance(lexer);
    }

    lexer->result_symbol = JSX_TEXT;
    return saw_text;
}

static inline bool external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[TEMPLATE_CHARS]) {
        if (valid_symbols[AUTOMATIC_SEMICOLON]) {
            return false;
        }
        return scan_template_chars(lexer);
    }

    if (valid_symbols[JSX_TEXT] && scan_jsx_text(lexer)) {
        return true;
    }

    if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
        bool scanned_comment = false;
        bool ret = scan_automatic_semicolon(lexer, valid_symbols, &scanned_comment);
        if (!ret && !scanned_comment && valid_symbols[TERNARY_QMARK] && lexer->lookahead == '?') {
            return scan_ternary_qmark(lexer);
        }
        return ret;
    }
    if (valid_symbols[TERNARY_QMARK]) {
        return scan_ternary_qmark(lexer);
    }

    if (valid_symbols[HTML_COMMENT] && !valid_symbols[LOGICAL_OR] && !valid_symbols[ESCAPE_SEQUENCE] &&
        !valid_symbols[REGEX_PATTERN]) {
        return scan_closing_comment(lexer);
    }

    return false;
}
