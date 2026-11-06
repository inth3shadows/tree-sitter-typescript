// Reserved words as module export/import names (ES2015 IdentifierName). The current
// grammar parses these; SegaraRai/tree-sitter-typescript@82b3609 does not (Effect, Zod).
import { null as n, void as v } from "./mod";
const a = 1;
export { a as null, a as delete, n as function, v as void };
export { null as x, a as default } from "./mod";
export * as delete from "./mod";
