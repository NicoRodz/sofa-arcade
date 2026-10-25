import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPEAT_EVERY_MS, REPEAT_FIRST_MS, bindRemote } from './remote';

type Handler = (e: { preventDefault(): void }) => void;
// A button as far as bindRemote reads it: its data-nav, a class list and listeners (no DOM in the tests).
const make = (nav: string) => {
  const on = new Map<string, Handler[]>();
  const b = {
    dataset: { nav },
    classList: { add() {}, remove() {} },
    addEventListener: (t: string, h: Handler) => on.set(t, [...(on.get(t) ?? []), h]),
    fire: (t: string) => on.get(t)?.forEach((h) => h({ preventDefault() {} })),
  };
  return b as typeof b & HTMLElement;
};
const env = (captain = true) => {
  const sent: string[] = [];
  return {
    sent,
    env: { isCaptain: () => captain, isNavKey: (k: unknown): k is string => typeof k === 'string', send: (k: string) => sent.push(k) },
  };
};
afterEach(() => vi.useRealTimers());

describe('bindRemote', () => {
  it('an arrow answers at once, repeats while held, and stops on release', () => {
    vi.useFakeTimers();
    const { sent, env: e } = env();
    const b = make('right');
    bindRemote([b], e);
    b.fire('pointerdown');
    expect(sent).toEqual(['right']);
    vi.advanceTimersByTime(REPEAT_FIRST_MS + REPEAT_EVERY_MS * 2);
    expect(sent.length).toBe(3);
    b.fire('pointerup');
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(3);
  });
  it('OK never repeats and a phone that is not the Captain sends nothing', () => {
    vi.useFakeTimers();
    const a = env();
    const ok = make('ok');
    bindRemote([ok], a.env);
    ok.fire('pointerdown');
    vi.advanceTimersByTime(2000);
    expect(a.sent).toEqual(['ok']);
    const n = env(false);
    const up = make('up');
    bindRemote([up], n.env);
    up.fire('pointerdown');
    expect(n.sent).toEqual([]);
  });
});
