import { describe, expect, it } from 'vitest';
import type { ComingSoon, GameDef } from '@pichi/core/contract';
import { GAMES } from '@pichi/catalog';
import { soonEnabled } from './dev-flags';
import { menuCards, menuOnKey, menuPick } from './menu';

const live = [GAMES[0] as GameDef];
const fake: ComingSoon[] = [{ id: 'fake', name: 'Fake', blurb: 'In development.' }];

describe('?soon=1', () => {
  it('reads the parameter: only "1" turns it on', () => {
    expect(soonEnabled('?soon=1')).toBe(true);
    expect(soonEnabled('?room=x&soon=1')).toBe(true);
    for (const q of ['', '?soon=0', '?soon', '?soon=true', '?room=soon']) expect(soonEnabled(q), q).toBe(false);
  });
  it('without it an announced game is a card that cannot be picked or focused', () => {
    const cards = menuCards(4, live, fake, false);
    expect(cards.map((c) => `${c.id}:${c.state}`)).toEqual(['pizzas:ready', 'fake:soon']);
    expect(menuPick(cards, 'fake')).toEqual({ kind: 'none' });
    expect(menuOnKey(cards, 0, 'ArrowRight', 3)).toEqual({ kind: 'none' });
  });
  it('with it the announced game is pickable and the keys reach it', () => {
    const cards = menuCards(4, live, fake, true);
    expect(cards.map((c) => `${c.id}:${c.state}`)).toEqual(['pizzas:ready', 'fake:ready']);
    expect(menuPick(cards, 'fake')).toEqual({ kind: 'pick', id: 'fake' });
    expect(menuOnKey(cards, 0, 'ArrowRight', 3)).toEqual({ kind: 'move', sel: 1 });
  });
  it('it does not touch the games already published', () => {
    expect(menuCards(1, live, [], true)).toEqual(menuCards(1, live, [], false));
  });
});
