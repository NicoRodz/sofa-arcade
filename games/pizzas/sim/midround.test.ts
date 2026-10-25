// The event in the middle of the round (midround.ts) on the real maps: pure logic. One event per round between 1:00 and 2:00, announced 3 s before, the same for both
// teams of a versus round; rush, inspector, blackout, birthday and (coop only) the rat.
import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { DIRS, fixedMap, isFloor } from './maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Station } from './overcooked';
import {
  ACTIVE_MS,
  ANNOUNCE_MS,
  BIRTHDAY_POINTS,
  EVENTS_OPTION,
  EVENT_FROM_MS,
  EVENT_INFO,
  EVENT_KINDS,
  EVENT_MAX_QUEUE,
  EVENT_TO_MS,
  INSPECTOR_BONUS,
  RAT_PATIENCE_MS,
  RUSH_ORDERS,
  defaultEvents,
  dirtyPlates,
  eventPool,
  eventsOf,
  roundRules,
  type EventKind,
} from './midround';
import { GRACE_MS } from './burn';
import { recipeBase } from './overcooked';
import { params } from '@pichi/core/difficulty';
import { MIRRORS } from '../test/golden/mirror-bot';
import { GAMES, modeOf } from '@pichi/core/games';
import { mulberry32 } from '@pichi/core/rng';
import { startVersusRound, syncTeams } from './versus/lobby';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };
const KINDS = [
  'event:announce',
  'event:start',
  'event:end',
  'event:inspector',
  'rat:appear',
  'rat:steal',
  'rat:scared',
  'rat:gone',
  'orderNew',
  'delivered',
  'oven:burnt',
  'potReady',
] as const;

