// TSX: generic arrows need `<T,>` or `extends`
import * as React from "react";

export const identity = <T,>(x: T): T => x;
export const withExtends = <T extends object>(x: T) => x;
export const pair = <A, B>(a: A, b: B): [A, B] => [a, b];

export function List<T>(props: { items: T[]; render: (t: T) => React.ReactNode }) {
  return <ul>{props.items.map((i) => <li>{props.render(i)}</li>)}</ul>;
}

export const el = <List<number> items={[1, 2]} render={(n) => <b>{n}</b>} />;
export const frag = <>text {identity<string>("x")}</>;
