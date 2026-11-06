// Must keep parsing: `unique` is a name everywhere except `unique symbol`.
declare const unique: string[];
for (let i = 0; i < unique.length; i++) {}
export const b = 1 < unique.length;
interface unique { a: 1 }
export declare const u: unique[];
export class D implements unique { a = 1 as const }
export type A = [unique: number, unique2?: string];
export declare const s: unique symbol;
export declare const t: readonly unique /* comment */ symbol[];
declare function f<T>(x: T): T;
export const r = f<typeof unique>([]);
