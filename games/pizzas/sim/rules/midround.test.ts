// The event in the middle of the round (midround.ts) on the real maps: pure logic. One event per round between 1:00 and 2:00, announced 3 s before, the same for both
// teams of a versus round; rush, inspector, blackout, birthday and (coop only) the rat.
import { describe, expect, it } from 'vitest';
import { TICK_MS, addPlayer, createGame, tick, type Game } from '../overcooked';
import {
  ACTIVE_MS,
  ANNOUNCE_MS,
  BIRTHDAY_POINTS,
  EVENT_FROM_MS,
  EVENT_INFO,
  EVENT_KINDS,
  EVENT_MAX_QUEUE,
  EVENT_TO_MS,
  RUSH_ORDERS,
  eventPool,
} from './midround';
import { MIRRORS } from '../../test/golden/mirror-bot';
import { idle, mk, force, run, runTo, only, near, face, times } from './midround.kit';

describe('events off (the default): nothing new runs', () => {
  it('a game made without `events` has no event and a whole round emits none of them', () => {
    const g0 = createGame({ n: 2 });
    expect(g0.mid).toBeNull();
    const { g, log } = mk({ events: false });
    run(g, 150_000);
    for (const k of ['event:announce', 'event:start', 'event:end', 'rat:appear'] as const) expect(log[k], k).toBeUndefined();
  });
});

describe('the schedule: one event per round, between 1:00 and 2:00, announced 3 s before', () => {
  it('the kind and the instant come from the seed alone: the same seed gives the same event, other seeds give other ones, the start is always inside the window', () => {
    const at = (seed: number, map = '1') => {
      const m = mk({ seed, map }).g.mid!;
      return `${m.kind}@${m.startAt}`;
    };
    expect(at(7)).toBe(at(7));
    const all = Array.from({ length: 120 }, (_v, i) => mk({ seed: i + 1 }).g.mid!);
    expect(new Set(all.map((m) => m.kind)).size).toBe(4); // map 1 has no plates to wash: no inspector (the other four appear)
    expect(new Set(all.map((m) => m.startAt)).size).toBeGreaterThan(60);
    for (const m of all) {
      expect(m.startAt).toBeGreaterThanOrEqual(EVENT_FROM_MS);
      expect(m.startAt).toBeLessThanOrEqual(EVENT_TO_MS);
      expect(m.announceAt).toBe(m.startAt - ANNOUNCE_MS);
    }
  });
  it('it has a stream of its own: switching events on does not move the orders of a round (the same recipes at the same instants)', () => {
    const seq = (events: boolean) => {
      const { g, log } = mk({ events, seed: 3 });
      force0(g);
      run(g, 55_000);
      return (log.orderNew ?? []).map((e) => `${e.t}|${e.p.recipe}`).join();
    };
    const force0 = (g: Game) => {
      if (g.mid) force(g, 'blackout', 100_000);
    }; // an event that draws nothing from the queues, late enough not to matter
    expect(seq(true)).toBe(seq(false));
    expect(mk({ events: true, seed: 3 }).g.teams[0]!.rng()).toBe(mk({ events: false, seed: 3 }).g.teams[0]!.rng());
  });
  it('the timeline: announce 3 s before, start on time, end after its duration, and then nothing else for the rest of the round', () => {
    for (const kind of ['blackout', 'inspector', 'rush'] as const) {
      const { g, log } = mk({ kind, startAt: 62_000, map: kind === 'inspector' ? '13' : '1' });
      run(g, 130_000);
      near(times(log, 'event:announce')[0]!, 59_000);
      expect(log['event:announce']![0]!.p).toEqual({ kind, inMs: ANNOUNCE_MS });
      near(times(log, 'event:start')[0]!, 62_000);
      expect(log['event:start']![0]!.p).toEqual({ kind, durationMs: ACTIVE_MS[kind] });
      near(times(log, 'event:end')[0]!, 62_000 + ACTIVE_MS[kind]);
      expect([log['event:announce']!.length, log['event:start']!.length, log['event:end']!.length], kind).toEqual([1, 1, 1]); // one event, never two at a time
    }
  });
  it('the pool: no rat in versus, no inspector on a map with no plates to wash; the rat and the inspector do exist where they can', () => {
    const coop1 = mk({ map: '1' }).g,
      coop13 = mk({ map: '13' }).g;
    expect(eventPool(coop1)).toEqual(['rush', 'blackout', 'birthday', 'rat']);
    expect(eventPool(coop13)).toEqual(['rush', 'inspector', 'blackout', 'birthday', 'rat']);
    const vs = createGame({ rows: MIRRORS.v1.rows, teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }], events: true });
    expect(eventPool(vs)).toEqual(['rush', 'blackout', 'birthday']);
    for (let seed = 1; seed <= 150; seed++)
      expect(
        createGame({ rows: MIRRORS.v1.rows, teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }], events: true, seed }).mid!.kind,
      ).not.toBe('rat');
    expect(EVENT_KINDS.every((k) => EVENT_INFO[k].title && EVENT_INFO[k].blurb)).toBe(true);
  });
});

