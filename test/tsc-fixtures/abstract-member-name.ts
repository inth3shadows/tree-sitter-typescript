// A member named `abstract` (upstream #377), next to `abstract` as a modifier.
export interface I {
  abstract?: boolean;
  abstract2: number;
  abstract(): void;
}

export type T = { abstract: boolean; a: 1 };

export class C {
  abstract = 1;
  static abstract = 2;
  abstract!: number;
  abstract<T>(x: T) { return x; }
}

export class D {
  abstract
  x: number = 0;
}

export abstract class A {
  abstract x: number;
  abstract m?(): void;
  protected abstract override n(): void;
  abstract readonly r: number;
  readonly abstract s: number;
  abstract abstract: number;
  abstract
  y = 1;
}

export const abstract = { abstract: 1 };
export function f(abstract: number) { return abstract + 1; }
