import { classMap } from 'lit-html/directives/class-map.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evPill, headTemplate, modePill, mutPill, placeChips, sabPill, sabinfoTemplate, teambarTemplate } from './teams-view';
import type { PillView } from './teams-model';

const directive = (d: unknown) => (d as { _$litDirective$: unknown })._$litDirective$;
const is = (value: unknown, fn: (...a: never[]) => unknown) => directive(value) === directive((fn as (...a: unknown[]) => unknown)());
const classes = (v: unknown) => (v as { values: [Record<string, boolean>] }).values[0];
const pill = (over: Partial<PillView> = {}): PillView => ({ id: 'soft', label: 'Suave', title: 'why', selected: true, ...over });

describe('Pizzas lobby team templates (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('heading: the multiplier span exists only when k is set; name and count are bindings', () => {
    const withK = headTemplate({ icon: 'I', name: '<Rojo>', k: 2, count: '3 jugadores' });
    const without = headTemplate({ icon: 'I', name: 'Azul', k: 0, count: '4 jugadores' });
    expect(withK.strings.join('|')).not.toContain('Rojo');
    expect(withK.values[0]).toBe('I');
    expect(withK.values[1]).toBe('<Rojo>');
    expect((withK.values[2] as { strings: string[] }).strings.join('')).toContain('class="tk"');
    expect(without.values[2]).not.toHaveProperty('strings');
  });
  it('team bar: shuffle and lock are static ids, the options are a repeat keyed by id, the hint carries `bad` in a classMap', () => {
    const t = teambarTemplate({
      locked: true,
      lockLabel: 'Desbloquear equipos',
      options: [
        { id: 'handicap', label: 'Ventaja', on: true },
        { id: 'hiddenScore', label: 'Oculto', on: false },
      ],
      hint: { text: 'hola', bad: true },
    });
    const s = t.strings.join('|');
    expect(s).toContain('id="shuffle"');
    expect(s).toContain('id="lock"');
    expect(s).toContain('id="teamhint"');
    expect(is(t.values[0], classMap)).toBe(true);
    expect(classes(t.values[0])).toEqual({ sel: true });
    expect(t.values[1]).toBe('Desbloquear equipos');
    const r = t.values[2] as { values: [{ id: string }[], (o: { id: string }) => string] };
    expect(is(r, repeat as never)).toBe(true);
    expect(r.values[0].map(r.values[1] as never)).toEqual(['handicap', 'hiddenScore']);
    expect(is(t.values[3], classMap)).toBe(true);
    expect(classes(t.values[3])).toEqual({ bad: true });
    expect(t.values[4]).toBe('hola');
  });
  it('pills: each row binds its own data attribute and the selected state is a classMap (the focus ring added by hand survives)', () => {
    for (const [fn, attr] of [
      [sabPill, 'data-sab='],
      [evPill, 'data-ev='],
      [mutPill, 'data-mut='],
      [modePill, 'data-mode='],
    ] as const) {
      const t = fn(pill());
      expect(t.strings.join('|')).toContain(attr);
      expect(is(t.values[0], classMap)).toBe(true);
      expect(classes(t.values[0]).sel).toBe(true);
      expect(t.values.slice(1)).toEqual(['soft', 'why', 'Suave']);
    }
    expect(classes(modePill(pill({ selected: false, disabled: true })).values[0])).toEqual({ sel: false, dis: true });
    expect(classes(modePill(pill()).values[0]).dis).toBe(false);
  });
  it('sabotage info: the warning replaces the blurb; the blurb keeps the key hints', () => {
    expect(sabinfoTemplate('Cuidado', 'blurb').strings.join('')).toBe('');
    const t = sabinfoTemplate('', 'blurb');
    expect(t.strings.join('|')).toContain('<kbd>←</kbd><kbd>→</kbd>');
    expect(t.values[0]).toBe('blurb');
  });
});

describe('placeChips: the shells of the players go into the column', () => {
  afterEach(() => vi.unstubAllGlobals());
  // The shell is the platform's card element with its lit markers inside; here an identity-carrying stand-in. placeChips must hand over THOSE objects:
  // a clone or a rebuilt node would lose the markers lit left inside.
  const shell = (name: string) => ({ name, litMarker: Symbol(name) }) as unknown as HTMLElement;
  const column = (initial: unknown[]) => {
    const list = {
      children: initial as unknown as HTMLCollection,
      moves: 0,
      replaceChildren(...n: Node[]) {
        this.moves++;
        this.children = n as unknown as HTMLCollection;
      },
    };
    return list;
  };

  it('moves the very same shell objects, in order, untouched', () => {
    const a = shell('a'),
      b = shell('b');
    const markers = [(a as never as { litMarker: symbol }).litMarker, (b as never as { litMarker: symbol }).litMarker];
    const list = column([]);
    placeChips(list as never, [a, b]);
    expect(Array.from(list.children)[0]).toBe(a);
    expect(Array.from(list.children)[1]).toBe(b);
    expect([a, b].map((s) => (s as never as { litMarker: symbol }).litMarker)).toEqual(markers);
    expect(Object.keys(a)).toEqual(['name', 'litMarker']); // nothing was added to or removed from the shell
  });
  it('does not touch the DOM when the order is unchanged, and moves again when it changes', () => {
    const a = shell('a'),
      b = shell('b');
    const list = column([a, b]);
    placeChips(list as never, [a, b]);
    expect(list.moves).toBe(0);
    placeChips(list as never, [b, a]);
    expect(list.moves).toBe(1);
    expect(Array.from(list.children)).toEqual([b, a]);
    placeChips(list as never, [b]);
    expect(list.moves).toBe(2);
  });
  it('skips missing shells; an empty team gets the "Sin jugadores" note', () => {
    const a = shell('a');
    const list = column([]);
    placeChips(list as never, [undefined, a, undefined]);
    expect(Array.from(list.children)).toEqual([a]);
    const made: { className: string; textContent: string }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const el = { className: '', textContent: '' };
        made.push(el);
        return el;
      },
    });
    placeChips(list as never, [undefined]);
    expect(made).toEqual([{ className: 'empty-note', textContent: 'Sin jugadores' }]);
    expect(Array.from(list.children)).toEqual(made);
  });
});
