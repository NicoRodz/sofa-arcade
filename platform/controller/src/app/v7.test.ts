// Protocol v7 on the phone's platform half: button A keeps its own label and icon while a hint carries a status (`st`), and a buzz kind this build does not know
// (a newer screen's) neither throws nor goes silent: the phone flashes (the same fall-back as a phone without vibration). Fake DOM, real notes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUZZ_PATTERNS, iconSvg, type BuzzKind } from '@pichi/core';
import type { GameControls } from '@pichi/core/contract';
import { createControls } from './controls';
import { createPhaseUi } from './phase';
import type { Session } from './store';

type El = { innerHTML: string; classList: { toggle: (c: string, on: boolean) => void } };
const els = new Map<string, El>();
const el = (id: string): El => {
  if (!els.has(id)) els.set(id, { innerHTML: '', classList: { toggle: () => {} } });
  return els.get(id)!;
};
const classes = new Set<string>();
const session = (over: Partial<Session> = {}) =>
  ({
    root: {
      dataset: {},
      classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
      querySelectorAll: () => [],
    },
    $: el,
    phase: 'playing',
    hint: { a: null, b: null },
    controls: null,
    ...over,
  }) as unknown as Session;

beforeEach(() => {
  els.clear();
  classes.clear();
  vi.stubGlobal('window', { addEventListener: () => {} });
  vi.stubGlobal('document', { getElementById: () => null });
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.unstubAllGlobals());

const pad: GameControls = {
  stick: { icon: 'stick', label: 'Mover' },
  btn1: { icon: 'bell', label: 'Pegarse', hold: true },
  btn2: { icon: 'chop', label: 'Sabotaje' },
} as GameControls;

describe('protocol v7: button A under a status', () => {
  it('with `st` the A button keeps its label and icon (the hint text is only for phones that do not know st); B still takes the hint', () => {
    const s = session({ hint: { a: '¡Manchado! Que un compañero se pegue', b: 'Pegote', aIcon: 'oven', bIcon: 'chop', st: 'stained' } as never });
    createControls(s).apply(pad);
    expect(el('lblA').innerHTML).toContain('Pegarse');
    expect(el('lblA').innerHTML).not.toContain('Manchado');
    expect(el('btnA').innerHTML).toBe(iconSvg('bell'));
    expect(el('lblB').innerHTML).toContain('Pegote');
  });
  it('without `st` the hint rules A as it did in v6; and when `st` arrives or leaves, A is redrawn (a changed st is a changed hint)', () => {
    const s = session({ hint: { a: 'Cargar', b: null, aIcon: 'oven' } as never });
    const c = createControls(s);
    c.apply(pad);
    expect(el('lblA').innerHTML).toContain('Cargar');
    expect(el('btnA').innerHTML).toBe(iconSvg('oven'));
    c.setHint({ a: 'Cargar', b: null, aIcon: 'oven', st: 'dizzy' });
    expect(el('lblA').innerHTML).toContain('Pegarse');
    c.setHint({ a: 'Cargar', b: null, aIcon: 'oven' });
    expect(el('lblA').innerHTML).toContain('Cargar');
  });
});

describe('protocol v7: an older phone that gets a kind it does not know', () => {
  const mk = (s: Session) => createPhaseUi(s, { ctl: { setHint: vi.fn(), apply: vi.fn() }, howto: { onPhase: vi.fn(), render: vi.fn() }, cap: { watch: { show: vi.fn() } } as never, schools: [] });
  it('an unknown kind does not throw and flashes the phone (no vibration pattern to play)', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const ui = mk(session());
    expect(() => ui.buzz('from-the-future' as BuzzKind)).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
    expect(classes.has('flash')).toBe(true);
  });
  it('a known v7 kind vibrates with its pattern', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    mk(session()).buzz('stain');
    expect(vibrate).toHaveBeenCalledWith([...BUZZ_PATTERNS.stain]);
  });
});
