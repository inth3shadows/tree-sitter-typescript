// A contextual accessor keyword must retain its type-identifier interpretation.
type accessor = number;
type Parenthesized = (accessor);
let value: (accessor);
f<accessor>();
f<accessor>(0);
f<accessor>``;
class Derived extends Base<accessor> {}
type Qualified = accessor.Value;
f<accessor.Value>(0);
f<typeof accessor>();
f<typeof accessor>``;
const shorthand = { accessor };
const { accessor: renamed } = shorthand;
