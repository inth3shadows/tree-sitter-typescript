// `accessor` is a contextual keyword, so it remains a member name (upstream #369).
class AccessorMethods {
  accessor() { return 1; }
  static accessor() { return 2; }
  get accessor() { return 3; }
}
class AccessorFields {
  accessor;
  accessor = 1;
  accessor: number = 1;
  accessor?: number;
  accessor!: number;
  readonly accessor = 1;
  accessor accessor = 1;
}
interface AccessorInterface { accessor?: boolean; accessor(): void; }
type AccessorType = { accessor: number; accessor(): void; };
class AccessorLineBreak {
  accessor
  value = 1;
  accessor
  method() {}
}
