// The Carta larga series (ids 20+): every map passes the validator (stations reachable, the card's recipes makeable, spawn count), has a valid card and its own crates.
import { describe, expect, it } from 'vitest';
import { SERIES_MAPS, parseMap } from './maps';
import { validateMap } from './validate';
import { cardFor, cardShapeProblems } from './recipes/cards';
import { stationsOf } from './validate/stations';

describe('the Carta larga maps', () => {
  for (const m of SERIES_MAPS) {
    it(`${m.id} ${m.name}: validates, has a card with a binding for its two topping crates, and a spawn for every chef it asks for`, () => {
      expect(validateMap(m)).toEqual({ ok: true, errors: [] });
      const card = cardFor(m.id)!;
      expect(cardShapeProblems(card)).toEqual([]);
      const g = parseMap(m.rows);
      expect(stationsOf(g, '3')).toHaveLength(1);
      expect(stationsOf(g, '4')).toHaveLength(1);
      expect(card.bind).toBeDefined();
      const spawns = m.rows.join('').split('S').length - 1;
      expect(spawns).toBeGreaterThanOrEqual(m.nMax);
    });
  }
});
