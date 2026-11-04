// The engine against a fake AudioContext and window: Manchazo's sound is unlocked by the platform's gate and has its own mute flag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeCtx {
  state: 'suspended' | 'running' = 'suspended';
  resumes = 0;
  currentTime = 0;
  sampleRate = 8;
  destination = {};
  listeners: Array<() => void> = [];
  node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = { gain: { value: 1, setTargetAtTime() {} }, threshold: {}, ratio: {}, attack: {}, release: {} };
    n.connect = (to: unknown) => to ?? n;
    return n;
  };
  createDynamicsCompressor = this.node;
  createWaveShaper = this.node;
  createGain = this.node;
  createBuffer = () => ({ getChannelData: () => new Float32Array(8) });
  addEventListener(_: string, fn: () => void) {
    this.listeners.push(fn);
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    this.listeners.forEach((f) => f());
    return Promise.resolve();
  }
}

const store = new Map<string, string>();
const els: Array<{ textContent: string | null; style: { display: string; cssText: string } }> = [];
let win: EventTarget & { AudioContext?: unknown };
let ctxs: FakeCtx[];

beforeEach(() => {
  vi.resetModules(); // a fresh audio gate per test
  store.clear();
  els.length = 0;
  ctxs = [];
  win = new EventTarget();
  win.AudioContext = class extends FakeCtx {
    constructor() {
      super();
      ctxs.push(this);
    }
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in the test')));
  vi.stubGlobal('document', {
    createElement: () => {
      const el = { textContent: null, style: { display: '', cssText: '' } };
      els.push(el);
      return el;
    },
    body: { appendChild: () => {} },
  });
});
afterEach(() => vi.unstubAllGlobals());

const load = async () => (await import('./engine')) as typeof import('./engine');

describe('Manchazo engine unlock', () => {
  it('stays suspended and asks for a click until a gesture reaches the TV, then runs', async () => {
    const { createEngine } = await load();
    expect(createEngine()).not.toBeNull();
    expect(ctxs[0].state).toBe('suspended');
    expect(els[0].textContent).toBe('Haz clic para activar el sonido');
    win.dispatchEvent(new Event('pointerdown'));
    expect(ctxs[0].state).toBe('running');
    expect(els[0].textContent).toBe(''); // unlocked and not muted: the hint hides
    expect(els[0].style.display).toBe('none');
  });
  it('a gesture in the menu, before the engine exists, unlocks the engine the moment it is created', async () => {
    const { audioGate } = await import('@pichi/screen-kit/audio');
    audioGate(); // installed at boot (initPage)
    win.dispatchEvent(new Event('keydown')); // the menu click
    const { createEngine } = await load();
    createEngine();
    expect(ctxs[0].state).toBe('running');
  });
  it('a later gesture resumes the context if the browser suspended it again', async () => {
    const { createEngine } = await load();
    createEngine();
    win.dispatchEvent(new Event('pointerdown'));
    ctxs[0].state = 'suspended';
    win.dispatchEvent(new Event('touchstart'));
    expect(ctxs[0].resumes).toBe(2);
    expect(ctxs[0].state).toBe('running');
  });
});

describe('Manchazo mute flag', () => {
  it("is its own: Pizzas' 'pg.muted' does not mute Manchazo, and muting Manchazo does not touch Pizzas' flag", async () => {
    store.set('pg.muted', '1'); // muted in Pizzas
    const { createEngine, MUTE_KEY } = await load();
    const sound = createEngine()!;
    win.dispatchEvent(new Event('pointerdown'));
    expect(els[0].textContent).toBe(''); // not muted here: no "silenciado" sign
    sound.toggleMute();
    expect(store.get(MUTE_KEY)).toBe('1');
    expect(MUTE_KEY).not.toBe('pg.muted');
    expect(store.get('pg.muted')).toBe('1');
    expect(els[0].textContent).toBe('Sonido silenciado (M)');
    sound.toggleMute();
    expect(store.get(MUTE_KEY)).toBe('0');
    expect(els[0].textContent).toBe('');
  });
  it('a Manchazo mute from an earlier session shows the sign from the start', async () => {
    const { createEngine, MUTE_KEY } = await load();
    store.set(MUTE_KEY, '1');
    createEngine();
    win.dispatchEvent(new Event('pointerdown'));
    expect(els[0].textContent).toBe('Sonido silenciado (M)');
  });
});
