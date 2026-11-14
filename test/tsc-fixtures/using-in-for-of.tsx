// `using` declaration in a for-of head (TS 5.2, #69).
declare const handles: Disposable[];
for (using h of handles) { void h; }
for (using as of handles) { void as; }
// `using` as the left side of a for head stays an identifier.
let using: Disposable;
for (using of handles) {}
