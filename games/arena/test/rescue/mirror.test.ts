import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import { createManchazo, hashManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';

const swap = (t: number) => (t < 0 ? t : 1 - t);
const twin = (k: number) => (k < 0 ? k : k ^ 1); // pickups come as [left, right] of each mirror pair: the mirror of 2n is 2n+1
const mk = (teams: readonly number[], seed: number, extra = {}) =>
  createManchazo({
    slots: teams.map((_t, i) => i),
    teams,
    seed,
    sabotage: true,
    sabotagePlus: true,
    events: true,
    eventsPlus: true,
    phases: true,
    rescue: true,
    ...extra,
  });
const putAt = (s: ManchazoState, i: number, tx: number, ty: number, flip: boolean) => {
  s.grid.bodies[i]!.x = (flip ? MAP_W - 1 - tx : tx) * 16 + 8;
  s.grid.bodies[i]!.y = ty * 16 + 8;
};

/** Every 250 ticks the same incident, mirrored in the flipped run: body 0 holding a card is caught by a rival blast with body 2 (its teammate) next to it, and bodies 1 and 3 walk onto the loot together. */
function incident(s: ManchazoState, flip: boolean) {
  if (s.grid.tick % 250 !== 0 || s.grid.tick === 0) return;
  const t = s.grid.tick / 250;
  const x = 2 + (t % 3); // columns 2-4 of the open row 7; the rescuer stands at x + 1, the blast two tiles to the left: it reaches body 0 and not the rescuer
  putAt(s, 0, x, 7, flip);
  putAt(s, 2, x + 1, 7, flip);
  putAt(s, 1, 20, 2, flip);
  putAt(s, 3, 20, 12, flip);
  s.match.sab!.held[0] = t % 2 ? 'roller' : 'fan';
  s.match.pinatas.push({
    id: s.match.nextId++,
    x: flip ? MAP_W - 1 - (x - 2) : x - 2,
    y: 7,
    team: s.grid.bodies[1]!.team,
    owner: 1,
    fuse: 1,
    radius: 2,
  });
  if (t % 3 === 0) {
    s.match.sab!.held[1] = s.match.sab!.held[3] = null;
    putAt(s, 1, x, 7, flip); // after the loot lands, two bodies step on it the same tick
    putAt(s, 3, x, 7, flip);
  }
}

function playAll(s: ManchazoState, seed: number, flip: boolean, ticks: number) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++) {
    incident(s, flip);
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 120 }])));
  }
}

function expectMirrored(a: ManchazoState, b: ManchazoState) {
  const [ra, rb] = [a.match.res!, b.match.res!];
  expect(rb.contact).toEqual(ra.contact);
  expect(rb.glow).toEqual(ra.glow);
  expect(rb.from).toEqual(ra.from.map(twin));
  expect(rb.loot).toEqual(ra.loot.map((l) => ({ ...l, x: MAP_W - 1 - l.x, from: twin(l.from) })));
  expect(rb.log).toEqual(ra.log.map((e) => ({ ...e, x: MAP_W - 1 - e.x })));
  expect(b.match.bodies.map((m) => [m.stun, m.trail])).toEqual(a.match.bodies.map((m) => [m.stun, m.trail]));
  expect(b.match.sab!.held).toEqual(a.match.sab!.held);
  expect(b.match.sab!.pickups.map((_p, k) => [b.match.sab!.pickups[twin(k)]!.drawn, b.match.sab!.pickups[twin(k)]!.wait])).toEqual(
    a.match.sab!.pickups.map((p) => [p.drawn, p.wait]),
  );
  expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < MAP_W; x++) {
      const pa = a.match.paint[y * MAP_W + x]!;
      expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
    }
  expect(b.match.ev!.log).toEqual(a.match.ev!.log.map((x) => ({ ...x, team: swap(x.team) })));
}

describe('rescue and loot mirror: swapping the teams swaps everything', () => {
  for (const [name, teams] of [
    ['4 players', [0, 1, 0, 1]],
    ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
  ] as [string, number[]][])
    it(`${name}: the rescue state, the loot and the log mirror every 150 ticks`, () => {
      let rescues = 0;
      let drops = 0;
      let takes = 0;
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
        for (const e of a.match.res!.log) e.kind === 'rescue' ? rescues++ : e.kind === 'drop' ? drops++ : e.kind === 'take' && takes++;
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
      expect(rescues).toBeGreaterThan(0); // the test means something: the rules fired
      expect(drops).toBeGreaterThan(0);
      expect(takes).toBeGreaterThan(0);
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
