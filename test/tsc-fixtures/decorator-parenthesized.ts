// A decorator can hold any parenthesized expression (#124).
declare const a: any, b: any, c: any;
declare class A {}

@((t: any) => t) class C1 {}
@(a, b) class C2 {}
@(a ? b : c) class C3 {}
@(new A()) class C4 {}
@(a as any) class C5 {}
class C6 {
  @(a["b"]) m() {}
  @((): any => (t: any, k: any, d: any) => d) n() {}
  @((x: any) => x) accessor y = 1;
  @(this.x) q = 1;
  @(a) ["computed"]() {}
}
function* g() {
  class C7 { @(yield 0) m() {} }
}
async function f() {
  class C8 { @(await a) m() {} }
}
