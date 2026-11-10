// Must keep parsing: a block comment that spans a line break is a line break for ASI (fork #26).
declare const b: number, c: number, e: number, f: number;
declare let y: number;
declare const g: { h: () => void };
let a = b /* x
 */ c
let x = 1 /* a
 */ ++y
abstract class C {
  abstract /* x
  */ y: number
  readonly /* x
  */ z: number
  declare /* x
  */ w: number
}
let d = e /* same line */ + f
g /* x
 */ .h()
