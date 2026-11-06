import { describe, expect, it } from 'vitest';
import { TICK_MS, recipeBase, type Game } from '../overcooked';
import {
  ACTIVE_MS,
  ANNOUNCE_MS,
  BIRTHDAY_POINTS,
  EVENTS_OPTION,
  EVENT_FROM_MS,
  EVENT_TO_MS,
  INSPECTOR_BONUS,
  RAT_PATIENCE_MS,
  RUSH_ORDERS,
  defaultEvents,
  eventsOf,
  roundRules,
} from './midround';
import { params } from '@pichi/core/difficulty';
import { GAMES, modeOf } from '@pichi/catalog';
import { mulberry32 } from '@pichi/core/rng';
import { startVersusRound, syncTeams } from '../versus/lobby';
import { mk, run, runTo } from './midround.kit';

describe('Rata: steals an item from a counter, a dash scares it (coop only)', () => {
  const counterWith = (g: Game, item: 'raw1' | 'cut0' = 'raw1') => {
    const c = g.stations.filter((s) => s.kind === 'counter')[8]!;
    c.item = item;
    return c;
  };
  it('it appears at a hole in the wall, walks to the counter that holds something, takes the item and runs back to leave', () => {
    const { g, log } = mk({ kind: 'rat', startAt: 3000 });
    const c = counterWith(g);
    run(g, 3100);
    expect(log['rat:appear']).toHaveLength(1);
    expect(g.mid!.rat).not.toBeNull();
    run(g, 20_000);
    expect(log['rat:steal']).toHaveLength(1);
    expect(log['rat:steal']![0]!.p).toEqual({ station: g.stations.indexOf(c), item: 'raw1' });
    expect(c.item).toBeNull();
    expect(log['rat:gone']).toHaveLength(1);
    expect(log['rat:gone']![0]!.p).toEqual({ stolen: true });
    expect(g.mid!.rat).toBeNull();
    expect(log['event:end']).toHaveLength(1);
    expect(log['event:end']![0]!.t).toBeLessThan(3000 + ACTIVE_MS.rat);
  });
  it('a chef that dashes at it scares it: the item goes back to its counter and the rat runs away without it', () => {
    const { g, log } = mk({ kind: 'rat', startAt: 3000, n: 1 });
    const c = counterWith(g);
    runTo(g, 3050);
    let guard = 0;
    while (!log['rat:steal']?.length && guard++ < 3000) run(g, TICK_MS);
    expect(c.item).toBeNull();
    const rat = g.mid!.rat!;
    const p = g.players.get(1)!;
    Object.assign(p, { x: rat.x - 0.4, y: rat.y, dashMs: 120, dashDx: 1, dashDy: 0 }); // a dash, right next to it
    run(g, TICK_MS);
    expect(log['rat:scared']).toHaveLength(1);
    expect(log['rat:scared']![0]!.p).toEqual({ player: 1, returned: true });
    expect(c.item).toBe('raw1');
    run(g, 15_000);
    expect(log['rat:gone']![0]!.p).toEqual({ stolen: false });
    expect(c.item).toBe('raw1');
  });
  it('without a dash it is not scared (walking next to it does nothing)', () => {
    const { g, log } = mk({ kind: 'rat', startAt: 3000, n: 1 });
    counterWith(g);
    runTo(g, 3050);
    const p = g.players.get(1)!;
    for (let i = 0; i < 600 && !log['rat:steal']?.length; i++) {
      const r = g.mid!.rat!;
      Object.assign(p, { x: r.x - 0.4, y: r.y, dashMs: 0 });
      run(g, TICK_MS);
    }
    expect(log['rat:steal']).toHaveLength(1);
    expect(log['rat:scared']).toBeUndefined();
  });
  it('with nothing on any counter it waits RAT_PATIENCE_MS and leaves empty-handed; an item put down while it waits is taken', () => {
    const { g, log } = mk({ kind: 'rat', startAt: 3000 });
    run(g, 3000 + RAT_PATIENCE_MS + 3000);
    expect(log['rat:steal']).toBeUndefined();
    expect(log['rat:gone']).toHaveLength(1);
    expect(log['rat:gone']![0]!.p).toEqual({ stolen: false });
    const late = mk({ kind: 'rat', startAt: 3000 });
    run(late.g, 5000);
    const c = counterWith(late.g, 'cut0');
    run(late.g, 20_000);
    expect(late.log['rat:steal']).toHaveLength(1);
    expect(c.item).toBeNull();
  });
  it('the event ends even if the rat gets stuck: ACTIVE_MS is the ceiling', () => {
    expect(ACTIVE_MS.rat).toBeGreaterThan(RAT_PATIENCE_MS);
  });
});

