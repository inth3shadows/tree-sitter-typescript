// `using` declarations with type annotations and several declarators (TS 5.2, #69).
declare function open(): Disposable;
declare function openAsync(): Promise<AsyncDisposable>;

export function sync(): void {
  using a: Disposable = open(), b = open();
  using c = open();
  void a, b, c;
}

export async function asyncUse(): Promise<void> {
  await using r: AsyncDisposable = await openAsync(), s = await openAsync();
  void r, s;
}

// `using` stays an identifier where no binding follows on the same line.
declare let using: number;
using
void using;