describe('Hora punta: three orders at once', () => {
  it('every queue gets RUSH_ORDERS orders at the start tick, up to the size of the order strip', () => {
    const { g, log } = mk({ kind: 'rush', startAt: 5000 });
    g.teams[0]!.orders = g.teams[0]!.orders.slice(0, 1);
    runTo(g, 4900);
    const before = g.orders.length;
    runTo(g, 5100);
    expect(g.orders.length).toBe(before + 3); // three at once (the council's number)
    expect((log.orderNew ?? []).filter((e) => e.t >= 5000 - TICK_MS && e.t <= 5100)).toHaveLength(RUSH_ORDERS);
    const full = mk({ kind: 'rush', startAt: 5000, n: 8 });
    runTo(full.g, 5100);
    expect(full.g.orders.length).toBeLessThanOrEqual(EVENT_MAX_QUEUE);
  });
  it('versus: the same three recipes in both queues, at the same instant', () => {
    const g = createGame({ rows: MIRRORS.v1.rows, teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }], events: true, seed: 6 });
    [
      [1, 2],
      [3, 4],
    ].forEach((ids) => ids.forEach((id, r) => addPlayer(g, id, r, r)));
    force(g, 'rush', 3000);
    const recipes = (t: number) => g.teams[t]!.orders.map((o) => o.recipe);
    run(g, 2900);
    const b0 = g.teams[0]!.orders.length,
      b1 = g.teams[1]!.orders.length;
    run(g, 200);
    expect(g.teams[0]!.orders.length - b0).toBe(RUSH_ORDERS);
    expect(g.teams[1]!.orders.length - b1).toBe(RUSH_ORDERS);
    expect(recipes(0).slice(-RUSH_ORDERS)).toEqual(recipes(1).slice(-RUSH_ORDERS));
  });
});

describe('Pedido de cumpleaños: a pizza order worth 150', () => {
  const dish = (g: Game, id: number, item: 'dish' | 'dishQ' = 'dish') => {
    const w = g.stations.find((s) => s.kind === 'window')!;
    const p = face(g, id, w);
    p.item = item;
    tick(g, only(id, { ...idle, a: 1 }));
  };
  it('a birthday order shows up in the queue with its flag; serving a plain pizza pays 150 flat (no tip, no multiplier) and counts for the streak', () => {
    const { g, log } = mk({ kind: 'birthday', startAt: 3000 });
    g.teams[0]!.orders = [];
    runTo(g, 3100);
    const o = g.orders.find((x) => x.birthday)!;
    expect(o).toBeTruthy();
    expect(log.orderNew!.some((e) => e.p.birthday === true)).toBe(true);
    g.streak = 3; // a streak that would multiply a tip
    dish(g, 1);
    expect(g.orders.some((x) => x.birthday)).toBe(false);
    expect(g.score).toBe(150); // written out: the council's number, not the constant under test
    expect(log.delivered![0]!.p).toMatchObject({ points: 150, tip: 0, base: 150, mult: 1 });
    expect(g.streak).toBe(4);
  });
  it('it is served before the older plain order of the same recipe, and a Margarita fits it too', () => {
    const { g } = mk({ kind: 'birthday', startAt: 3000, map: '2' });
    g.teams[0]!.orders = [{ id: 90, expiresAt: Infinity, warned: true, recipe: 'marinara' }];
    runTo(g, 3100);
    expect(g.orders.map((o) => !!o.birthday)).toEqual([false, true]);
    dish(g, 1, 'dishQ');
    expect(g.orders.map((o) => o.id)).toEqual([90]);
    expect(g.score).toBe(150);
  });
  it('a full strip still shows it: it goes to the front', () => {
    const { g } = mk({ kind: 'birthday', startAt: 3000, n: 4 });
    g.teams[0]!.orders = Array.from({ length: EVENT_MAX_QUEUE }, (_v, i) => ({
      id: 80 + i,
      expiresAt: Infinity,
      warned: true,
      recipe: 'marinara' as const,
    }));
    runTo(g, 3100);
    expect(g.orders[0]!.birthday).toBe(true);
  });
  it('versus: one for each team, each worth 150 times its own k', () => {
    const g = createGame({ rows: MIRRORS.v1.rows, teams: [{ playerIds: [1, 2, 3] }, { playerIds: [4, 5] }], events: true, seed: 6 });
    for (const ids of [
      [1, 2, 3],
      [4, 5],
    ])
      ids.forEach((id, r) => addPlayer(g, id, r, r));
    force(g, 'birthday', 3000);
    run(g, 3100);
    expect(g.teams.map((t) => t.orders.filter((o) => o.birthday).length)).toEqual([1, 1]);
    for (const [team, id] of [
      [0, 1],
      [1, 4],
    ] as const) {
      const w = g.stations.find((s) => s.kind === 'window' && s.owner === team)!;
      const p = face(g, id, w);
      p.item = 'dish';
      tick(g, only(id, { ...idle, a: 1 }));
    }
    expect(g.teams[0]!.score).toBe(BIRTHDAY_POINTS);
    expect(g.teams[1]!.score).toBe(Math.round(BIRTHDAY_POINTS * g.teams[1]!.k));
    expect(g.teams[1]!.k).toBeGreaterThan(1);
  });
});
