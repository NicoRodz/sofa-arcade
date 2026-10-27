// Maps 27 Isla de hornos and 28 Cocina espejo (Carta larga, tanda 3): what makes them different, that every N they take has a chef in front of every station, and that scripted chefs
// really make the new plates on them (a casa on 27, a Bandeja on 28), with the sink and the dirty-plate return in play.
import { describe, expect, it } from 'vitest';
import { fixedMap, parseMap } from './maps';
import { validateMap } from './validate';
import { spawnZoneProblems } from './validate/spawn-zones';
import { stationsOf } from './validate/stations';
import { cardFor, cardShapeProblems } from './recipes/cards';
import { createRec } from './recipes/sim';
import { cookRound } from '../test/golden/recipe-bot';
import type { Order } from './overcooked';

const flags = { upgradeOrders: true, compoundOrders: true, sliceAfterBake: true, adaptive: true };

describe('27 Isla de hornos', () => {
  const m = fixedMap('27')!;
  it('four ovens on an island in the middle, plates that run out (sink and dirty return), the sauce pot and basil; validates for every N it takes', () => {
    const g = parseMap(m.rows);
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(spawnZoneProblems(m)).toEqual([]);
    const ovens = stationsOf(g, 'O');
    expect(ovens).toHaveLength(4);
    for (const [x, y] of ovens) expect(x >= 6 && x <= 9 && y >= 3 && y <= 5, `oven ${x},${y} on the island`).toBe(true);
    for (const k of ['U', 'L', 'R', '5'] as const) expect(stationsOf(g, k), k).toHaveLength(1);
    expect([m.nMin, m.nMax]).toEqual([4, 8]);
  });
  it('its card is Marinara, Pizza de la casa and the stuffed calzone, cheese on crate 3 and ham on crate 4; with the flags off the casa leaves the card', () => {
    const card = cardFor('27')!;
    expect(card.recipes).toEqual(['marinara', 'casa', 'calzonerel']);
    expect(card.bind).toEqual([2, 5]);
    expect(cardShapeProblems(card)).toEqual([]);
    const g = cookRound({ mapId: '27', n: 4, seconds: 1, flags }).g;
    expect(g.rec!.recipes).toEqual(['marinara', 'casa', 'calzonerel']);
    const off = cookRound({ mapId: '27', n: 4, seconds: 1 }).g;
    expect(off.rec!.recipes).toEqual(['marinara', 'calzonerel']);
    expect(createRec(off.stations, '27')!.recipes).not.toContain('casa');
  });
  it('four scripted chefs deliver the Pizza de la casa on it (sauce, cheese, oven, window)', () => {
    const { g } = cookRound({ mapId: '27', n: 4, force: 'casa', seconds: 240, flags, seed: 2 });
    expect(g.delivered).toBeGreaterThanOrEqual(1);
  });
});

describe('28 Cocina espejo', () => {
  const m = fixedMap('28')!;
  it('two half-kitchens: the tomato and the cheese on the left, the sauce pot on the right, two hatches and a doorway; sink on one side, dirty return on the other; validates for every N', () => {
    const g = parseMap(m.rows);
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(spawnZoneProblems(m)).toEqual([]);
    expect(stationsOf(g, '2')[0]![0]).toBeLessThan(8);
    expect(stationsOf(g, '3')[0]![0]).toBeLessThan(8);
    expect(stationsOf(g, 'R')[0]![0]).toBeGreaterThan(8);
    expect(stationsOf(g, '5')[0]![0]).toBeGreaterThan(8);
    expect(stationsOf(g, 'L')[0]![0]).toBeLessThan(8);
    expect(stationsOf(g, 'U')[0]![0]).toBeGreaterThan(8);
    expect(m.rows.filter((r) => r[7] === 'H')).toHaveLength(2);
    expect(m.rows.filter((r) => r[7] === '.')).toHaveLength(2); // the doorway: two floor tiles in the wall
    expect([m.nMin, m.nMax]).toEqual([5, 8]);
  });
  it('its card has four recipes and the Bandeja draws from the other three; flags off: neither the casa nor the Bandeja', () => {
    const card = cardFor('28')!;
    expect(card.recipes).toEqual(['marinara', 'casa', 'bandeja', 'calzonerel']);
    expect(cardShapeProblems(card)).toEqual([]);
    expect(cookRound({ mapId: '28', n: 5, seconds: 1, flags }).g.rec!.recipes).toEqual(card.recipes);
    expect(cookRound({ mapId: '28', n: 5, seconds: 1 }).g.rec!.recipes).toEqual(['marinara', 'calzonerel']);
  });
  it('four scripted chefs (one per oven: the script shares ovens by rank) fill two slots of a Bandeja on it', () => {
    let served = 0;
    const { g } = cookRound({
      mapId: '28',
      n: 4,
      seconds: 400,
      flags,
      seed: 1,
      before: (g) => {
        const t = g.teams[0]!;
        served = Math.max(served, ...t.orders.map((o: Order) => (o.served ?? []).filter(Boolean).length));
      },
    });
    expect(served, 'two slots of a Bandeja filled').toBeGreaterThanOrEqual(2);
    expect(g.delivered).toBeGreaterThanOrEqual(1);
  });
});
