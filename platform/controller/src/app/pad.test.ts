// The phone's input path: what the stick and buttons put on the wire. A press lost here is a pizza the player "did" but the screen never saw.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INPUT_HZ, PRESS_MOD } from '@pichi/core';
import { sendInput, startPad } from './pad';
import type { Session } from './store';

type Handler = (e: any) => void;
const stickHandlers: Record<string, Handler> = {};
vi.mock('nipplejs', () => ({
  default: { create: () => ({ on: (ev: string, fn: Handler) => void (stickHandlers[ev] = fn) }) },
}));

class FakeEl {
  handlers: Record<string, Handler> = {};
  cls = new Set<string>();
  captured: number[] = [];
  dataset: Record<string, string> = {};
  classList = { add: (c: string) => this.cls.add(c), remove: (c: string) => this.cls.delete(c) };
  addEventListener = (ev: string, fn: Handler) => void (this.handlers[ev] = fn);
  setPointerCapture = (id: number) => void this.captured.push(id);
  fire(ev: string, pointerId = 1) {
    this.handlers[ev]!({ pointerId, preventDefault: () => {} });
  }
}

let els: Record<string, FakeEl>;
let signals: FakeEl[];
let sock: { readyState: number; sent: any[]; send(s: string): void };

const session = (over: Partial<Session> = {}): Session =>
  ({
    root: { querySelectorAll: () => signals },
    $: (id: string) => (els[id] ??= new FakeEl()),
    pad: { x: 0, y: 0, btn: 0, presses: [0, 0], seq: 0, sig: { kind: 'go', seq: 0 }, go: false },
    ws: sock,
    joined: true,
    phase: 'playing',
    signalsOn: false,
    ...over,
  }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  els = {};
  signals = [];
  sock = { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } };
  for (const k of Object.keys(stickHandlers)) delete stickHandlers[k];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sendInput', () => {
  it('is silent until the phone has joined', () => {
    sendInput(session({ joined: false }));
    expect(sock.sent).toEqual([]);
  });

  it.each(['menu', 'lobby', 'results'] as const)('is silent in the %s phase (no stray input into a screen that is not playing)', (phase) => {
    sendInput(session({ phase }));
    expect(sock.sent).toEqual([]);
  });

  it.each(['playing', 'school'] as const)('sends in the %s phase, with an increasing seq', (phase) => {
    const s = session({ phase });
    sendInput(s);
    sendInput(s);
    expect(sock.sent.map((m) => [m.t, m.seq])).toEqual([['input', 0], ['input', 1]]);
  });

  it('carries stick, button bitmask and press counters as they are', () => {
    const s = session();
    Object.assign(s.pad, { x: 0.5, y: -1, btn: 3, presses: [7, 9] });
    sendInput(s);
    expect(sock.sent[0]).toMatchObject({ x: 0.5, y: -1, btn: 3, presses: [7, 9] });
  });

  it('adds the signal pad only when the round uses it', () => {
    const off = session();
    sendInput(off);
    expect(sock.sent[0]).not.toHaveProperty('sig');
    const on = session({ signalsOn: true });
    on.pad.sig = { kind: 'go', seq: 4 };
    on.pad.go = true;
    sendInput(on);
    expect(sock.sent[1]).toMatchObject({ sig: { kind: 'go', seq: 4 }, go: true });
  });

  it('drops the packet instead of throwing when the socket is not open', () => {
    sock.readyState = 3;
    expect(() => sendInput(session())).not.toThrow();
    expect(sock.sent).toEqual([]);
  });
});

describe('startPad: stick', () => {
  it('a stick move puts the deadzone-filtered vector on the pad, with y flipped to screen orientation', () => {
    const s = session();
    startPad(s);
    stickHandlers.move!({ data: { vector: { x: 1, y: 1 } } });
    expect(s.pad.x).toBeGreaterThan(0.5);
    expect(s.pad.y).toBeLessThan(-0.5);
  });

  it('releasing the stick zeroes it (a lifted thumb must not keep the chef walking)', () => {
    const s = session();
    startPad(s);
    stickHandlers.move!({ data: { vector: { x: 1, y: 0 } } });
    stickHandlers.end!({});
    expect([s.pad.x, s.pad.y]).toEqual([0, 0]);
  });

  it('sends input at INPUT_HZ even if nothing changes (the relay needs the heartbeat)', () => {
    startPad(session());
    vi.advanceTimersByTime(1000);
    expect(sock.sent.length).toBe(INPUT_HZ);
  });
});

