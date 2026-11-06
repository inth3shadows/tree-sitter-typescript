// CommonJS-flavoured TypeScript (.cts)
import fs = require("node:fs");
const x: typeof fs = fs;
export = { x, read: (p: string): string => fs.readFileSync(p, "utf8") };
