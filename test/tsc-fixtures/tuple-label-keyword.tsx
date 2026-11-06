// Must keep parsing: a tuple label named like a type keyword (VS Code's terminalVoice.ts).
export type A = [spoken: string, symbol: string][];
export type B = [string: number, number?: string];
export type C = [any: 1, ...object: unknown[]];
export type D = [any?];
export type E = [readonly string[]];
export type F = [readonly: string];
