// A constructor type may return a type predicate or an assertion (#85)
type IsCtor = new () => x is string;
type ThisCtor = new () => this is object;
type AssertsCtor = abstract new () => asserts x;
type AssertsIsCtor = new () => asserts x is string;
