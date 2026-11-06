// Class static initialization blocks
export class Registry {
  static items = new Map<string, number>();
  static #count = 0;

  static {
    Registry.items.set("a", 1);
    Registry.#count++;
  }

  static {
    try {
      Registry.items.set("b", 2);
    } catch {
      // ignore
    }
  }
}