describe('the lobby option', () => {
  it('Eventos is Sí on Normal and Difícil and No on Fácil until the host says otherwise', () => {
    expect([defaultEvents('easy'), defaultEvents('normal'), defaultEvents('hard')]).toEqual([false, true, true]);
    expect(eventsOf({}, 'easy')).toBe(false);
    expect(eventsOf(undefined, 'normal')).toBe(true);
    expect(eventsOf({ [EVENTS_OPTION]: true }, 'easy')).toBe(true);
    expect(eventsOf({ [EVENTS_OPTION]: false }, 'hard')).toBe(false);
    expect(eventsOf({ [EVENTS_OPTION]: 'nonsense' }, 'hard')).toBe(true); // anything that is not a boolean is "no choice made"
  });
  it('roundRules: the burning oven always, the event by the option', () => {
    const always = { burn: true, fire: true, recipes: true, frost: true, versusV3: true }; // versusV3 (VERSUS_V3): the lobby switches it on, a coop round ignores it
    expect(roundRules({}, 'normal')).toEqual({ ...always, events: true, magnet: 'normal', pace: 1.6 });
    expect(roundRules({}, 'easy')).toEqual({ ...always, events: false, magnet: 'strong', pace: 1.2 }); // Easy: a stronger magnet
    expect(roundRules({}, 'hard').magnet).toBe('normal');
    expect(roundRules({ magnet: false }, 'normal').magnet).toBe(false);
    expect(roundRules({ events: false }, 'hard').events).toBe(false);
  });
  it('a versus round from the lobby has the event by the option, the same one for both kitchens', () => {
    const versus = modeOf(GAMES[0], 'versus');
    const teams = syncTeams(versus, null, [1, 2, 3, 4], 4, false)!;
    const round = (difficulty: 'easy' | 'normal' | 'hard', modeOptions: Record<string, boolean | string>, eventsSeed?: number) =>
      startVersusRound({ teams, choice: 'V1', difficulty, seed: 4, eventsSeed, modeOptions, slotOf: (id) => id - 1, rand: mulberry32(1) })
        .game;
    expect([round('normal', {}).mid, round('normal', {}).vz3].every((x) => x !== null)).toBe(true); // the event, and VERSUS_V3 (a rat per kitchen, the Ola de frio) from the lobby
    expect(round('easy', {}).mid).toBeNull();
    expect(round('easy', { events: true }).mid).not.toBeNull();
    expect(round('hard', { events: false }).mid).toBeNull();
    expect(round('normal', {}, 123).mid!.kind + round('normal', {}, 123).mid!.startAt).toBe(
      round('normal', {}, 123).mid!.kind + round('normal', {}, 123).mid!.startAt,
    );
    const seeds = Array.from({ length: 40 }, (_v, i) => round('normal', {}, i).mid!.startAt);
    expect(new Set(seeds).size).toBeGreaterThan(20); // another event seed, another event
  });
  it('the constants are the council numbers: 3 orders, +100, 150 (a triple of a Marinara), 3 s of warning, a window of 1:00 to 2:00', () => {
    expect([RUSH_ORDERS, INSPECTOR_BONUS, BIRTHDAY_POINTS, ANNOUNCE_MS, EVENT_FROM_MS, EVENT_TO_MS, ACTIVE_MS.blackout]).toEqual([
      3, 100, 150, 3000, 60_000, 120_000, 10_000,
    ]);
    expect(BIRTHDAY_POINTS).toBeGreaterThanOrEqual(2 * recipeBase('marinara', params('normal', 2).tune));
  });
});
