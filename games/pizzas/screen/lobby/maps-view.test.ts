import { describe, expect, it } from 'vitest';
import { classMap } from 'lit-html/directives/class-map.js';
import { repeat } from 'lit-html/directives/repeat.js';
import type { CardView, MapItem } from './maps-model';
import { cardTemplate, itemTemplate, mapsTemplate, specialTemplate } from './maps-view';

const directive = (d: unknown) => (d as { _$litDirective$: unknown })._$litDirective$;
const is = (value: unknown, fn: (...a: never[]) => unknown) => directive(value) === directive((fn as (...a: unknown[]) => unknown)());
const card = (over: Partial<CardView> = {}): CardView => ({
  id: '11',
  name: 'Tres <carriles>',
  range: '4-8',
  stars: '★★',
  cheese: true,
  sink: false,
  state: 'rec',
  top: true,
  selected: true,
  why: '',
  ...over,
});

describe('Pizzas lobby map panel templates (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('card: every state is a classMap on the same button (so the hand-added focus ring survives); id and name are bindings, never markup', () => {
    const t = cardTemplate(card());
    const s = t.strings.join('|');
    expect(s).toContain('<button class="mc ');
    expect(s).toContain('data-map=');
    expect(s).not.toContain('carriles'); // lit escapes the name: it is a binding
    expect(is(t.values[0], classMap)).toBe(true);
    expect((t.values[0] as { values: [Record<string, boolean>] }).values[0]).toEqual({
      top: true,
      rec: true,
      warn: false,
      blk: false,
      sel: true,
    });
    expect(t.values.slice(1, 4)).toEqual(['11', '11', 'Tres <carriles>']);
  });
  it('card: the reason and the tags are there only when the card has them', () => {
    const bare = cardTemplate(card({ cheese: false, sink: false, why: '' })).values;
    const full = cardTemplate(
      card({ state: 'blk', top: false, selected: false, cheese: true, sink: true, why: 'hasta 4 jugadores' }),
    ).values;
    const html = (v: unknown) => (v && typeof v === 'object' && 'strings' in v ? (v as { strings: string[] }).strings.join('') : '');
    expect(bare.slice(-3).map(html)).toEqual(['', '', '']);
    expect(full.slice(-3).map(html)).toEqual([
      expect.stringContaining('class="tag"'),
      expect.stringContaining('class="tag l"'),
      expect.stringContaining('class="why"'),
    ]);
    expect((full[0] as { values: [Record<string, boolean>] }).values[0]).toMatchObject({ blk: true, rec: false, sel: false });
  });
  it('special card: `sel` through classMap; data-to only for the cards that open a page', () => {
    const t = specialTemplate({ id: 'group', to: 'taller', label: 'Taller ▸', sub: 'x', selected: false });
    expect(t.strings.join('|')).toContain('class="mc special ');
    expect(is(t.values[0], classMap)).toBe(true);
    expect(t.values.slice(1, 3)).toEqual(['group', 'taller']);
  });
  it('the band is a repeat of cards keyed by map id; the fold is a static "group" button', () => {
    const band: MapItem = { kind: 'band', key: 'band', label: 'Recomendados para 8', cards: [card({ id: '11' }), card({ id: '22' })] };
    const t = itemTemplate(band);
    expect(t.strings.join('|')).toContain('class="band"');
    const r = t.values[1] as { values: [CardView[], (c: CardView) => string] };
    expect(is(r, repeat as never)).toBe(true);
    expect(r.values[0].map(r.values[1] as never)).toEqual(['11', '22']);
    const fold = itemTemplate({ kind: 'fold', key: 'fold', label: 'Otros mapas (3) ▸', sub: 'no sirven con 8' });
    expect(fold.strings.join('|')).toContain('data-map="group" data-to="others"');
    expect(fold.values).toEqual(['Otros mapas (3) ▸', 'no sirven con 8']);
  });
  it('the whole panel is one repeat keyed by item.key: a card keeps its node when the list around it changes', () => {
    const items: MapItem[] = [
      { kind: 'card', key: 'c:11', card: card() },
      { kind: 'fold', key: 'fold', label: 'x', sub: 'y' },
    ];
    const r = mapsTemplate(items).values[0] as { values: [MapItem[], (i: MapItem) => string] };
    expect(is(r, repeat as never)).toBe(true);
    expect(r.values[0].map((i) => i.key)).toEqual(['c:11', 'fold']);
  });
});
