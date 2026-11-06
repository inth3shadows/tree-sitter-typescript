// Must keep parsing: `unique` is a name everywhere except `unique symbol`.
declare const unique: string[];
for (let i = 0; i < unique.length; i++) {}
export const b = 1 < unique.length;
export declare const s: unique symbol;
