// The note over the pad when a buzz carries one (notes.ts): the slip line that fades after its time, and the whole-phone note of an event (colour, text, tone)
// that replaces the previous one and fades on its own. Fake DOM and fake AudioContext, fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showNote } from './notes';

class FakeEl {
  id = '';
  textContent = '';
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  cls = new Set<string>();
  classList = { add: (c: string) => this.cls.add(c), remove: (c: string) => this.cls.delete(c) };
  replaceChildren = () => {
    this.children = [];
  };
  append = (...c: FakeEl[]) => this.children.push(...c);
}
const doc = { slip: undefined as FakeEl | undefined, body: [] as FakeEl[], made: [] as FakeEl[] };
const tones: number[] = [];
class FakeAudio {
  currentTime = 0;
  destination = {};
  createOscillator() {
    const o = { frequency: { value: 0 }, connect: (x: unknown) => x, start: () => tones.push(o.frequency.value), stop: () => {} };
    return o;
  }
  createGain() {
    return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (x: unknown) => x };
  }
}
const evnote = () => doc.body.find((e) => e.id === 'evnote')!;

beforeEach(() => {
  doc.slip = new FakeEl();
  doc.body = [];
  doc.made = [];
  tones.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'slip' ? doc.slip : (doc.body.find((e) => e.id === id) ?? null)),
    createElement: () => {
      const e = new FakeEl();
      doc.made.push(e);
      return e;
    },
    body: { appendChild: (e: FakeEl) => doc.body.push(e) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the slip line', () => {
  it('writes the text in its colour and clears it after its time', () => {
    showNote('slip');
    expect(doc.slip).toMatchObject({ textContent: '¡Resbalaste!', style: { color: 'var(--cheese)' } });
    expect(doc.slip!.cls.has('on')).toBe(true);
    vi.advanceTimersByTime(899);
    expect(doc.slip!.cls.has('on')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(doc.slip!.cls.has('on')).toBe(false);
  });
  it('a second note restarts the clock instead of being cut by the first one', () => {
    showNote('slip');
    vi.advanceTimersByTime(600);
    showNote('slip');
    vi.advanceTimersByTime(600); // 1200 since the first, 600 since the second
    expect(doc.slip!.cls.has('on')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(doc.slip!.cls.has('on')).toBe(false);
  });
  it('each hazard has its own text, and the long ones stay longer', () => {
    showNote('big');
    expect(doc.slip!.textContent).toBe('¡Fuego grande! Necesitan 2');
    vi.advanceTimersByTime(1000);
    expect(doc.slip!.cls.has('on')).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(doc.slip!.cls.has('on')).toBe(false);
    showNote('ice');
    expect(doc.slip!.textContent).toBe('Hielo: frena antes');
    showNote('dodge');
    expect(doc.slip!.textContent).toBe('¡Te esquivó! Atrápala cuando jadee');
  });
  it('a buzz with no note, or a pad without the slip element, does nothing and does not throw', () => {
    showNote('pick');
    expect(doc.slip!.textContent).toBe('');
    doc.slip = undefined;
    expect(() => showNote('slip')).not.toThrow();
  });
});

describe('the event note', () => {
  it('covers the phone in the event colours with a title and a line, and plays its tone', () => {
    showNote('evrush');
    const n = evnote();
    expect(n.style).toMatchObject({ background: '#ff8a1f', color: '#2b1200', opacity: '0.93' });
    expect(n.children.map((c) => c.textContent)).toEqual(['¡Hora punta!', 'Despacha los tickets rojos']);
    expect(tones).toEqual([660]);
  });
  it('fades after its time', () => {
    showNote('evwin');
    vi.advanceTimersByTime(1799);
    expect(evnote().style.opacity).toBe('0.93');
    vi.advanceTimersByTime(2);
    expect(evnote().style.opacity).toBe('0');
  });
  it('reuses the one element: the next event replaces the text and restarts the fade', () => {
    showNote('evrush');
    vi.advanceTimersByTime(3000);
    showNote('evfail');
    expect(doc.body.filter((e) => e.id === 'evnote')).toHaveLength(1);
    expect(evnote().children.map((c) => c.textContent)).toEqual(['Ay no...', 'No alcanzó']);
    expect(evnote().style.background).toBe('#d7263d');
    vi.advanceTimersByTime(1000); // the first fade (3200) would have fired by now
    expect(evnote().style.opacity).toBe('0.93');
    vi.advanceTimersByTime(900);
    expect(evnote().style.opacity).toBe('0');
  });
  it('does not take the pad: pointer-events none, and the slip is not touched', () => {
    showNote('evdark');
    expect(evnote().style.cssText).toContain('pointer-events:none');
    expect(doc.slip!.textContent).toBe('');
  });
  it('a phone with no audio still shows the note', async () => {
    vi.resetModules(); // a fresh module: the tone of the earlier tests is cached in the old one
    const { showNote: fresh } = await import('./notes');
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('no audio');
        }
      },
    );
    expect(() => fresh('evbday')).not.toThrow();
    expect(evnote().children[0]!.textContent).toBe('¡Cumpleaños!');
  });
});
