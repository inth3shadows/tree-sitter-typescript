#include "tree_sitter/parser.h"

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
    // TSX-only, never produced: quoted JSX must not scan HTML comments.
    JSX_STRING_MARKER,
};

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

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

static bool scan_whitespace_and_comments(TSLexer *lexer, bool *scanned_comment) {
    for (;;) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }

        if (lexer->lookahead == '/') {
            skip(lexer);

            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
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
                while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
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
        if (!iswspace(lexer->lookahead)) {
            return false;
        }
        if (lexer->lookahead == '\n') {
            break;
        }
        skip(lexer);
    }

    skip(lexer);

    if (!scan_whitespace_and_comments(lexer, scanned_comment)) {
        return false;
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
