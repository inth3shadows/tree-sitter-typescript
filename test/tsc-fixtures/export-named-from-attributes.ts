// Import attributes on a named re-export (#78).
export { default as data } from "./data.json" with { type: "json" };
export { default as more } from "./more.json" assert { type: "json" };
export type { T } from "./types" with { "resolution-mode": "import" };
