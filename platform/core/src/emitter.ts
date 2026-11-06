// A typed event emitter: the logic of a game emits, the sound and art layers subscribe, and neither knows the other.
export class Emitter<M extends object> {
  private handlers: { [K in keyof M]?: Set<(p: M[K]) => void> } = {};
  on<K extends keyof M>(type: K, fn: (p: M[K]) => void): () => void {
    let set = this.handlers[type];
    if (!set) {
      set = new Set();
      this.handlers[type] = set;
    }
    set.add(fn);
    return () => {
      this.handlers[type]?.delete(fn);
    };
  }
  emit<K extends keyof M>(type: K, payload: M[K]) {
    for (const fn of [...(this.handlers[type] ?? [])]) fn(payload);
  }
  clear() {
    this.handlers = {};
  }
}
