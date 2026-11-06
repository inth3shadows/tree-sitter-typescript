// Template literal types and key remapping
export type Greeting = `hello ${string}`;
export type EventName<T extends string> = `${T}Changed`;
export type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
export type Path = `${number}.${number}` | `#${Uppercase<"a" | "b">}`;
export type Split<S extends string> = S extends `${infer H}.${infer R}` ? [H, ...Split<R>] : [S];
export type NoNever<T> = { [K in keyof T as T[K] extends never ? never : K]-?: T[K] };
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
