// `await using` declaration in a for-of head (TS 5.2, #69).
declare const asyncHandles: AsyncIterable<AsyncDisposable>;
declare const syncHandles: AsyncDisposable[];
export async function drain() {
  for await (await using h of asyncHandles) { void h; }
  for await (using h of asyncHandles) { void h; }
  for (await using h of syncHandles) { void h; }
}
