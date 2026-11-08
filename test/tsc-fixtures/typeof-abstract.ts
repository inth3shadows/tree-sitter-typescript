// A value named abstract must remain available to type queries in generic calls.
function abstract<T>(value: T): T { return value; }
namespace abstract { export const value = 0; }
function f<T>(value: T): T { return value; }
function tag<T>(parts: readonly string[]): string { return parts[0]; }
const holder = { abstract: abstract };

export function caller() {
  f<typeof abstract>(abstract);
  f<typeof abstract.value>(0);
  f<typeof holder.abstract>(abstract);
  tag<typeof abstract>`hello`;
  return abstract(1);
}

type Parenthesized = (typeof abstract);
type Qualified = (typeof abstract.value);
type Property = typeof holder.abstract;
type Instantiated = typeof abstract<number>;
type ParenthesizedInstantiation = (typeof abstract<number>);
type Lookup = typeof abstract["value"];
