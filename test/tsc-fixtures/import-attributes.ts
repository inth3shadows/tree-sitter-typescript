// Import attributes (TS 5.3)
import data from "./data.json" with { type: "json" };
import type cfg from "./cfg.json" with { "resolution-mode": "import" };

export async function load() {
  const m = await import("./lazy.json", { with: { type: "json" } });
  return [data, m];
}

export type Cfg = typeof cfg;
