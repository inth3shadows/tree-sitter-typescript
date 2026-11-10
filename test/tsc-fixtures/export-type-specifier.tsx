// Must keep parsing: export specifiers involving a name `type` (fork #18, upstream #313).
// Each specifier sits in its own ambient module so no exported name repeats.
declare module "src" {
  export const type: number, as: number, x: number;
  export type x = number;
  const s: number;
  export { s as "s" };
}
declare module "m1" { export { type } from "src"; }
declare module "m2" { export { type as T } from "src"; }
declare module "m3" { export { type as type } from "src"; }
declare module "m4" { export { type as "s" } from "src"; }
declare module "m5" { export { type as as } from "src"; }
declare module "m6" { export { type as } from "src"; }
declare module "m7" { export { type as as x } from "src"; }
declare module "m8" { export { type as as as } from "src"; }
declare module "m9" { export { type, type x } from "src"; }
declare module "m10" { export type { type } from "src"; }
