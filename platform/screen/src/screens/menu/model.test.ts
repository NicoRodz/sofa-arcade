import { describe, expect, it } from 'vitest';
import type { MenuCard } from '../../menu';
import { menuView } from './model';

const card = (id: string, state: MenuCard['state'], extra: Partial<MenuCard> = {}): MenuCard => ({
  id,
  name: `N ${id}`,
  blurb: `B ${id}`,
  range: '2 a 8 jugadores',
  state,
  notice: '',
  ...extra,
});
const cards = [
  card('a', 'ready'),
  card('b', 'few', { notice: 'Hay 1 jugador: necesita al menos 2' }),
  card('s', 'soon', { range: '', notice: 'Próximamente' }),
];

describe('menu view model', () => {
  it('marks only the selected card, and says which cards carry data-game (every one but "soon")', () => {
    const m = menuView(cards, 1);
    expect(m.cards.map((c) => c.selected)).toEqual([false, true, false]);
    expect(m.cards.map((c) => c.pickable)).toEqual([true, true, false]);
  });
  it('a selection past the focusable cards is clamped; a "soon" card is never selected', () => {
    const m = menuView(cards, 9);
    expect(m.sel).toBe(1);
    expect(m.cards.map((c) => c.selected)).toEqual([false, true, false]);
    expect(menuView(cards, -3).sel).toBe(0);
  });
  it('carries text, range, state and notice through untouched', () => {
    expect(menuView(cards, 0).cards[1]).toEqual({
      id: 'b',
      name: 'N b',
      blurb: 'B b',
      range: '2 a 8 jugadores',
      state: 'few',
      notice: 'Hay 1 jugador: necesita al menos 2',
      selected: false,
      pickable: true,
    });
  });
  it('no cards: selection 0 and nothing drawn', () => {
    expect(menuView([], 5)).toEqual({ cards: [], sel: 0 });
  });
});
