// Explicit resource management (TS 5.2)
interface Res {
  [Symbol.dispose](): void;
}
interface AsyncRes {
  [Symbol.asyncDispose](): Promise<void>;
}

declare function open(): Res;
declare function openAsync(): Promise<AsyncRes>;

export function sync(): void {
  using a = open();
  using b = open(), c = open();
  void a, b, c;
}

export async function asyncUse(): Promise<void> {
  await using r = await openAsync();
  void r;
}
