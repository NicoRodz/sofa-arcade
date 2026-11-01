import { nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { describe, expect, it } from 'vitest';
import type { CardView } from './model';
import { cardTemplate, menuTemplate } from './view';

const card: CardView = {
  id: 'pizzas',
  name: '<b>Pizzas</b> & co',
  blurb: 'Hornea',
  range: '2 a 8 jugadores',
  state: 'ready',
  notice: 'aviso',
  selected: true,
  pickable: true,
};
// bound values, in template order: class, data-game, data-card, name, blurb, players pill, notice
const values = (c: CardView = card) => cardTemplate(c).values as unknown[];

describe('menu card template (no DOM: static parts and bound values of the TemplateResult)', () => {
  it('keeps the classes and the structure the stylesheet and the handlers rely on', () => {
    const s = cardTemplate(card).strings.join('|');
    for (const k of [
      'class="gc ',
      'data-game=',
      'data-card=',
      '<canvas class="art">',
      'class="body"',
      'class="nm"',
      'class="bl"',
      'class="tag"',
    ])
      expect(s).toContain(k);
  });
  it('binds the text (lit escapes it) instead of concatenating it', () => {
    const v = values();
    expect(v[3]).toBe('<b>Pizzas</b> & co');
    expect(v[4]).toBe('Hornea');
    expect(v[6]).toBe('aviso');
    expect(cardTemplate(card).strings.join('')).not.toContain('Pizzas');
  });
  it('the players pill exists only when the card has a range', () => {
    expect((values()[5] as { values: unknown[] }).values).toEqual(['2 a 8 jugadores']);
    expect(values({ ...card, range: '' })[5]).toBe(nothing);
  });
  it('a "soon" card has no data-game (the click handler skips it); the others carry their id', () => {
    expect(values()[1]).toBe('pizzas');
    expect(values()[2]).toBe('pizzas');
    expect(values({ ...card, pickable: false })[1]).toBe(nothing);
    expect(values({ ...card, pickable: false })[2]).toBe('pizzas');
  });
  it('the class is a classMap of the state and `sel`, never a joined string (so the hand-added `nope` survives re-renders)', () => {
    const cm = values()[0] as { values: [Record<string, boolean>] };
    expect(cm.values[0]).toEqual({ ready: true, sel: true });
    expect((values({ ...card, state: 'few', selected: false })[0] as typeof cm).values[0]).toEqual({ few: true, sel: false });
  });
  it('the grid is a repeat keyed by game id, so a card keeps its node (and the art on its canvas) across renders', () => {
    const second = { ...card, id: 'obst' };
    const d = menuTemplate({ sel: 0, cards: [card, second] }).values[0] as {
      _$litDirective$: unknown;
      values: [CardView[], (c: CardView) => string];
    };
    expect(d._$litDirective$).toBe(
      (
        repeat(
          [],
          () => 0,
          () => 0,
        ) as unknown as typeof d
      )._$litDirective$,
    );
    expect(d.values[0].map(d.values[1])).toEqual(['pizzas', 'obst']);
  });
});
