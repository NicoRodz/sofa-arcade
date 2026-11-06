// The Captain's touch menu on a fake page: what a tap puts on the wire (absolute values, the revision the finger saw), when the form is up and when the D-pad is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, ServerMsg } from '@pichi/core';
import { createCaptainMenu } from './captain-menu';
import { snapshot } from './fixture';

type Handler = (e: any) => void;
class FakeEl {
  handlers: Record<string, Handler> = {};
  dataset: Record<string, string | undefined> = {};
  scrollTop = 0;
  id = '';
  type = '';
  textContent = '';
  paints = 0;
  html = '';
  get innerHTML() {
    return this.html;
  }
  set innerHTML(v: string) {
    this.html = v;
    this.paints++;
  }
  body: FakeEl | null = null;
  getBody() {
    this.body = this.body ?? new FakeEl();
    return this.body;
  }
  setAttribute() {}
  addEventListener = (ev: string, fn: Handler) => {
    this.handlers[ev] = fn;
  };
  querySelector(sel: string) {
    return sel === '.cm-body' && this.innerHTML.includes('cm-body') ? this.getBody() : null;
  }
  contains = (_e: unknown) => true;
}
const tapEl = (data: Record<string, string>, off = false) => ({
  dataset: data,
  classList: { contains: (c: string) => off && c === 'off' },
});

let els: FakeEl[];
let body: { dataset: Record<string, string | undefined>; append: (...e: FakeEl[]) => void };
let store: Record<string, string>;
let vibrate: ReturnType<typeof vi.fn>;
let clock: number;
let sent: ClientMsg[];
let cues: string[];
let captain: boolean;
let phase: string;

const menu = () =>
  createCaptainMenu({
    send: (m) => sent.push(m),
    isCaptain: () => captain,
    phase: () => phase,
    now: () => clock,
    cue: (c) => cues.push(c),
  });
const rootOf = () => els.find((e) => e.id === 'cmenu')!;
const tap = (data: Record<string, string>, off = false) => rootOf().handlers.pointerup!({ target: { closest: () => tapEl(data, off) } });
const msg = (over: Partial<ReturnType<typeof snapshot>> = {}): ServerMsg => ({ t: 'menu', ...snapshot(over) }) as ServerMsg;

beforeEach(() => {
  vi.useFakeTimers();
  els = [];
  store = {};
  sent = [];
  cues = [];
  clock = 1000;
  captain = true;
  phase = 'lobby';
  vibrate = vi.fn();
  body = { dataset: {}, append: () => {} };
  vi.stubGlobal('document', {
    createElement: () => {
      const e = new FakeEl();
      els.push(e);
      return e;
    },
    body,
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  });
  vi.stubGlobal('navigator', { vibrate });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('starting the round', () => {
  it('the start button opens the confirmation; "Sí" is dead for 500 ms, then sends start once and goes back to the list', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'go' });
    expect(m.state().view).toBe('confirm');
    tap({ cm: 'yes' });
    expect(sent).toEqual([]); // a double tap cannot start by accident
    clock += 500;
    tap({ cm: 'yes' });
    expect(sent).toEqual([{ t: 'menuAct', rev: 3, act: 'start' }]);
    expect(m.state().view).toBe('main');
  });
  it('the confirmation wakes up by itself: a repaint is scheduled for when "Sí" becomes live', () => {
    store['pichiclub.captainIntro.v1'] = '1';
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'go' });
    const painted = rootOf().paints;
    const asleep = rootOf().innerHTML;
    clock += 500;
    vi.advanceTimersByTime(520);
    expect(rootOf().paints).toBe(painted + 1); // nobody touched the phone: it repainted on its own
    expect(m.state().view).toBe('confirm');
    expect(rootOf().innerHTML).not.toBe(asleep); // and "Sí" is no longer the dimmed one
  });
  it('a start the screen cannot do shows its reason and does not open the confirmation', () => {
    const m = menu();
    m.onMessage(msg({ primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } }));
    tap({ cm: 'go' });
    expect(m.state().view).toBe('main');
    expect(m.state().notice).toBe('Esperando jugadores');
    expect(sent).toEqual([]);
  });
  it('a start button that is dimmed in the markup (class off) is refused even if data-en says yes', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'go', why: 'dimmed' }, true);
    expect(m.state().view).toBe('main');
    expect(m.state().notice).toBe('dimmed');
  });
  it('the notice goes away by itself once it expires', () => {
    const m = menu();
    m.onMessage(msg({ primary: { id: 'start', label: '¡A cocinar!', enabled: false, reason: 'Esperando jugadores', summary: [] } }));
    tap({ cm: 'go' });
    expect(rootOf().innerHTML).toContain('Esperando jugadores');
    clock += 3100;
    vi.advanceTimersByTime(3100);
    expect(m.state().notice).toBe('');
    expect(rootOf().innerHTML).not.toMatch(/cm-notice on/);
  });
});