describe('startPad: buttons', () => {
  it('pressing A sets bit 0, counts a press and sends right away; releasing clears the bit and sends again', () => {
    const s = session();
    startPad(s);
    els.btnA!.fire('pointerdown');
    expect(s.pad.btn).toBe(1);
    expect(s.pad.presses).toEqual([1, 0]);
    expect(sock.sent.at(-1)).toMatchObject({ btn: 1, presses: [1, 0] });
    els.btnA!.fire('pointerup');
    expect(s.pad.btn).toBe(0);
    expect(sock.sent.at(-1)).toMatchObject({ btn: 0, presses: [1, 0] });
  });

  it('B uses bit 1 and its own counter, and both can be held at once', () => {
    const s = session();
    startPad(s);
    els.btnA!.fire('pointerdown', 1);
    els.btnB!.fire('pointerdown', 2);
    expect(s.pad.btn).toBe(3);
    expect(s.pad.presses).toEqual([1, 1]);
  });

  it('a second finger on the same button neither double counts nor releases the first', () => {
    const s = session();
    startPad(s);
    els.btnA!.fire('pointerdown', 1);
    els.btnA!.fire('pointerdown', 2);
    expect(s.pad.presses).toEqual([1, 0]);
    els.btnA!.fire('pointerup', 2);
    expect(s.pad.btn).toBe(1);
    els.btnA!.fire('pointercancel', 1);
    expect(s.pad.btn).toBe(0);
  });

  it('the press counter wraps at PRESS_MOD like the screen expects', () => {
    const s = session();
    s.pad.presses = [PRESS_MOD - 1, 0];
    startPad(s);
    els.btnA!.fire('pointerdown');
    expect(s.pad.presses[0]).toBe(0);
  });

  it('the button shows pressed while held', () => {
    startPad(session());
    els.btnA!.fire('pointerdown');
    expect(els.btnA!.cls.has('down')).toBe(true);
    els.btnA!.fire('pointercancel');
    expect(els.btnA!.cls.has('down')).toBe(false);
  });
});

describe('startPad: signal pad', () => {
  const sig = (kind: string) => {
    const el = new FakeEl();
    el.dataset.sig = kind;
    signals.push(el);
    return el;
  };

  it('ignores presses while the round does not use signals', () => {
    const go = sig('go');
    const s = session({ signalsOn: false });
    startPad(s);
    go.fire('pointerdown');
    expect(s.pad.sig.seq).toBe(0);
  });

  it('a press is one signal (seq +1); "go" is held until released', () => {
    const go = sig('go');
    const s = session({ signalsOn: true });
    startPad(s);
    go.fire('pointerdown');
    expect(s.pad.sig).toEqual({ kind: 'go', seq: 1 });
    expect(s.pad.go).toBe(true);
    expect(sock.sent.at(-1)).toMatchObject({ sig: { kind: 'go', seq: 1 }, go: true });
    go.fire('pointerup');
    expect(s.pad.go).toBe(false);
  });

  it('a non-go signal never holds go', () => {
    const wait = sig('wait');
    const s = session({ signalsOn: true });
    startPad(s);
    wait.fire('pointerdown');
    expect(s.pad.sig.kind).toBe('wait');
    expect(s.pad.go).toBe(false);
  });

  it('keeps working on a device without navigator.vibrate that throws (iOS)', () => {
    const go = sig('go');
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('nope'); } });
    const s = session({ signalsOn: true });
    startPad(s);
    expect(() => go.fire('pointerdown')).not.toThrow();
    expect(s.pad.sig.seq).toBe(1);
  });
});
