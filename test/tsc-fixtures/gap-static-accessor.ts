// Known gap: `static accessor` (TS 4.9 auto-accessors). Plain `accessor` parses: see accessor.ts.
export class Config { static accessor shared = 1; }