describe('the screen answers', () => {
  it('a refusal of a stale start closes the confirmation and says why', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'go' });
    m.onMessage({ t: 'menuErr', code: 'stale', msg: 'Cambió la configuración' } as ServerMsg);
    expect(m.state().view).toBe('main');
    expect(m.state().notice).toBe('Cambió la configuración');
  });
  it('notCaptain closes the whole form', () => {
    const m = menu();
    m.onMessage(msg());
    m.onMessage({ t: 'menuErr', code: 'notCaptain', msg: 'Ya no eres Capitán' } as ServerMsg);
    expect(m.state().snap).toBeNull();
  });
  it('messages that are not the menu are not ours', () => {
    const m = menu();
    m.onMessage({ t: 'phase', phase: 'lobby' } as ServerMsg);
    expect(m.state().snap).toBeNull();
    expect(els).toEqual([]);
  });
});

describe('the first-use card and the cues', () => {
  it('the first snapshot of a device shows the intro; dismissing it is remembered, so the next device visit skips it', () => {
    const m = menu();
    m.onMessage(msg());
    expect(m.state().intro).toBe(true);
    tap({ cm: 'intro' });
    expect(m.state().intro).toBe(false);
    expect(store['pichiclub.captainIntro.v1']).toBe('1');
    const again = menu();
    again.onMessage(msg());
    expect(again.state().intro).toBe(false);
  });
  it('blocked storage: the intro shows again and dismissing it does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const m = menu();
    m.onMessage(msg());
    expect(m.state().intro).toBe(true);
    expect(() => tap({ cm: 'intro' })).not.toThrow();
    expect(m.state().intro).toBe(false);
  });
  it('a row changed by someone else (the keyboard) rings the soft cue and flashes; the first snapshot does not', () => {
    store['pichiclub.captainIntro.v1'] = '1';
    const m = menu();
    m.onMessage(msg());
    expect(cues).toEqual([]);
    const next = snapshot({ rev: 4 });
    next.rows[0]!.value = 'hard';
    m.onMessage({ t: 'menu', ...next } as ServerMsg);
    expect(cues).toEqual(['soft']);
    expect(Object.keys(m.state().flash)).toEqual(['difficulty']);
  });
  it('a row this phone just touched does not ring back at it', () => {
    store['pichiclub.captainIntro.v1'] = '1';
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'set', row: 'difficulty', val: 'hard' });
    const next = snapshot({ rev: 4 });
    next.rows[0]!.value = 'hard';
    m.onMessage({ t: 'menu', ...next } as ServerMsg);
    expect(cues).toEqual([]);
  });
  it('a repaint keeps the scroll of the list within the same view', () => {
    store['pichiclub.captainIntro.v1'] = '1';
    const m = menu();
    m.onMessage(msg());
    // the fixture markup has a .cm-body: the fake hands out the same element each time
    const bodyEl = rootOf().querySelector('.cm-body') as FakeEl;
    bodyEl.scrollTop = 120;
    m.onMessage(msg({ rev: 4 }));
    expect(bodyEl.scrollTop).toBe(120);
    tap({ cm: 'maps' });
    expect(bodyEl.scrollTop).toBe(0); // a new view starts at the top
  });
});
