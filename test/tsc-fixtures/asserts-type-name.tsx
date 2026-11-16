// `asserts` with no operand on the same line names a type (#87)
declare namespace asserts { type x = 1; namespace a { type b = 1; } }
interface asserts { v: 1 }
type Ctor = new () => asserts;
type Fn = () => asserts.x | Array<asserts>[];
type Deep = () => asserts.a.b;
declare function plain(): asserts;
type Broken = () => asserts
let afterBreak: Fn;

// ...and stays a name where an identifier is expected
declare let f: (asserts: boolean) => void;
declare let t: [asserts: number];
declare let q: asserts.a.b;
interface Child extends asserts {}
declare const n: number;
n < asserts.a.b && n > 0;
type Keys = { [asserts in "a" | "b"]: asserts };
declare function g<T>(x: unknown): T;
g<typeof asserts>(0);
declare let r: Child.asserts.x;
declare namespace JSX { interface IntrinsicElements { asserts: {} } }
const element = <asserts />;
const generic = <asserts,>(x: asserts) => x;
const ns = <a:asserts />;
