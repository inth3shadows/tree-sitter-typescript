// Import attributes on `export * from` (#78).
export * from "./more.json" with { type: "json" };
export * from "./other.json" assert { type: "json" };
export type * as ns from "./types" with { "resolution-mode": "import" };
