// Must keep parsing: `out` / `in`-adjacent names as plain type parameters.
// Both upstream variance PRs (#361, #364) regress these.
export type A<out> = out[];
export type B<out = string> = out;
export type C<out, T> = [out, T];
