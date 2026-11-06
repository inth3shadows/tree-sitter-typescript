// Must keep parsing: an import type wherever a primary type can appear,
// and `typeof import()` in a call's type arguments (dokimasia 55b0687, 96ce7e6).
export type List = import("./types").Item[];
export type Field = import("./types").Item["id"];
export type Keys = keyof import("./types").Item;
export type Boxed = import("./types").Box<string>;
declare function load<T>(): T;
export const m = load<typeof import("./types")>();
