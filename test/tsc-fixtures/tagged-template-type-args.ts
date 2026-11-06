// Must keep parsing: a tagged template with type arguments (Effect's sql<Row>`...`).
declare function sql<T>(s: TemplateStringsArray, ...v: unknown[]): T;
declare const table: string;
export const rows = sql<{ id: number; name: string }>`SELECT * FROM ${table}`;
export const one = sql<number>`SELECT 1`.valueOf();
export const nested = sql<Array<{ readonly count: number }>>`
  SELECT COUNT(*) as count FROM ${table}
`;
export const lt = 1 < 2;
