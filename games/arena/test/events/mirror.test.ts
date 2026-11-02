import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { createManchazo, hashManchazo, stepManchazo, CLOCK_WARN_TICKS, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts, put } from '../match-drive';
import { MAP_W, evRound, lead, paintRect, quiet, run, untilEnd } from './ev-drive';

function playAll(s: ManchazoState, seed: number, flip: boolean, ticks = 1e9) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++)
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 90 }])));
}
const swap = (t: number) => (t < 0 ? t : 1 - t);

/** Everything about the events of `b` must be `a`'s with the teams swapped (and the map mirrored: the events sit on the middle line or are symmetric). */
function expectMirrored(a: ManchazoState, b: ManchazoState) {
  const [ea, eb] = [a.match.ev!, b.match.ev!];
  expect(eb.program).toEqual(ea.program); // the program belongs to the seed, not to the teams
  expect(eb.log).toEqual(ea.log.map((x) => ({ ...x, team: swap(x.team) })));
  expect(eb.active).toEqual(ea.active);
  expect(eb.big).toEqual(ea.big);
  expect(eb.rain).toEqual(ea.rain);
  expect(eb.vac).toEqual(ea.vac);
  expect(eb.comeback).toEqual({ ...ea.comeback, team: swap(ea.comeback.team) });
  expect(eb.clock).toEqual({ ...ea.clock, team: swap(ea.clock.team) });
  expect(b.grid.durationTicks).toBe(a.grid.durationTicks);
  expect(b.grid.tick).toBe(a.grid.tick);
  expect(b.match.zone).toEqual(a.match.zone);
  expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < MAP_W; x++) {
      const pa = a.match.paint[y * MAP_W + x]!;
      expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
    }
}

const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];

describe('mirror with the events: swapping the teams swaps everything', () => {
  for (const [name, teams] of CASES)
    it(`${name}: a whole round, program, announcements, rain, gold weights, vacuum, come-back and Hourglass mirror`, () => {
      const slots = teams.map((_t, i) => i);
      for (const rs of [101, 202, 303]) {
        const a = createManchazo({ slots, teams, seed: 4, sabotage: true, events: true });
        const b = createManchazo({ slots, teams: teams.map((t) => 1 - t), seed: 4, sabotage: true, events: true });
        playAll(a, rs, false);
        playAll(b, rs, true);
        expect(a.match.ev!.log.length).toBeGreaterThanOrEqual(4); // the three events + the hidden scoreboard at least
        expectMirrored(a, b);
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
    });
  it('mid-round too (during the events, not only at the end): the state mirrors every 100 ticks', () => {
    const slots = [0, 1, 2, 3];
    const a = createManchazo({ slots, teams: [0, 1, 0, 1], seed: 8, sabotage: true, events: true });
    const b = createManchazo({ slots, teams: [1, 0, 1, 0], seed: 8, sabotage: true, events: true });
    for (let k = 0; k < 44; k++) {
      playAll(a, 77, false, 100);
      playAll(b, 77, true, 100);
      expectMirrored(a, b);
    }
  });
});

describe('mirror of the disputed Hourglass: it plays the same for either team', () => {
  /** The Hourglass for whichever team trails: its carrier in the circle, a defender who steps in at tick 60 of the charge. */
  function scenario(loser: number) {
    const s = quiet(evRound(5, [0, 1, 0, 1]));
    lead(s, 1 - loser, 80);
    untilEnd(s, 1800);
    run(s, 1);
    paintRect(s, loser, 12, 6, 14, 8);
    const mine = s.grid.bodies.findIndex((b) => b.team === loser);
    const theirs = s.grid.bodies.findIndex((b) => b.team !== loser);
    put(s, mine, 13, 7);
    put(s, theirs, 2, 12);
    run(s, CLOCK_WARN_TICKS + 60);
    const frozenAt = s.match.ev!.clock.charge;
    put(s, theirs, 14, 8); // the leader steps in: frozen
    run(s, 40);
    const stayed = s.match.ev!.clock.charge === frozenAt;
    put(s, theirs, 2, 12);
    run(s, 400);
    const c = s.match.ev!.clock;
    return { frozenAt, stayed, outcome: c.outcome, ends: s.grid.durationTicks, log: s.match.ev!.log.map((x) => [x.kind, x.tick]) };
  }
  it('the same charge, freeze, fill tick and +15 s when team 0 trails and when team 1 does', () => {
    const [a, b] = [scenario(0), scenario(1)];
    expect(a.outcome).toBe('filled');
    expect(a.stayed).toBe(true);
    expect(b).toEqual(a);
  });
});
