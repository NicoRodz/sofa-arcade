import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import { createManchazo, hashManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';

/** F1's scripted players plus button 2 about every 40 ticks (the same draws for a run and its mirror). */
function play(s: ManchazoState, seed: number, ticks: number, flip: boolean) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++)
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 40 }])));
}
const cfg = (teams: number[], extra = {}) => ({
  slots: teams.map((_t, i) => i),
  teams,
  seed: 4,
  sabotage: true,
  sabotagePlus: true,
  projectiles: true,
  ...extra,
});
const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];
const DIR_FLIP = [2, 1, 0, 3]; // right <-> left; up and down stay

describe('replay: the same seed and inputs give the same hash at the same tick', () => {
  it('two runs of a full round with the flag on', () => {
    const run = () => {
      const s = createManchazo(
        cfg([0, 1, 0, 1, 0, 1], { events: true, phases: true, eventsPlus: true, rescue: true, living: true, mapSeed: 777 }),
      );
      const hashes: number[] = [];
      for (let k = 0; k < 6; k++) {
        play(s, 9, 600, false);
        hashes.push(hashManchazo(s));
      }
      return hashes;
    };
    expect(run()).toEqual(run());
  });
});

describe('mirror: swapping the teams swaps everything, shots and Pegotes included', () => {
  for (const [name, teams] of CASES)
    it(`${name}: paint, counts, hands, aims, shots in the air, Pegote passes and the log mirror`, () => {
      const slots = teams.map((_t, i) => i);
      let launched = 0;
      let inAir = 0;
      for (const rs of [101, 202, 303, 404, 505]) {
        const a = createManchazo(cfg(teams));
        const b = createManchazo({ ...cfg(teams), slots, teams: teams.map((t) => 1 - t) });
        for (let chunk = 0; chunk < 20; chunk++) {
          // the hand of every body is a card that flies: the runs shoot a lot
          for (const s of [a, b])
            s.grid.bodies.forEach((_b, i) => (s.match.sab!.held[i] ??= (['glue', 'swap', 'dizzy'] as const)[(i + chunk) % 3]!));
          play(a, rs * 100 + chunk, 100, false);
          play(b, rs * 100 + chunk, 100, true);
          const air = (s: ManchazoState) => s.match.sab!.shot!.shots.map((p) => [p.id, p.kind, p.owner, p.y, p.left]);
          expect(air(b)).toEqual(air(a)); // in the air at every checkpoint, not only at the end
          inAir += air(a).length;
        }
        const [sa, sb] = [a.match.sab!.shot!, b.match.sab!.shot!];
        launched += sa.log.filter((e) => e.kind === 'launch').length;
        expect(sb.prep).toEqual(sa.prep);
        expect(b.match.sab!.held).toEqual(a.match.sab!.held);
        expect(sb.nextId).toBe(sa.nextId);
        const fx = (x: number) => MAP_W * 16 - x;
        expect(sb.shots.map((p) => [p.id, p.kind, p.owner, 1 - p.team, fx(p.x), p.y, DIR_FLIP[p.dir], p.left])).toEqual(
          sa.shots.map((p) => [p.id, p.kind, p.owner, p.team, p.x, p.y, p.dir, p.left]),
        );
        expect(sb.log.map((e) => [e.kind, e.tick, e.body, e.target, MAP_W - 1 - e.x, e.y, e.card])).toEqual(
          sa.log.map((e) => [e.kind, e.tick, e.body, e.target, e.x, e.y, e.card]),
        );
        const pin = (s: ManchazoState, flip: boolean) =>
          s.match.pinatas.map((p) => [
            p.id,
            flip ? MAP_W - 1 - p.x : p.x,
            p.y,
            flip ? 1 - p.team : p.team,
            p.owner,
            p.fuse,
            p.stuck ?? -1,
            p.passes ?? -1,
            p.lock ?? -1,
          ]);
        expect(pin(b, true)).toEqual(pin(a, false));
        expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
        for (let y = 0; y < 15; y++)
          for (let x = 0; x < MAP_W; x++) {
            const pa = a.match.paint[y * MAP_W + x]!;
            expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
          }
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
      expect(launched).toBeGreaterThan(20); // the runs did shoot, so this checks something
      expect(inAir).toBeGreaterThan(0);
    });
});
