// Assertion functions and type predicates
export function assertString(x: unknown): asserts x is string {
  if (typeof x !== "string") throw new Error("no");
}

export function assertTruthy(x: unknown, msg?: string): asserts x {
  if (!x) throw new Error(msg);
}

export function isNum(x: unknown): x is number {
  return typeof x === "number";
}

export class Guard {
  isThis(): this is Guard {
    return true;
  }
  assertThis(): asserts this is Guard {}
}

export const arrow = (x: unknown): x is string => typeof x === "string";
