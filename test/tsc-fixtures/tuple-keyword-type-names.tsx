// Must keep parsing: tuple elements that are types named like contextual
// keywords, and `typeof unique` in type arguments.
type type = 1; type get = 2; type set = 3; type declare = 4;
export type A = [type];
export type B = [get, set];
export type C = [declare?];
export type D = [type[]];
export function f(a: [get]): void {}
declare const unique: number;
declare function g<T>(x: T): T;
export const r = g<typeof unique>(1);
export type E = (typeof unique)[];
