// Must keep parsing in tsx: a generic arrow whose parameter is named `out`.
export const id = <out,>(x: out): out => x;
