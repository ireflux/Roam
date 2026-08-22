class MemoryStorage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export function installMemoryStorage() {
  if (typeof window !== "undefined" && window.localStorage === undefined) {
    Object.defineProperty(window, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  }
}