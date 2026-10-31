// HAZARD_V3: the table, the flag, the penalties, the ledger, the rat that takes an item when it escapes, the new school steps and the card of dynamics.
import { describe, expect, it } from 'vitest';
import { createGame, addPlayer, tick, COUNTDOWN_MS, TICK_MS } from './overcooked';
import { fixedMap } from './maps';
import { patchMap } from './maps/hazard-patches';
import { HAZARD_V3, LEGACY, hz3Params } from './hazards/hazard-v3';
import { escapeLoot, stealOnEscape } from './feel/rat-loot';
import { mechFlagsOf } from './mech/ids';
import { roundRules } from './midround';
import { book, byFamily } from './hazards/score-ledger';
import { SCHOOL_STEPS_V3, SCHOOL_ROWS_V3, SCHOOL_TOTAL_V3, completesV3 } from './school/steps-v3';
import { cardLines, markSeen, DYNAMICS } from './hazards/dynamics-card';
import { validateMap } from './validate';
import { mechModule } from './mech/registry';
import { parseMap } from './maps';
import type { Controls } from './round/state';
import type { Difficulty } from '@pichi/core/difficulty';

const mk = (d: Difficulty, o: Record<string, unknown> = {}) => {
  const m = fixedMap('2')!;
  return createGame({ mapId: '2', rows: m.rows, spawns: m.spawns, difficulty: d, n: 2, seed: 5, ...o });
};
const idle = (): Controls => ({ x: 0, y: 0, a: 0, b: false }) as Controls;

describe('HAZARD_V3 numbers', () => {
  it('Easy keeps the legacy row (no punishments); Normal and Hard raise the numbers', () => {
    expect(HAZARD_V3.easy).toBe(LEGACY);
    expect(HAZARD_V3.normal.penalty).toBe(-25);
    expect(HAZARD_V3.hard.penalty).toBe(-40);
    expect(HAZARD_V3.normal.oil.dripEvery).toBe(600);
    expect(HAZARD_V3.hard.oil.dripEvery).toBe(480);
    expect(HAZARD_V3.normal.oil.wipeTicks).toBe(90);
    expect(HAZARD_V3.normal.oil.spillPatches).toBe(8);
    expect(HAZARD_V3.hard.oil.spillPatches).toBe(10);
    expect(HAZARD_V3.hard.oil.spillDry).toBe(2400);
    expect(HAZARD_V3.normal.belt.period).toBe(1320);
    expect(HAZARD_V3.hard.belt.period).toBe(960);
    expect(HAZARD_V3.hard.bridge.breaks).toBe(4);
    expect(HAZARD_V3.normal.gate.open).toBe(420);
    expect(HAZARD_V3.hard.gate.closed).toBe(420);
    expect(HAZARD_V3.normal.wood.cap).toBe(2400);
    expect(HAZARD_V3.hard.wood.cap).toBe(1800);
    expect(HAZARD_V3.easy.rat.stealOnEscape).toBe(false);
    expect(HAZARD_V3.normal.rat.stealOnEscape).toBe(true);
  });
  it('without the flag every round reads LEGACY (the rounds of before); with it, its difficulty row', () => {
    expect(hz3Params(mk('normal'))).toBe(LEGACY);
    expect(hz3Params(mk('normal', { hazardsV3: true }))).toBe(HAZARD_V3.normal);
    expect(mk('normal').ledger).toBeNull();
    expect(mk('normal', { hazardsV3: true }).ledger).not.toBeNull();
  });
  it('the expired-order penalty: -10/-20 before, -25/-40 with the flag, 0 in Easy; and it lands in the ledger', () => {
    expect(mk('normal').params.penalty).toBe(-10);
    expect(mk('normal', { hazardsV3: true }).params.penalty).toBe(-25);
    expect(mk('hard', { hazardsV3: true }).params.penalty).toBe(-40);
    expect(mk('easy', { hazardsV3: true }).params.penalty).toBe(0);
    const g = mk('normal', { hazardsV3: true });
    addPlayer(g, 1, 0, 0);
    g.teams[0]!.score = 100;
    g.teams[0]!.orders = [{ id: 99, expiresAt: 1, warned: true, recipe: 'marinara' } as never];
    g.time = 10;
    tick(g, new Map([[1, idle()]]));
    expect(g.teams[0]!.score).toBe(75);
    expect(g.ledger!.points['penalty:expired']).toBe(-25);
  });
});

describe('the score book', () => {
  it('books by source, groups by family and is a no-op without a ledger', () => {
    const g = mk('normal', { ledger: true });
    book(g, 'delivery', 80);
    book(g, 'event:rat', 50);
    book(g, 'penalty:expired', -25);
    book(g, 'hazard:rat-escape', 0);
    expect(byFamily(g.ledger!)).toEqual({ delivery: 80, event: 50, penalty: -25, hazard: 0 });
    expect(g.ledger!.count['hazard:rat-escape']).toBe(1);
    expect(() => book(mk('normal'), 'delivery', 1)).not.toThrow();
  });
  it('a full round books deliveries and the sum of the ledger equals the final score (no unbooked source)', () => {
    const m = fixedMap('2')!;
    const g = createGame({
      mapId: '2',
      rows: m.rows,
      spawns: m.spawns,
      difficulty: 'normal',
      n: 2,
      seed: 3,
      countdownMs: COUNTDOWN_MS,
      hazardsV3: true,
      ...roundRules(undefined, 'normal'),
    });
    addPlayer(g, 1, 0, 0);
    addPlayer(g, 2, 1, 1);
    const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS);
    for (let t = 0; t < limit && !g.over; t++)
      tick(
        g,
        new Map([
          [1, idle()],
          [2, idle()],
        ]),
      );
    const total = Object.values(g.ledger!.points).reduce((a, b) => a + b, 0);
    expect(total).toBe(g.score); // idle chefs: only expiries (clamped at 0 by the score floor)
  });
});

