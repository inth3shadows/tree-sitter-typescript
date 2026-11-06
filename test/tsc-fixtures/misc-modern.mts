// Assorted modern syntax in an .mts module
export type { A, B } from "./types.mjs";
import { type C, D } from "./c.mjs";
import type * as NS from "./ns.mjs";

export class P {
  #priv = 1;
  static readonly s: unique symbol = Symbol();
  declare x: number;
  override toString(): string {
    return `${this.#priv}`;
  }
  has(o: object): boolean {
    return #priv in o;
  }
}

export const a = obj?.b?.[0]?.(1) ?? 2;
let n: number | undefined;
n ||= 1;
n &&= 2;
n ??= 3;
export const big = 10n ** 2n;
export const sep = 1_000_000;
export type Opt = Partial<{ a: 1 }> & { readonly [k: string]: unknown };
declare const obj: { b?: [(x: number) => number] };
void C, D;
export type { NS };
