// const type parameters (TS 5.0)
export function tuple<const T extends readonly unknown[]>(...xs: T): T {
  return xs;
}

export class Box<const T> {
  constructor(public value: T) {}
  map<const U>(f: (t: T) => U): Box<U> {
    return new Box(f(this.value));
  }
}

export const id = <const T,>(x: T): T => x;

export interface Maker {
  <const T extends string>(s: T): T;
}
