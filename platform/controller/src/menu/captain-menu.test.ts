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
const backOf = () => els.find((e) => e.id === 'cmenu-back')!;
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

describe('who sees the form', () => {
  it('a Captain in the lobby with a snapshot gets the form; before the snapshot it is the D-pad as before', () => {
    store['pichiclub.captainIntro.v1'] = '1';
    const m = menu();
    m.refresh();
    expect(body.dataset.menu).toBe('off');
    m.onMessage(msg());
    expect(body.dataset.menu).toBe('on');
    expect(rootOf().innerHTML).toContain('data-cm="go"');
  });
  it('a phone that is not the Captain ignores the snapshot and the screen refusals', () => {
    captain = false;
    const m = menu();
    m.onMessage(msg());
    m.onMessage({ t: 'menuErr', code: 'stale', msg: 'x' } as ServerMsg);
    expect(m.state().snap).toBeNull();
    expect(m.state().notice).toBe('');
    expect(body.dataset.menu).toBeUndefined();
  });
  it('losing the crown or leaving the lobby closes the form and forgets the snapshot', () => {
    const m = menu();
    m.onMessage(msg());
    captain = false;
    m.refresh();
    expect(body.dataset.menu).toBe('off');
    expect(m.state().snap).toBeNull();
    captain = true;
    m.onMessage(msg());
    phase = 'playing';
    m.refresh();
    expect(body.dataset.menu).toBe('off');
    expect(m.state().snap).toBeNull();
  });
  it('"Mando" puts the D-pad up and "‹ Menú" brings the form back', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'pad' });
    expect(body.dataset.menu).toBe('pad');
    backOf().handlers.pointerup!({});
    expect(body.dataset.menu).toBe('on');
    expect(m.state().pad).toBe(false);
  });
});

describe('taps become menuAct messages', () => {
  it('a choice sends the absolute value with the revision of the snapshot the finger saw', () => {
    const m = menu();
    m.onMessage(msg({ rev: 7 }));
    tap({ cm: 'set', row: 'difficulty', val: 'hard' });
    expect(sent).toEqual([{ t: 'menuAct', rev: 7, act: 'set', row: 'difficulty', value: 'hard' }]);
    expect(vibrate).toHaveBeenCalledWith(8);
  });
  it('a toggle sends a boolean, not the "1"/"0" string', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'set', row: 'events', val: '0', bool: '1' });
    tap({ cm: 'set', row: 'events', val: '1', bool: '1' });
    expect(sent.map((s) => (s as { value: unknown }).value)).toEqual([false, true]);
  });
  it('a press (a button row) sends press with its value', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'press', row: 'teams', val: 'shuffle' });
    expect(sent).toEqual([{ t: 'menuAct', rev: 3, act: 'press', row: 'teams', value: 'shuffle' }]);
  });
  it('a disabled option sends nothing: its reason becomes the notice, with no round trip', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'set', row: 'mode', val: 'versus', en: '0', why: 'necesita 4 jugadores' });
    expect(sent).toEqual([]);
    expect(m.state().notice).toBe('necesita 4 jugadores');
  });
  it('taps outside any [data-cm] element, or before a snapshot, do nothing', () => {
    const m = menu();
    m.refresh(); // mounts the root with no snapshot
    tap({ cm: 'set', row: 'events', val: '1' });
    expect(sent).toEqual([]);
    m.onMessage(msg());
    rootOf().handlers.pointerup!({ target: { closest: () => null } });
    expect(sent).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it('an unknown action is ignored (no buzz, no message)', () => {
    menu().onMessage(msg());
    tap({ cm: 'nope' });
    expect(sent).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it('help asks the big screen for the how-to card', () => {
    menu().onMessage(msg());
    tap({ cm: 'help' });
    expect(sent).toEqual([{ t: 'nav', key: 'help' }]);
  });
  it('a missing vibration API (iOS) does not break the tap', () => {
    vi.stubGlobal('navigator', {});
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'fit' });
    expect(m.state().fit).toBe(true);
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => tap({ cm: 'fit' })).not.toThrow();
    expect(m.state().fit).toBe(false);
  });
});

describe('the map picker', () => {
  it('"Cambiar mapa" opens the maps view and rings the grid row on the TV with the tab in view', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'maps' });
    expect(m.state().view).toBe('maps');
    expect(sent).toEqual([{ t: 'menuAct', rev: 3, act: 'focus', row: 'map', value: 'classic' }]);
  });
  it('a tab sends focus with the group, remembers it and "back" returns to the list', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'maps' });
    sent.length = 0;
    tap({ cm: 'tab', val: 'series' });
    expect(sent).toEqual([{ t: 'menuAct', rev: 3, act: 'focus', row: 'map', value: 'series' }]);
    expect(m.state().tab).toBe('series');
    tap({ cm: 'back' });
    expect(m.state().view).toBe('main');
  });
  it('"Aptos para N" toggles the fit filter', () => {
    const m = menu();
    m.onMessage(msg());
    tap({ cm: 'fit' });
    expect(m.state().fit).toBe(true);
  });
});
