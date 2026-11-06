// Ambient declarations (.d.ts)
declare function overloaded(x: string): string;
declare function overloaded(x: number): number;

declare const VERSION: string;
declare let mutable: number;

declare class Legacy<T = unknown> {
  constructor(x: T);
  static create(): Legacy;
  readonly prop: T;
  method?(): void;
}

declare namespace NS {
  interface Opts { a?: number }
  function run(o?: Opts): void;
}

export as namespace MyLib;
export { NS, VERSION };
export default Legacy;
