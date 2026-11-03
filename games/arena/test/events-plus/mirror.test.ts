import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import {
  ALL_EVENT_KINDS,
  EVENT_PLUS_KINDS,
  hashManchazo,
  stepManchazo,
  type EventKind,
  type ManchazoInput,
  type ManchazoState,
} from '../../sim';
import { scripts } from '../match-drive';
import { moveSeed, onlyPlus, plusRound } from './plus-drive';

function playAll(s: ManchazoState, seed: number, flip: boolean, ticks = 1e9) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++)
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 90 }])));
}
const swap = (t: number) => (t < 0 ? t : 1 - t);

/** Everything about the F8b events of `b` is `a`'s with the teams swapped and the map mirrored. */
function expectMirrored(a: ManchazoState, b: ManchazoState) {
  const [ea, eb] = [a.match.ev!, b.match.ev!];
  expect(eb.program).toEqual(ea.program);
  expect(eb.log).toEqual(ea.log.map((x) => ({ ...x, team: swap(x.team) })));
  expect(eb.active).toEqual(ea.active);
  expect(eb.plus!.moves).toEqual(ea.plus!.moves);
  expect(eb.plus!.balloons).toEqual(ea.plus!.balloons);
  expect(eb.plus!.contagion).toEqual(ea.plus!.contagion);
  expect(eb.plus!.move).toEqual(ea.plus!.move);
  expect(eb.plus!.fx).toBe(ea.plus!.fx);
  const [ba, bb] = [ea.plus!.balloon, eb.plus!.balloon];
  expect(bb?.landAt).toBe(ba?.landAt);
  // the right-hand balloon of a pair is the mirror image of the left one: the teams swap AND the members swap sides
  ba?.owner.forEach((o, k) => expect(bb!.owner[k ^ 1]).toBe(swap(o)));
  expect(b.grid.durationTicks).toBe(a.grid.durationTicks);
  expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < MAP_W; x++) {
      expect(b.grid.map.solid[y * MAP_W + (MAP_W - 1 - x)]).toBe(a.grid.map.solid[y * MAP_W + x]);
      const pa = a.match.paint[y * MAP_W + x]!;
      expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
    }
}

describe('mirror with the F8b events: swapping the teams swaps everything', () => {
  for (const kind of EVENT_PLUS_KINDS as readonly EventKind[])
    for (const teams of [
      [0, 1, 0, 1],
      [0, 0, 0, 1],
      [0, 1, 0, 1, 0, 1, 0, 1],
    ])
      it(`${kind}, ${teams.length} players (${teams.join('')}): a whole round mirrors`, () => {
        const mapSeed = moveSeed(3000);
        const mk = (ts: number[]) => onlyPlus(plusRound(6, ts, mapSeed, true), kind, 700);
        const a = mk(teams);
        const b = mk(teams.map((t) => 1 - t));
        playAll(a, 21, false);
        playAll(b, 21, true);
        expect(a.match.ev!.log.some((x) => x.kind === kind)).toBe(true);
        expectMirrored(a, b);
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      });
  it('a drawn program (all nine kinds in play) mirrors mid-round too, every 100 ticks', () => {
    const slots = [0, 1, 2, 3];
    for (const seed of [8, 9, 10]) {
      const mapSeed = moveSeed(4000 + seed * 13);
      const a = plusRound(seed, [0, 1, 0, 1], mapSeed, true);
      const b = plusRound(seed, [1, 0, 1, 0], mapSeed, true);
      expect(slots).toHaveLength(4);
      for (let k = 0; k < 45; k++) {
        playAll(a, 77, false, 100);
        playAll(b, 77, true, 100);
        expectMirrored(a, b);
      }
    }
  });
  it('the draws belong to the seed, not to the teams or the play: same seed, same moves, balloons and kinds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const a = plusRound(seed, [0, 1], seed * 31);
      const b = plusRound(seed, [1, 0, 1, 1], seed * 31);
      expect(b.match.ev!.plus!.balloons).toEqual(a.match.ev!.plus!.balloons);
      expect(b.match.ev!.plus!.moves).toEqual(a.match.ev!.plus!.moves);
      a.match.ev!.program.forEach((p) => seen.add(p.kind));
    }
    expect(ALL_EVENT_KINDS.every((k) => seen.has(k))).toBe(true);
  });
});
