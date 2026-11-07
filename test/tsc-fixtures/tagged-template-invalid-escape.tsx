// tsx twin of tagged-template-invalid-escape.ts.
// A tagged template may contain escapes that are invalid in a string (ES2018,
// "template literal revision"): `\u`/`\x` not followed by hex digits (upstream #353).
declare const tag: (s: readonly string[], ...v: unknown[]) => string;

export const latex = String.raw`
  \documentclass{article}
  \usepackage{graphicx}
  \begin{document}
  \end{document}
`;

export const partial = tag`\x \xg \x4 \u \u12 \u{} \u{zz} ${latex} \unicode`;

export const valid = tag`\x41 \u0041 \u{1F600} \n \` \${x}`;

export const typed = tag<string>`\usepackage`;

// Line continuations, LF and CRLF, next to a bare escape.
export const cont = tag`a\
b\u\
c`;

// Bare escapes in template literal types: type arguments, not comparisons.
declare function g<T>(x: number): T;
export const ga = g<`\u`>(1);
export const gb = tag<`\x`>`x`;
export type Bare = `\u`;

export const el = <a title={String.raw`\usepackage`}>{tag`\x`}</a>;
