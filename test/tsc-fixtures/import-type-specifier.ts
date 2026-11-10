// Must keep parsing: import specifiers involving `type`, `as` or `typeof` (fork #31).
// Each specifier sits in its own ambient module so no binding repeats.
declare module "src" {
  export const type: number, as: number, x: number, y: number;
  export type x = number;
  const s: number;
  export { s as typeof };
}
declare module "i1" { import { type } from "src"; }
declare module "i2" { import { type as T } from "src"; }
declare module "i3" { import { type as as } from "src"; }
declare module "i4" { import { type as } from "src"; }
declare module "i5" { import { type as as x } from "src"; }
declare module "i6" { import { type as as as } from "src"; }
declare module "i7" { import { type as as type } from "src"; }
declare module "i8" { import { typeof as t } from "src"; }
declare module "i9" { import { typeof as as } from "src"; }
declare module "i10" { import { type, type x, y } from "src"; }
