// Must keep parsing: export specifiers involving a name `type` (fork #18, upstream #313).
export { type } from "./a";
export type { type } from "./a";
export { type as T } from "./a";
export { type as type } from "./a";
export { type as "s" } from "./a";
export { type as as } from "./a";
export { type as } from "./a";
export { type as as x } from "./a";
export { type as as as } from "./a";
export { type, type type, x } from "./a";