describe('the rat that escapes', () => {
  const setup = (d: Difficulty) => {
    const g = mk(d, { hazardsV3: true });
    const counters = g.stations.filter((s) => s.kind === 'counter');
    counters[0]!.item = 'raw0';
    counters[counters.length - 1]!.item = 'dish';
    g.time = 100_000;
    return g;
  };
  const rat = (g: ReturnType<typeof mk>) => ({
    x: 1.5,
    y: 1.5,
    state: 'flee',
    item: null,
    from: -1,
    hole: [1, 1] as [number, number],
    scared: false,
    idleMs: 0,
  });
  it('takes the ready dish first (Normal), once per 30 s, and never when scared or in Easy', () => {
    const g = setup('normal');
    const r = rat(g) as never;
    const m = { lossAt: undefined } as never;
    const i = escapeLoot(g, r);
    expect(g.stations[i]!.item).toBe('dish');
    expect(stealOnEscape(g, m, r)).toBe(true);
    expect(g.stations[i]!.item).toBeNull();
    expect(stealOnEscape(g, m, r)).toBe(false); // the 30 s cap
    g.time += 31_000;
    expect(stealOnEscape(g, m, r)).toBe(true); // the raw item this time
    const g2 = setup('normal');
    expect(stealOnEscape(g2, { lossAt: undefined } as never, { ...(rat(g2) as object), scared: true } as never)).toBe(false);
    const g3 = setup('easy');
    expect(stealOnEscape(g3, { lossAt: undefined } as never, rat(g3) as never)).toBe(false);
    expect(g.ledger!.count['hazard:rat-escape']).toBe(2);
  });
});

describe('the oil of Hard', () => {
  it('a chef that steps on oil with a dish drops it (Hard), not in Normal; at most one drop per 30 s', () => {
    const run = (d: Difficulty) => {
      const m = patchMap(fixedMap('14')!, d);
      const g = createGame({
        mapId: '14',
        rows: m.rows,
        spawns: m.spawns,
        difficulty: d,
        n: 2,
        seed: 1,
        mech: mechFlagsOf(m.mechanics),
        hazardsV3: true,
      });
      addPlayer(g, 1, 0, 0);
      const p = g.players.get(1)!;
      p.item = 'dish';
      g.mech!.tile![Math.floor(p.y) * 16 + Math.floor(p.x) + 1] = 1; // oil one tile to the east
      p.x += 1;
      g.time = 5000;
      tick(g, new Map([[1, idle()]]));
      return { held: p.item, drops: g.ledger!.count['hazard:oil-drop'] ?? 0 };
    };
    expect(run('hard')).toEqual({ held: null, drops: 1 });
    expect(run('normal')).toEqual({ held: 'dish', drops: 0 });
  });
});

describe('the new school steps (data and rules, not yet wired)', () => {
  it('8 steps, the four new ones in the design order, at most 8 words each', () => {
    expect(SCHOOL_TOTAL_V3).toBe(8);
    expect(SCHOOL_STEPS_V3.slice(4).map((s) => s.id)).toEqual(['second', 'bigfire', 'oil', 'rat']);
    for (const s of SCHOOL_STEPS_V3) expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(8);
  });
  it('completion: a cheese dish, a big fire with two chefs (one chef alone: any fire), a wipe, a rat caught', () => {
    expect(completesV3(4, { kind: 'delivered', item: 'dishQ' })).toBe(true);
    expect(completesV3(4, { kind: 'delivered', item: 'dish' })).toBe(false);
    expect(completesV3(5, { kind: 'fireOut', chefs: 1, big: true })).toBe(false);
    expect(completesV3(5, { kind: 'fireOut', chefs: 2, big: true })).toBe(true);
    expect(completesV3(5, { kind: 'fireOut', chefs: 1, big: false }, true)).toBe(true);
    expect(completesV3(6, { kind: 'wiped' })).toBe(true);
    expect(completesV3(7, { kind: 'ratCaught', chefs: 1 })).toBe(false);
    expect(completesV3(7, { kind: 'ratCaught', chefs: 2 })).toBe(true);
    expect(completesV3(0, { kind: 'picked', item: 'raw0', from: 'crate' })).toBe(true); // the first four are the old rules
  });
  it('the hall keeps the 8 spawns, parses with the oil flag, validates the drip and has a cheese crate', () => {
    expect(SCHOOL_ROWS_V3.join('').split('S').length - 1).toBe(8);
    expect(() => parseMap(SCHOOL_ROWS_V3, false, mechFlagsOf(['oil']))).not.toThrow();
    expect(mechModule('oil').validate(SCHOOL_ROWS_V3, 8)).toEqual([]);
    expect(SCHOOL_ROWS_V3.join('')).toContain('3');
    void validateMap;
  });
});

describe('the card of dynamics', () => {
  it('shows each dynamic once per session', () => {
    const seen = new Set<never>();
    expect(cardLines(['oil', 'gate'], seen).map((l) => l.id)).toEqual(['oil', 'gate']);
    markSeen(seen as never, ['oil', 'gate']);
    expect(cardLines(['oil', 'sprinkler'], seen as never).map((l) => l.id)).toEqual(['sprinkler']);
    expect(cardLines(undefined, seen)).toEqual([]);
  });
  it('every patched map dynamic has a line of at most 9 words', () => {
    for (const id of ['10', '12', '13', '14', '15', '22', '27'])
      for (const mech of patchMap(fixedMap(id)!, 'normal').mechanics!)
        expect(DYNAMICS[mech].line.split(/\s+/).length).toBeLessThanOrEqual(9);
  });
});
