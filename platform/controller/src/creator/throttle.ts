// Leading + trailing throttle for the live look: the first change goes out at once, the rest wait for the window and only the latest is sent (the relay allows 5/s; we use 300 ms).
export const LIVE_MS = 300;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as never),
};

export interface Throttle<T> {
  push(v: T): void; // a live change
  now(v: T): void; // "Listo": goes out at once and drops whatever was waiting
  cancel(): void;
}

export function createThrottle<T>(send: (v: T) => void, ms = LIVE_MS, clock: Clock = realClock): Throttle<T> {
  let last = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;
  let waiting: { v: T } | null = null;
  const fire = (v: T) => {
    last = clock.now();
    send(v);
  };
  const cancel = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    waiting = null;
  };
  return {
    push(v) {
      const left = last + ms - clock.now();
      if (left <= 0 && timer === null) return fire(v);
      waiting = { v }; // only the latest survives
      if (timer !== null) return;
      timer = clock.setTimeout(
        () => {
          const w = waiting;
          timer = null;
          waiting = null;
          if (w) fire(w.v);
        },
        Math.max(0, left),
      );
    },
    now(v) {
      cancel();
      fire(v);
    },
    cancel,
  };
}
