import { describe, expect, it } from 'vitest';
import { MAP_W, generateMap, f0Map } from '../../map';
import { SABOTAGES, cardOf, drawDeck, placePickups } from '../../sim';
import { round, sab } from './sab-drive';

describe('the deck (substream, seeded)', () => {
  it('holds each v1 sabotage once and is the same for the same seed', () => {
    for (const seed of [1, 2, 99, 123456]) {
      const d = drawDeck(seed);
      expect([...d].sort()).toEqual(SABOTAGES.map((x) => x.kind).sort());
      expect(drawDeck(seed)).toEqual(d);
    }
  });
  it('differs between seeds (it is shuffled, not fixed)', () => {
    const decks = new Set(Array.from({ length: 30 }, (_, i) => drawDeck(i * 977 + 1).join()));
    expect(decks.size).toBeGreaterThan(5);
  });
  it('a round carries its deck and drawing it does not move the other streams: same seed, same deck and pickups', () => {
    const a = round([0, 1], 7);
    const b = round([0, 1], 7);
    expect(sab(a).deck).toEqual(sab(b).deck);
    expect(sab(a).pickups).toEqual(sab(b).pickups);
  });
});

describe('pickups on the map', () => {
  const maps = [f0Map(), ...[11, 4242, 99999, 3000000].map((s) => generateMap(s).map)];
  it('come in mirror pairs on floor, off the exits, one per band, the same each time', () => {
    for (const map of maps)
      for (const seed of [3, 8, 21]) {
        const ps = placePickups(map, seed);
        expect(ps).toEqual(placePickups(map, seed));
        expect(ps.length).toBe(6);
        for (const p of ps) {
          expect(map.solid[p.y * MAP_W + p.x]).toBe(0);
          for (const team of map.spawns) for (const [sx, sy] of team) expect(Math.abs(sx - p.x) + Math.abs(sy - p.y)).toBeGreaterThan(3);
        }
        for (let k = 0; k < 6; k += 2) {
          expect([ps[k + 1]!.x, ps[k + 1]!.y]).toEqual([MAP_W - 1 - ps[k]!.x, ps[k]!.y]);
          expect(ps[k]!.pair).toBe(ps[k + 1]!.pair);
        }
        expect(new Set(ps.map((p) => Math.floor(p.y / 5))).size).toBe(3);
      }
  });
  it('both sides of a pair offer the same card', () => {
    const s = round([0, 1], 12);
    const a = sab(s);
    for (let k = 0; k < a.pickups.length; k += 2) expect(cardOf(a, a.pickups[k]!)).toBe(cardOf(a, a.pickups[k + 1]!));
  });
});
