// Enums, namespaces, modules, global augmentation
export enum Dir { Up = 1, Down, Left = "L".length, Right = Left << 1 }
export const enum CE { A = "a", B = "b" }
export declare enum DE { X, Y }

export namespace Outer.Inner {
  export const v = 1;
  export namespace Deep {
    export type T = string;
  }
}

declare module "some-mod" {
  export function f(): void;
}

declare global {
  interface Window {
    custom: string;
  }
}

export import Alias = Outer.Inner;
import fs = require("fs");
export = fs;
