// The Captain's D-pad during the iris (1 s): the screen ignores keys while it moves, so the last distinct key waits and runs when the iris is free.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../net/socket', () => ({ sendMsg: () => {}, socket: () => undefined, setSocket: () => {} }));
vi.stubGlobal('location', { search: '', host: 'x' });

let st: typeof import('./app-state');
let irisDone: (() => void) | undefined;
const applied: string[] = [];
const apply = (k: string) => applied.push(k);

beforeAll(async () => {
  st = await import('./app-state');
  st.bindCaptainKeySink(apply);
});
beforeEach(() => {
  vi.useFakeTimers();
  applied.length = 0;
  irisDone = undefined;
  st.resetCaptainKeys();
  st.app.starting = false;
  st.bindServices({
    iris: (swap, done) => {
      swap();
      irisDone = done;
    },
  });
});
afterEach(() => vi.useRealTimers());

describe('Captain keys during the iris', () => {
  it('applies a key at once when the iris is free', () => {
    st.routeCaptainKey('Enter', apply);
    expect(applied).toEqual(['Enter']);
  });

  it('holds the key pressed during the iris and runs it when the iris ends', () => {
    st.transition(() => {});
    expect(st.app.starting).toBe(true);
    st.routeCaptainKey('Enter', apply);
    expect(applied).toEqual([]);
    irisDone?.();
    expect(st.app.starting).toBe(false);
    expect(applied).toEqual(['Enter']);
  });

  it('keeps only the last distinct key', () => {
    st.transition(() => {});
    st.routeCaptainKey('ArrowDown', apply);
    st.routeCaptainKey('Enter', apply);
    irisDone?.();
    expect(applied).toEqual(['Enter']);
  });

  it('drops a double tap: a repeat of the key that began the iris would also skip what it opened', () => {
    st.routeCaptainKey('Enter', apply);
    st.transition(() => {});
    st.routeCaptainKey('Enter', apply);
    irisDone?.();
    expect(applied).toEqual(['Enter']);
  });

  it('a back followed by OK within the iris is not lost', () => {
    st.routeCaptainKey('Escape', apply);
    st.transition(() => {});
    st.routeCaptainKey('Enter', apply);
    irisDone?.();
    expect(applied).toEqual(['Escape', 'Enter']);
  });

  it('runs nothing when no key was held', () => {
    st.transition(() => {});
    irisDone?.();
    expect(applied).toEqual([]);
  });
});
