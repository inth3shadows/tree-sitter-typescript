// Must keep parsing: tsc continues these keywords across a line break (fork #26 M0).
declare class Foo {}
let
a = 1
const b = new
Foo()
export
const c = 1
export { a }
from "./asi-continue-keywords"
class C {
  static
  d = 1
  get
  e() { return 1 }
  set
  e(v: number) {}
  static
  {}
}
interface I {
  get
  f(): number
}
