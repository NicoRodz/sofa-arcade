import { describe, expect, it } from 'vitest';
import { MAP_W } from '../map';
import { createManchazo, hashManchazo, matchResult, matchSeconds, matchTicks, percentOf, sidesFlipped } from '../sim';
import { DROP, duel, play, put, tick } from './match-drive';

describe('round length by connected players', () => {
  it('2-4 -> 75 s, 5-6 -> 90 s, 7-8 -> 105 s', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(matchSeconds)).toEqual([75, 75, 75, 90, 90, 105, 105]);
    for (const n of [2, 4, 5, 6, 7, 8]) {
      const s = createManchazo({
        slots: Array.from({ length: n }, (_v, i) => i),
        teams: Array.from({ length: n }, (_v, i) => i % 2),
        seed: 3,
      });
      expect(s.grid.durationTicks).toBe(matchTicks(n));
    }
  });
  it('the round ends at the last tick and then stops moving', () => {
    const s = duel(5);
    tick(s, {}, matchTicks(2) - 1);
    expect(s.grid.over).toBe(false);
    tick(s);
    expect(s.grid.over).toBe(true);
    const h = hashManchazo(s);
    tick(s, { 0: DROP }, 10);
    expect(hashManchazo(s)).toBe(h);
  });
});

describe('result and area', () => {
  it('percent is painted tiles over floor tiles, and the winner is who has more', () => {
    const s = duel();
    put(s, 0, 3, 7);
    put(s, 1, 24, 7);
    tick(s, { 0: DROP });
    tick(s, {}, 125);
    const r = matchResult(s);
    expect(r.winner).toBe(0);
    expect(r.order.map((t) => t.team)).toEqual([0, 1]);
    expect(r.order[0]!.percent).toBe(percentOf(s.match, 0));
    expect(percentOf(s.match, 0)).toBeCloseTo((100 * 13) / s.match.paintable, 0);
    expect(r.order[1]!.tiles).toBe(0);
  });
  it('equal tiles: the team that got there first wins; the same tick is a draw; nothing painted is a draw', () => {
    const s = duel();
    expect(matchResult(s).winner).toBe(null);
    put(s, 0, 3, 7);
    put(s, 1, 23, 7);
    tick(s, { 0: DROP });
    tick(s, { 1: DROP });
    tick(s, {}, 125);
    const r = matchResult(s);
    expect(r.order[0]!.tiles).toBe(r.order[1]!.tiles);
    expect(r.winner).toBe(0); // blue got there one tick later
    const same = duel();
    put(same, 0, 3, 7);
    put(same, 1, 23, 7);
    tick(same, { 0: DROP, 1: DROP });
    tick(same, {}, 125);
    expect(matchResult(same).winner).toBe(null);
  });
});

describe('determinism', () => {
  it('same seed and same inputs: same hash at ticks 600 and 3600; another seed of the script differs', () => {
    const run = (seed: number) => {
      const s = createManchazo({ slots: [0, 1, 2, 3, 4, 5], teams: [0, 1, 0, 1, 0, 1], seed: 9 });
      const hashes: number[] = [];
      const ps = play(s, seed, 600);
      hashes.push(hashManchazo(ps));
      play(s, seed, 3000);
      return hashes;
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });
  it('the side each team starts on comes from the seed alone (its own substream), and flipping mirrors the bodies', () => {
    const seeds = Array.from({ length: 40 }, (_v, i) => i * 977 + 1);
    const flips = seeds.map(sidesFlipped);
    expect(flips.some(Boolean) && flips.some((f) => !f)).toBe(true);
    expect(seeds.map(sidesFlipped)).toEqual(flips);
    const a = seeds.find((s) => !sidesFlipped(s))!;
    const b = seeds.find((s) => sidesFlipped(s))!;
    const sa = createManchazo({ slots: [0, 1], teams: [0, 1], seed: a }).grid.bodies;
    const sb = createManchazo({ slots: [0, 1], teams: [0, 1], seed: b }).grid.bodies;
    expect(sb.map((x) => x.x)).toEqual(sa.map((x) => MAP_W * 16 - x.x));
  });
});
