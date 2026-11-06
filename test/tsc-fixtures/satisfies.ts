// `satisfies` operator (TS 4.9)
type Colors = Record<string, [number, number, number] | string>;

export const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
} satisfies Colors;

export const nested = ({ a: 1 } satisfies Record<string, number>) as const;

export function f<T extends object>(x: T) {
  return (x satisfies object) as T;
}
