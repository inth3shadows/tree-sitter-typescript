// Known gap: `using` declaration in a for-of head (TS 5.2).
declare const handles: Disposable[];
for (using h of handles) { void h; }
