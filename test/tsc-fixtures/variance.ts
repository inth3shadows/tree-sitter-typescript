// Variance annotations (TS 4.7): fixed by the vendored grammar patch (#3226; upstream tree-sitter-typescript#370). Must keep parsing.
export interface Producer<out T> { get(): T; }
export interface Consumer<in T> { set(v: T): void; }
export interface State<in out T> { get(): T; set(v: T): void; }
export type Fn<in A, out R> = (a: A) => R;
export class Cell<in out T> { constructor(public value: T) {} }
export abstract class Source<out T> { abstract read(): T; }