function mk(
  o: {
    map?: string;
    difficulty?: 'easy' | 'normal' | 'hard';
    seed?: number;
    n?: number;
    events?: boolean;
    burn?: boolean;
    kind?: EventKind;
    startAt?: number;
  } = {},
) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const g = createGame({
    rows: fixedMap(o.map ?? '1')!.rows,
    mapId: o.map ?? '1',
    n: 2,
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    events: o.events ?? true,
    burn: o.burn,
  });
  for (const k of KINDS)
    bus.on(k, ((p: never) => {
      ((log[k] ??= []) as { t: number; p: unknown }[]).push({ t: g.time, p });
    }) as never);
  for (let i = 1; i <= (o.n ?? 1); i++) addPlayer(g, i, i - 1, i - 1);
  if (o.kind) force(g, o.kind, o.startAt ?? 5000);
  return { g, log };
}
/** Makes this round's event be `kind`, starting at match time `startAt`. */
function force(g: Game, kind: EventKind, startAt: number) {
  Object.assign(g.mid!, { kind, startAt, announceAt: startAt - ANNOUNCE_MS, endAt: Infinity, phase: 'wait', dark: false, rat: null });
}
const run = (g: Game, ms: number, c: (id: number) => Controls = () => idle) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c(id)])));
};
const runTo = (g: Game, time: number, c?: (id: number) => Controls) => run(g, Math.max(0, time - g.time), c);
const only = (id: number, c: Controls) => new Map([[id, c]]);
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(TICK_MS + 1);
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
const times = (log: Log, k: keyof GameEvents) => (log[k] ?? []).map((e) => e.t);

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
    expect(new Set(all.map((m) => m.kind)).size).toBe(5); // map 1 has no plates to wash: no inspector (the other five appear)
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
  it('the pool: no rat or frost in versus, no inspector on a map with no plates to wash; the rat and the inspector do exist where they can', () => {
    const coop1 = mk({ map: '1' }).g,
      coop13 = mk({ map: '13' }).g;
    expect(eventPool(coop1)).toEqual(['rush', 'blackout', 'birthday', 'rat', 'frost']);
    expect(eventPool(coop13)).toEqual(['rush', 'inspector', 'blackout', 'birthday', 'rat', 'frost']);
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
    for (const [i, ids] of [
      [1, 2, 3],
      [4, 5],
    ].entries())
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

describe('Corte de luz: the ovens are off for 10 s', () => {
  it('an oven that is cooking makes no progress while the lights are out, and goes on afterwards', () => {
    const { g } = mk({ kind: 'blackout', startAt: 3000 });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    oven.inputs = [0, 1];
    oven.progress = 0;
    run(g, 2900);
    const before = oven.progress;
    expect(before).toBeGreaterThan(0.3);
    run(g, 1500);
    expect(g.mid!.dark).toBe(true);
    const frozen = oven.progress;
    run(g, 8000);
    expect(oven.progress).toBeCloseTo(frozen, 6);
    run(g, 1500);
    expect(g.mid!.dark).toBe(false);
    run(g, 1000);
    expect(oven.progress).toBeGreaterThan(frozen);
  });
  it('with the burn rules on, the grace time of a ready pizza does not run in the dark', () => {
    const { g, log } = mk({ kind: 'blackout', startAt: 3000, burn: true });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    runTo(g, 2000);
    oven.inputs = [0, 1];
    oven.progress = 1;
    oven.done = true;
    oven.readyAt = g.time;
    runTo(g, 3000 + ACTIVE_MS.blackout - 200); // 2 s before the start, ready: 1 s of grace spent, then the whole blackout
    expect(oven.burnt).toBeUndefined();
    runTo(g, 2000 + GRACE_MS.normal + ACTIVE_MS.blackout - 600); // ... still not burnt: the dark added its 10 s
    expect(oven.burnt).toBeUndefined();
    runTo(g, 2000 + GRACE_MS.normal + ACTIVE_MS.blackout + 400);
    expect(oven.burnt).toBe(true);
    expect(log['oven:burnt']).toHaveLength(1);
  });
  it('without the event the same pizza burns at the grace time (the test above is not vacuous)', () => {
    const { g } = mk({ events: false, burn: true });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    oven.inputs = [0, 1];
    oven.progress = 1;
    oven.done = true;
    oven.readyAt = g.time;
    run(g, GRACE_MS.normal + 400);
    expect(oven.burnt).toBe(true);
  });
});

describe('Inspector: +100 when no dirty plate is left at the end', () => {
  it('only on a map with plates to wash; the verdict comes when it ends', () => {
    const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13', n: 2 });
    expect(g.finitePlates).toBe(true);
    runTo(g, 3000 + ACTIVE_MS.inspector - 500);
    expect(log['event:inspector']).toBeUndefined();
    runTo(g, 3000 + ACTIVE_MS.inspector + 200);
    expect(log['event:inspector']).toHaveLength(1);
    expect(log['event:inspector']![0]!.p).toEqual({ passed: true, points: 100 });
    expect(g.score).toBe(100);
    expect(g.teams[0]!.gross).toBe(100);
  });
  it('a dirty plate in the return window, in the sink, on a counter or in a chef hands spoils it', () => {
    const spoil: [string, (g: Game) => void][] = [
      [
        'return window',
        (g) => {
          g.stations.find((s) => s.kind === 'dirty')!.count = 1;
        },
      ],
      [
        'sink',
        (g) => {
          g.stations.find((s) => s.kind === 'sink')!.count = 1;
        },
      ],
      [
        'counter',
        (g) => {
          g.stations.find((s) => s.kind === 'counter')!.item = 'dirty';
        },
      ],
      [
        'hands',
        (g) => {
          g.players.get(1)!.item = 'dirty';
        },
      ],
    ];
    for (const [where, f] of spoil) {
      const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13' });
      f(g);
      expect(dirtyPlates(g, 0), where).toBe(1);
      runTo(g, 3000 + ACTIVE_MS.inspector + 200);
      expect(log['event:inspector']![0]!.p, where).toEqual({ passed: false, points: 0 });
      expect(g.score, where).toBe(0);
    }
  });
  it('washing them during the event earns it', () => {
    const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13' });
    g.stations.find((s) => s.kind === 'dirty')!.count = 2;
    run(g, 5000);
    for (const s of g.stations) if (s.kind === 'dirty') s.count = 0; // (the washing itself is tested in the base rules)
    runTo(g, 3000 + ACTIVE_MS.inspector + 200);
    expect(log['event:inspector']![0]!.p.passed).toBe(true);
  });
  it('versus: each team is judged on its own kitchen and the bonus goes through k (no real versus map has plates to wash, so a sink and a return are drawn into V1)', () => {
    const rows = MIRRORS.v1.rows.map((r, y) => (y === 8 ? `#UL${r.slice(3, 13)}LU#` : r)); // the bottom wall: return window and sink in each kitchen, twins under the reflection
    const g = createGame({
      rows,
      spawns: [
        [2, 5],
        [2, 6],
        [5, 5],
        [13, 5],
        [13, 6],
        [10, 5],
      ],
      teams: [{ playerIds: [1, 2, 3] }, { playerIds: [4, 5] }],
      events: true,
      seed: 4,
    });
    [
      [1, 2, 3],
      [4, 5],
    ].forEach((ids) => ids.forEach((id, r) => addPlayer(g, id, r, r)));
    expect(g.finitePlates).toBe(true);
    expect(eventPool(g)).toContain('inspector');
    force(g, 'inspector', 3000);
    g.stations.find((s) => s.kind === 'sink' && s.owner === 0)!.count = 1; // a dirty plate waits in kitchen 0 only
    run(g, 3000 + ACTIVE_MS.inspector + 300);
    expect(g.teams[1]!.k).toBeGreaterThan(1); // the small team of a 3 v 2
    expect(g.teams.map((t) => t.score)).toEqual([0, Math.round(INSPECTOR_BONUS * g.teams[1]!.k)]);
    expect(g.teams[1]!.gross).toBe(INSPECTOR_BONUS);
  });
});

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
    expect(roundRules({}, 'normal')).toEqual({ burn: true, fire: true, events: true, recipes: true, magnet: 'normal', pace: 1.6 });
    expect(roundRules({}, 'easy')).toEqual({ burn: true, fire: true, events: false, recipes: true, magnet: 'strong', pace: 1.2 }); // Easy: a stronger magnet
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
    expect(round('normal', {}).mid).not.toBeNull();
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
