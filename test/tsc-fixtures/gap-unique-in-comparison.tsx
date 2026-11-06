// Gap: `unique` lexes as the keyword of `unique symbol` wherever type
// arguments can start, so `i < unique.length` fails. Fixing it by making
// `unique` a reserved identifier broke `f<typeof unique>(x)` instead.
declare const unique: string[];
for (let i = 0; i < unique.length; i++) {}
