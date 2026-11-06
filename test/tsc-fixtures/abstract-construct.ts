// Abstract construct signatures (TS 4.2) and abstract members
export type AbstractCtor<T = object> = abstract new (...args: any[]) => T;

export function Mixin<TBase extends abstract new (...args: any[]) => object>(Base: TBase) {
  abstract class Mixed extends Base {
    abstract name(): string;
  }
  return Mixed;
}

export abstract class Shape {
  abstract readonly sides: number;
  protected abstract area(): number;
  abstract get label(): string;
}

export interface Factory {
  new (x: number): object;
}

export type Ctor = abstract new () => object;
