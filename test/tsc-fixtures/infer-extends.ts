// `infer X extends Y` (TS 4.7)
export type FirstString<T> = T extends [infer S extends string, ...unknown[]] ? S : never;

export type ToNum<S extends string> = S extends `${infer N extends number}` ? N : never;

export type Unwrap<T> = T extends Promise<infer U extends object> ? U : T;

export type Both<T> = T extends [infer A extends string, infer B extends number] ? [A, B] : never;
