// A constructor type may return a type predicate or an assertion (#85)
type IsCtor = new () => x is string;
type ThisCtor = new () => this is object;
type AssertsCtor = abstract new () => asserts x;
type AssertsIsCtor = new () => asserts x is string;

// `asserts` with no operand on the same line names a type
type asserts = { a: 1 };
declare namespace asserts { type x = 1; }
type Named = new () => asserts;
type Nested = new () => asserts.x;
type Generic = () => asserts | Array<asserts>[];
declare function plain(): asserts;
type Wrapped = new () => asserts
let afterBreak: Named;
