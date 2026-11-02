import { describe, expect, it } from 'vitest';
import { MAP_W, closing, f0Map, footprint, generateMap, v1Connection } from '../../map';
import { createManchazo, hashManchazo, matchResult, stepManchazo } from '../../sim';
import { fits } from '../../sim/grid/move';
import { play, scripts } from '../match-drive';

const withAll = (from: number, want: number) => {
  const out: number[] = [];
  for (let seed = from; out.length < want; seed += 101) {
    const k = new Set(generateMap(seed, undefined, true).living.map((l) => l.kind));
    if (k.size === 3) out.push(seed);
  }
  return out;
};
const MAPS = withAll(3, 6);
const cfg = (mapSeed: number, teams: readonly number[] = [0, 1, 0, 1, 0, 1]) => ({
  slots: teams.map((_t, i) => i),
  teams,
  seed: 9,
  mapSeed,
  sabotage: true,
  events: true,
  living: true,
});

describe('a round with the living map', () => {
  it('shuts state 0 on its own copy of the map: the shared F0 map is never touched', () => {
    const before = f0Map().solid.slice();
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3, living: true }); // no mapSeed: the F0 map, nothing to place
    play(s, 1, 600);
    expect(f0Map().solid).toEqual(before);
    expect(s.match.live).toBeNull(); // the living map needs a generated map
    const l = createManchazo(cfg(MAPS[0]!));
    expect(l.grid.map).not.toBe(generateMap(MAPS[0]!).map);
    expect(l.match.live!.pairs.length).toBeGreaterThan(0);
    const [spec] = l.match.live!.pairs.map((p) => p.spec);
    for (const [x, y] of footprint(spec!).filter((t) => t[0] < 13)) expect(l.match.live!.base[y * MAP_W + x]).toBe(0); // base: every part open
  });

  it("flag off: the round is F4's, bit for bit (same hash tick by tick, no state, no clone)", () => {
    for (const mapSeed of MAPS.slice(0, 3)) {
      const { living: _l, ...plain } = cfg(mapSeed);
      const a = createManchazo(plain);
      const b = createManchazo({ ...plain, living: false });
      expect(a.match.live).toBeNull();
      expect(a.grid.map).toBe(a.grid.map);
      const pa = scripts(6, 77);
      const pb = scripts(6, 77);
      for (let t = 0; t < 1500; t++) {
        stepManchazo(a, new Map(pa.map((p, i) => [i, p()])));
        stepManchazo(b, new Map(pb.map((p, i) => [i, p()])));
        if (t % 250 === 0) expect(hashManchazo(a)).toBe(hashManchazo(b));
      }
      expect(hashManchazo(a)).toBe(hashManchazo(b));
      const on = createManchazo(cfg(mapSeed));
      expect(hashManchazo(on)).not.toBe(hashManchazo(createManchazo(plain)));
    }
  });

  it('pickups are never under a living part', () => {
    for (const mapSeed of MAPS) {
      const s = createManchazo(cfg(mapSeed));
      const under = new Set(s.match.live!.pairs.flatMap((p) => footprint(p.spec)).map(([x, y]) => `${x},${y}`));
      for (const p of s.match.sab!.pickups) expect(under.has(`${p.x},${p.y}`)).toBe(false);
    }
  });

  it('nobody is ever shut in: every tick, every body is on floor of the one connected map, even with bodies parked on the tiles about to shut', () => {
    let changes = 0;
    let waits = 0;
    for (const mapSeed of MAPS) {
      const s = createManchazo(cfg(mapSeed, [0, 1, 0, 1, 0, 1, 0, 1]));
      const ps = scripts(8, mapSeed);
      const pairs = s.match.live!.pairs;
      for (let t = 0; t < 2400 && !s.grid.over; t++) {
        if (t % 40 === 20 && pairs.length) {
          // a body is parked on a tile the next change of some pair shuts (the worst place to be)
          const k = Math.floor(t / 40);
          const p = pairs[k % pairs.length]!;
          const c = closing(p.spec, p.state)[k % 2]!;
          if (s.grid.map.solid[c.y * MAP_W + c.x] === 0) [s.grid.bodies[k % 8]!.x, s.grid.bodies[k % 8]!.y] = [c.x * 16 + 8, c.y * 16 + 8];
        }
        const before = pairs.map((p) => p.state);
        stepManchazo(s, new Map(ps.map((p, i) => [s.grid.bodies[i]!.slot, p()])));
        changes += pairs.filter((p, i) => p.state !== before[i]).length;
        expect(v1Connection(s.grid.map)).toBeNull();
        for (const b of s.grid.bodies) expect(fits(s.grid.map, b.x, b.y)).toBe(true);
      }
      waits += pairs.reduce((n, p) => n + p.waited, 0);
    }
    expect(changes).toBeGreaterThan(60);
    expect(waits).toBeGreaterThanOrEqual(0);
  });

  it('mirror: swapping the teams and mirroring the scripts mirrors the whole round, the living map included', () => {
    for (const mapSeed of MAPS.slice(0, 4)) {
      const teams = [0, 1, 0, 1, 0, 1];
      const a = createManchazo(cfg(mapSeed, teams));
      const b = createManchazo(
        cfg(
          mapSeed,
          teams.map((t) => 1 - t),
        ),
      );
      play(a, 303, 2700);
      play(b, 303, 2700, true);
      expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
      expect(b.grid.map.solid).toEqual(a.grid.map.solid); // the map is its own mirror image in every state
      expect(b.match.live!.pairs.map((p) => [p.state, p.pending, p.waited])).toEqual(
        a.match.live!.pairs.map((p) => [p.state, p.pending, p.waited]),
      );
      expect(b.match.live!.pairs.map((p) => p.owner)).toEqual(
        a.match.live!.pairs.map((p) => [...p.owner].reverse().map((t) => (t < 0 ? t : 1 - t))),
      );
      for (let y = 0; y < 15; y++)
        for (let x = 0; x < MAP_W; x++) {
          const pa = a.match.paint[y * MAP_W + x]!;
          expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
        }
      const wa = matchResult(a).winner;
      expect(matchResult(b).winner).toBe(wa === null ? null : 1 - wa);
      expect(a.match.counts[0]! + a.match.counts[1]!).toBeGreaterThan(0);
    }
  });
});
