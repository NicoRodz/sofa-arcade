import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import { createManchazo, hashManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';

const swap = (t: number) => (t < 0 ? t : 1 - t);
function playAll(s: ManchazoState, seed: number, flip: boolean, ticks = 1e9) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++)
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 90 }])));
}
const mk = (teams: readonly number[], seed: number) =>
  createManchazo({
    slots: teams.map((_t, i) => i),
    teams,
    seed,
    mapSeed: seed * 7919,
    sabotage: true,
    sabotagePlus: true,
    events: true,
    eventsPlus: true,
    living: true,
    phases: true,
  });

/** The acts of `b` are `a`'s with the teams swapped: same act, same announcements, same pickups and living clocks, same pinata radii, mirrored paint. */
function expectMirrored(a: ManchazoState, b: ManchazoState) {
  expect(b.match.ph).toEqual(a.match.ph);
  expect(b.match.ev!.log).toEqual(a.match.ev!.log.map((x) => ({ ...x, team: swap(x.team) })));
  expect(b.grid.durationTicks).toBe(a.grid.durationTicks);
  expect(b.match.sab!.pickups.map((p) => p.wait)).toEqual(a.match.sab!.pickups.map((p) => p.wait));
  expect(b.match.live!.pairs.map((p) => [p.period, p.offset, p.state])).toEqual(
    a.match.live!.pairs.map((p) => [p.period, p.offset, p.state]),
  );
  expect(b.match.live!.fountain && [b.match.live!.fountain.period, b.match.live!.fountain.offset]).toEqual(
    a.match.live!.fountain && [a.match.live!.fountain.period, a.match.live!.fountain.offset],
  );
  expect(b.match.pinatas.map((p) => [p.x, p.y, p.fuse, p.radius]).sort()).toEqual(
    a.match.pinatas.map((p) => [MAP_W - 1 - p.x, p.y, p.fuse, p.radius]).sort(),
  );
  expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < MAP_W; x++) {
      const pa = a.match.paint[y * MAP_W + x]!;
      expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
    }
}

describe('mirror with the acts: swapping the teams swaps everything, the acts stay put', () => {
  const CASES: [string, number[]][] = [
    ['2 even (75 s)', [0, 1]],
    ['5 players, 3 against 2 (90 s)', [0, 1, 0, 1, 0]],
    ['8 players (105 s)', [0, 1, 0, 1, 0, 1, 0, 1]],
  ];
  for (const [name, teams] of CASES)
    it(`${name}: the whole round mirrors every 150 ticks and at the end`, () => {
      for (const seed of [4, 9]) {
        const a = mk(teams, seed);
        const b = mk(
          teams.map((t) => 1 - t),
          seed,
        );
        while (!a.grid.over) {
          playAll(a, 101, false, 150);
          playAll(b, 101, true, 150);
          expectMirrored(a, b);
        }
        expect(a.match.ph!.phase).toBe('final');
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
    });
  it('replay: the same seed and inputs give the same hash at tick 2000 and at the end, in two runs', () => {
    const run = (stop: number) => {
      const s = mk([0, 1, 0, 1], 6);
      playAll(s, 55, false, stop);
      return hashManchazo(s);
    };
    expect(run(2000)).toBe(run(2000));
    expect(run(1e9)).toBe(run(1e9));
    expect(run(2000)).not.toBe(run(1e9));
  });
});
