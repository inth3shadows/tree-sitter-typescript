// Prefix operators before generic calls parse without errors (#77). The differential
// compares errors only; the tree shapes are pinned in test/corpus/expressions.txt.
declare function f<T>(x: T): Promise<T>;
declare const a: { get<T>(): { b?: T }; c<T>(x: T): { d(y: number): void } };
declare class K<T> { constructor(x: T); c(x: number): K<T>; d(y: number): void }
declare const x: number;
async function g() {
  await f<number>(x);
  await a.c<number>(x).d(1);
}
!f<number>(x);
void a.get<string>();
typeof f<number>(x);
!!a.get<number>()?.b;
const sum = 1 + (f<number>(x) as unknown as number);
new K<number>(x).c(1).d(2);
// A type assertion covers the member chain after a generic call.
const y = <unknown>a.c<number>(x).d;
