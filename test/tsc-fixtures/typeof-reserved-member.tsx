// A reserved word as the member after `typeof` in a type position (`typeof X.default`).
// The current grammar parses these; SegaraRai/tree-sitter-typescript@82b3609 does not
// (VS Code's `typeof import("x").default` is the common real-world form).
declare const ns: { default: 1; delete: 2; null: 3; b: { delete: 4 } };
export type A = typeof import("./mod").default;
export type B = typeof ns.default;
export type C = typeof ns.b.delete;
export let v: typeof ns.null;
