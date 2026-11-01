import { classMap } from 'lit-html/directives/class-map.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { describe, expect, it } from 'vitest';
import type { LevelCard, ModePill } from './rows-model';
import { levelTemplate, modePillTemplate } from './rows-view';

const directive = (d: unknown) => (d as { _$litDirective$: unknown })._$litDirective$;
const is = (value: unknown, fn: (...a: never[]) => unknown) => directive(value) === directive((fn as (...a: unknown[]) => unknown)());
const classes = (v: unknown) => (v as { values: [Record<string, boolean>] }).values[0];
const card = (over: Partial<LevelCard> = {}): LevelCard => ({
  level: 3,
  random: false,
  name: 'Puente <x>',
  ok: true,
  selected: true,
  range: '2-4',
  stars: '★★',
  biome: '#0a0',
  why: '',
  ...over,
});

describe('Obstaculos lobby rows templates (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('mode pill: `sel` is a classMap (the hand-added focus ring survives), data-tether and the title are bindings', () => {
    const p: ModePill = { id: 'chain', label: 'Cadena', title: 'blurb', selected: true };
    const t = modePillTemplate(p);
    expect(t.strings.join('|')).toContain('data-tether=');
    expect(is(t.values[0], classMap)).toBe(true);
    expect(classes(t.values[0])).toEqual({ sel: true });
    expect(t.values.slice(1)).toEqual(['chain', 'blurb', 'Cadena']);
  });
  it('level card: states are one classMap on the same button; name and level are bindings, never markup', () => {
    const t = levelTemplate(card());
    const s = t.strings.join('|');
    expect(s).toContain('<button class="mc ');
    expect(s).toContain('data-level=');
    expect(s).not.toContain('Puente');
    expect(is(t.values[0], classMap)).toBe(true);
    expect(classes(t.values[0])).toEqual({ rec: true, blk: false, sel: true });
    expect(t.values[1]).toBe(3);
    expect(t.values.slice(2, 4)).toEqual([3, 'Puente <x>']);
  });
  it('a playable card shows range, stars and the biome dot (styleMap); a blocked one shows only the reason', () => {
    const ok = levelTemplate(card()).values.at(-1) as { strings: string[]; values: unknown[] };
    expect(ok.strings.join('|')).toContain('class="bio"');
    expect(is(ok.values[0], styleMap)).toBe(true);
    expect(ok.values.slice(1)).toEqual(['2-4', '★★']);
    const blocked = levelTemplate(card({ ok: false, selected: false, why: 'hasta 4 jugadores' }));
    expect(classes(blocked.values[0])).toEqual({ rec: false, blk: true, sel: false });
    const why = blocked.values.at(-1) as { strings: string[]; values: unknown[] };
    expect(why.strings.join('')).toContain('class="why"');
    expect(why.values).toEqual(['hasta 4 jugadores']);
  });
  it('the random card is its own markup: class rnd, only `sel` varies, no range or reason', () => {
    const t = levelTemplate(card({ level: 0, random: true, name: 'Aleatorio', selected: false }));
    const s = t.strings.join('|');
    expect(s).toContain('class="mc rnd ');
    expect(s).toContain('con semilla');
    expect(s).not.toContain('class="why"');
    expect(classes(t.values[0])).toEqual({ sel: false });
    expect(t.values[1]).toBe(0);
  });
});
