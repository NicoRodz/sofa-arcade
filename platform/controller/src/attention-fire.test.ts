// The side-effect half of attention.ts that attention.test.ts (the pure `cueFor`) leaves out: the #cue flash, the vibration pattern per cue, the tone that only plays
// once a touch has unlocked the audio, and `attend` tying a relay message to its cue. Fake DOM, fake AudioContext, a fresh module per test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMsg } from '@pichi/core';

class FakeEl {
  id = '';
  offsetWidth = 0;
  cls = new Set<string>();
  classList = {
    add: (c: string) => this.cls.add(c),
    remove: (...c: string[]) => c.forEach((x) => this.cls.delete(x)),
    toggle: (c: string, on: boolean) => (on ? this.cls.add(c) : this.cls.delete(c)),
  };
}
const body: FakeEl[] = [];
const listeners: Record<string, () => void> = {};
const audio = { state: 'running', oscillators: 0, resumed: 0, throws: false, created: 0 };
class FakeAudio {
  currentTime = 0;
  destination = {};
  get state() {
    return audio.state;
  }
  constructor() {
    if (audio.throws) throw new Error('no audio');
    audio.created++;
  }
  resume() {
    audio.resumed++;
    return Promise.resolve();
  }
  createOscillator() {
    audio.oscillators++;
    return { frequency: { value: 0 }, connect: (x: unknown) => x, start: () => {}, stop: () => {} };
  }
  createGain() {
    return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (x: unknown) => x };
  }
}
const vibrate = vi.fn();
const load = async () => {
  vi.resetModules();
  return import('./attention');
};
const unlock = () => listeners.pointerdown!();
const cue = () => body.find((e) => e.id === 'cue')!;

beforeEach(() => {
  body.length = 0;
  Object.assign(audio, { state: 'running', oscillators: 0, resumed: 0, throws: false, created: 0 });
  vibrate.mockReset();
  vi.stubGlobal('document', { createElement: () => new FakeEl(), body: { appendChild: (e: FakeEl) => body.push(e) } });
  vi.stubGlobal('addEventListener', (t: string, h: () => void) => (listeners[t] = h));
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.stubGlobal('navigator', { vibrate });
});
afterEach(() => vi.unstubAllGlobals());

describe('fireCue', () => {
  it('makes the #cue element once and flashes it; only the crown cue (turn) is long', async () => {
    const { fireCue } = await load();
    fireCue('go');
    fireCue('turn');
    expect(body.filter((e) => e.id === 'cue')).toHaveLength(1);
    expect(cue().cls.has('on')).toBe(true);
    expect(cue().cls.has('long')).toBe(true);
    fireCue('done');
    expect(cue().cls.has('long')).toBe(false);
  });
  it('vibrates with the pattern of the cue', async () => {
    const { fireCue } = await load();
    fireCue('alert');
    expect(vibrate).toHaveBeenLastCalledWith([80, 50, 80, 50, 160]);
    fireCue('soft');
    expect(vibrate).toHaveBeenLastCalledWith([40]);
  });
  it('a phone that refuses to vibrate, or has no API (iOS), still flashes', async () => {
    const { fireCue } = await load();
    vibrate.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => fireCue('go')).not.toThrow();
    vi.stubGlobal('navigator', {});
    expect(() => fireCue('go')).not.toThrow();
    expect(cue().cls.has('on')).toBe(true);
  });
});

describe('the tone', () => {
  it('is silent until a touch unlocks the audio', async () => {
    const { fireCue } = await load();
    fireCue('turn');
    expect(audio.oscillators).toBe(0);
  });
  it('after the first touch it plays one oscillator per note of the cue', async () => {
    const { fireCue } = await load();
    unlock();
    expect(audio.resumed).toBe(1);
    fireCue('turn');
    expect(audio.oscillators).toBe(3);
    fireCue('go');
    expect(audio.oscillators).toBe(5);
    fireCue('soft');
    expect(audio.oscillators).toBe(6);
  });
  it('the audio is created once, however many touches', async () => {
    await load();
    unlock();
    unlock();
    expect(audio.created).toBe(1);
    expect(audio.resumed).toBe(2);
  });
  it('a context the browser keeps suspended plays nothing, and a phone without audio does not throw on touch', async () => {
    const { fireCue } = await load();
    unlock();
    audio.state = 'suspended';
    fireCue('go');
    expect(audio.oscillators).toBe(0);
    audio.throws = true;
    await load();
    expect(() => unlock()).not.toThrow();
  });
});

describe('attend', () => {
  it('flashes for a message that deserves a cue, not for one that does not', async () => {
    const { attend } = await load();
    attend({ t: 'pong', id: 1, ts: 1 } as ServerMsg, 1);
    expect(body).toHaveLength(0);
    attend({ t: 'phase', phase: 'results' } as ServerMsg, 1);
    expect(cue().cls.has('on')).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([90, 50, 160]);
  });
  it('keeps its memory between messages: the second `playing` does not ring again', async () => {
    const { attend } = await load();
    attend({ t: 'phase', phase: 'playing' } as ServerMsg, 1);
    attend({ t: 'phase', phase: 'playing' } as ServerMsg, 1);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

describe('cueFor, the branches left', () => {
  const m = (x: object) => x as ServerMsg;
  it('a refused menu touch is an alert; an assist only matters for the phone it names and when it turns on', async () => {
    const { cueFor } = await load();
    const mem = { phase: null, captain: null };
    expect(cueFor(m({ t: 'menuErr' }), 1, mem)).toBe('alert');
    expect(cueFor(m({ t: 'assist', playerId: 1, on: true }), 1, mem)).toBe('soft');
    expect(cueFor(m({ t: 'assist', playerId: 1, on: false }), 1, mem)).toBeNull();
    expect(cueFor(m({ t: 'assist', playerId: 2, on: true }), 1, mem)).toBeNull();
  });
  it('only the alert buzz asks to look at the screen', async () => {
    const { cueFor } = await load();
    const mem = { phase: null, captain: null };
    expect(cueFor(m({ t: 'buzz', kind: 'alert' }), 1, mem)).toBe('alert');
    expect(cueFor(m({ t: 'buzz', kind: 'pick' }), 1, mem)).toBeNull();
    expect(cueFor(m({ t: 'whatever' }), 1, mem)).toBeNull();
  });
  it('the menu snapshot rings softly once, and only for the Captain', async () => {
    const { cueFor } = await load();
    const mem = { phase: null, captain: 1 as number | null, menu: false };
    expect(cueFor(m({ t: 'menu' }), 1, mem)).toBe('soft');
    expect(cueFor(m({ t: 'menu' }), 1, mem)).toBeNull();
    expect(cueFor(m({ t: 'menu' }), 2, { phase: null, captain: 1 })).toBeNull();
    expect(cueFor(m({ t: 'menu' }), null, { phase: null, captain: null })).toBeNull();
  });
});
