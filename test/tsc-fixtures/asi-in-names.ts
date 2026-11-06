// Must keep parsing: identifiers starting with `in` after a line with no `;`
// (upstream #373), members named `in`, and `in` continuing an expression.
declare let in2: number, in$x: number, b: object;
let a = 1
in2 = 3
let c = 1
in$x = 4
export interface I {
  a: string
  in?: number
}
export interface J {
  a(): void
  in<T>(): T
}
export class K {
  a = 1
  in!: number
}
export const d = "x"
  in b
