// Labeled, optional and rest tuple elements (TS 4.0)
export type Range = [start: number, end?: number];
export type Args = [first: string, ...rest: number[]];
export type Mid = [a: string, ...mid: boolean[], z: number];
export type Variadic<T extends unknown[]> = [...T, last: string];
export type RO = readonly [x: number, y?: string];
export type Opt = [string?, number?];
export function f(...args: [a: number, b?: string]): void {
  void args;
}
