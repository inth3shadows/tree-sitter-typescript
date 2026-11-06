// Must keep parsing: escape sequences inside template literal types
// (fixed by the marionebl base).
export type Line = `${string}\n`;
export type Quoted = `\`${string}\``;
export type Tab = `a\tb${number}`;
