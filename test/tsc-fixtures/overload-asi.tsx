// Must keep parsing: a generic call signature on its own line after a member
// with no `;` (tree-sitter-typescript #335; fixed by the marionebl base).
export interface Dual {
  readonly name: string
  <A>(self: A): A
  <A, B>(self: A, that: B): A
}
export interface Keyed {
  in: number
  out: string
}
