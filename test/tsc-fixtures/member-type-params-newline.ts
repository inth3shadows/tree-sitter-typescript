// Must keep parsing: a member name with its type parameters on the next line
// is one method (tsc), not a property plus a call signature. The class forms
// fail to parse if split; the interface form only shows in node kinds
// (the corpus test in test/corpus/declarations.txt).
export interface Repo {
  find
    <T>(id: string): T
}
export class Svc {
  load
    <T>(id: string): T { return null! }
}
export abstract class Base {
  abstract make
    <T>(): T
}
