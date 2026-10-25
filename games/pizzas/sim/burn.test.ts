// The oven that burns, the fire and the extinguishing (burn.ts) on the real maps: pure logic, chefs are put next to the stations by hand and the ticks are run directly.
// Map 1 has its two ovens at (11, 0) and (13, 0) with counters at (10, 0), (12, 0) and (14, 0): the fire has neighbours to jump to.
import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { fixedMap, DIRS, isFloor } from './maps';
import { TICK_MS, addPlayer, createGame, dropPlayer, tick, type Controls, type Game, type Station } from './overcooked';
import { DOUSE_MS, FIRE_DELAY_MS, FIRE_RINGS, FIRE_SPREAD_MS, GRACE_MS, WARN_BEFORE_MS, createBurn, fireAllowed, ovenStage } from './burn';
import { versusMap } from './versus/maps';
import { GAMES, modeOf } from '@pichi/core/games';
import { mulberry32 } from '@pichi/core/rng';
import { startVersusRound, syncTeams } from './versus/lobby';
import type { Difficulty } from '@pichi/core/difficulty';
import type { SabotageMode } from './sabotage-config';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };

function mk(o: { map?: string; difficulty?: Difficulty; n?: number; burn?: boolean; fire?: boolean; seed?: number } = {}) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const g = createGame({
    rows: fixedMap(o.map ?? '1')!.rows,
    mapId: o.map ?? '1',
    n: 2,
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    burn: o.burn ?? true,
    fire: o.fire ?? true,
  });
  const kinds = [
    'oven:warn',
    'oven:burnt',
    'oven:rescued',
    'fire:start',
    'fire:spread',
    'fire:out',
    'fire:end',
    'douseStart',
    'douseStop',
    'potReady',
    'itemPicked',
    'interactInvalid',
    'delivered',
    'chopStart',
    'chopStop',
  ] as const;
  for (const k of kinds)
    bus.on(k, ((p: never) => {
      ((log[k] ??= []) as { t: number; p: unknown }[]).push({ t: g.time, p });
    }) as never);
  for (let i = 1; i <= (o.n ?? 1); i++) addPlayer(g, i, i - 1, i - 1);
  return { g, log };
}
const ovens = (g: Game) => g.stations.filter((s) => s.kind === 'pot');
const counters = (g: Game) => g.stations.filter((s) => s.kind === 'counter');
const at = (g: Game, s: Station) => g.stations.indexOf(s);
const run = (g: Game, ms: number, c: (id: number) => Controls = () => idle) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c(id)])));
};
const only = (id: number, c: Controls) => new Map([[id, c]]);
const pressA = (g: Game, id: number) => tick(g, only(id, { ...idle, a: 1 }));
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
/** A baked pizza in the oven, ready at this instant. */
const bake = (g: Game, s: Station, cheese = false) => {
  s.inputs = cheese ? [0, 1, 2] : [0, 1];
  s.progress = 1;
  s.done = true;
  s.readyAt = g.time;
};
/** The chef takes the pizza out (it must hold a plate). */
function take(g: Game, id: number, s: Station) {
  const p = face(g, id, s);
  p.item = 'plate';
  pressA(g, id);
  return p;
}
const times = (log: Log, k: keyof GameEvents) => (log[k] ?? []).map((e) => e.t);
/** `a` is within one tick (plus a hair) of `b`. */
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(TICK_MS + 1);
/** The chef stands on the k-th floor tile that touches the station (another k = another tile: two chefs in front of the same fire). */
function faceAt(g: Game, id: number, s: Station, k: number) {
  const p = g.players.get(id)!;
  const open = DIRS.filter(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy));
  const [dx, dy] = open[k % open.length]!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}

describe('burn off (the default): the oven waits for ever', () => {
  it('a game made without `burn` has no burn state and a ready pizza stays ready', () => {
    expect(createGame({ n: 2 }).burn).toBeNull();
    const { g, log } = mk({ burn: false });
    bake(g, ovens(g)[0]!);
    run(g, 90_000);
    expect(ovens(g)[0]!.done).toBe(true);
    expect(ovens(g)[0]!.burnt).toBeUndefined();
    expect(log['oven:warn'] ?? log['oven:burnt'] ?? log['fire:start']).toBeUndefined();
  });
  it('a game with `fire` but not `burn` burns nothing either', () => {
    const g = createGame({ n: 2, fire: true, events: false });
    expect(g.burn).toBeNull();
    expect(g.mid).toBeNull();
  });
});

describe('the grace window: 8 s on Normal and Hard, 15 s on Easy, with a warning beep before it ends', () => {
  it('the table', () => {
    expect(GRACE_MS).toEqual({ easy: 15_000, normal: 8_000, hard: 8_000 });
    expect(createBurn('easy', true, 1).graceMs).toBe(15_000);
  });
  for (const d of ['easy', 'normal', 'hard'] as const) {
    it(`${d}: warn ${WARN_BEFORE_MS} ms before the grace ends, burnt when it does`, () => {
      const { g, log } = mk({ difficulty: d });
      const oven = ovens(g)[0]!;
      const t0 = g.time;
      bake(g, oven);
      run(g, GRACE_MS[d] + 200);
      near(times(log, 'oven:warn')[0]! - t0, GRACE_MS[d] - 3000); // 3 s before it burns (written out: not the constant under test)
      expect(WARN_BEFORE_MS).toBe(3000);
      expect(log['oven:warn']![0]!.p.msLeft).toBeLessThanOrEqual(WARN_BEFORE_MS);
      near(times(log, 'oven:burnt')[0]! - t0, GRACE_MS[d]);
      expect(log['oven:burnt']).toHaveLength(1);
      expect(oven.burnt).toBe(true);
      expect(ovenStage(oven)).toBe('burnt');
    });
  }
  it('with a real bake (dough and tomato through the board) it is the potReady event that starts the clock', () => {
    const { g, log } = mk({ difficulty: 'normal' });
    const oven = ovens(g)[0]!;
    oven.inputs = [0, 1];
    oven.progress = 0;
    run(g, g.params.cookMs + 500);
    expect(log.potReady).toHaveLength(1);
    near(oven.readyAt!, log.potReady![0]!.t);
    run(g, GRACE_MS.normal + 100);
    expect(oven.burnt).toBe(true);
  });
  it('the pizza taken in time is a normal dish; taken after the warning it is a "rescue"; before the warning it is not', () => {
    const early = mk();
    bake(early.g, ovens(early.g)[0]!);
    run(early.g, 2000);
    expect(take(early.g, 1, ovens(early.g)[0]!).item).toBe('dish');
    expect(early.log['oven:rescued']).toBeUndefined();
    expect(ovens(early.g)[0]!.readyAt).toBeUndefined();
    const late = mk();
    bake(late.g, ovens(late.g)[0]!, true);
    run(late.g, GRACE_MS.normal - 1000);
    expect(take(late.g, 1, ovens(late.g)[0]!).item).toBe('dishQ');
    expect(late.log['oven:rescued']).toHaveLength(1);
    expect(late.log['oven:rescued']![0]!.p).toMatchObject({ player: 1, station: at(late.g, ovens(late.g)[0]!) });
  });
});

describe('a burnt pizza cannot be delivered: it goes to the bin', () => {
  it('taken on a plate it is `burnt`; the window refuses it with no change in score, queue or streak', () => {
    const { g, log } = mk();
    const oven = ovens(g)[0]!;
    bake(g, oven);
    run(g, GRACE_MS.normal + 100);
    expect(take(g, 1, oven).item).toBe('burnt');
    expect(oven.done).toBe(false);
    expect(oven.inputs).toEqual([]);
    expect(oven.burnt).toBeUndefined();
    expect(log['oven:rescued']).toBeUndefined();
    const orders = g.orders.length,
      score = g.score,
      invalid = (log.interactInvalid ?? []).length; // (taking a dish off the oven already logs one: plate in, dish out)
    const w = g.stations.find((s) => s.kind === 'window')!;
    const p = face(g, 1, w);
    pressA(g, 1);
    expect(p.item).toBe('burnt');
    expect(g.score).toBe(score);
    expect(g.orders).toHaveLength(orders);
    expect(log.delivered).toBeUndefined();
    expect(log.interactInvalid).toHaveLength(invalid + 1);
  });
  it('the bin empties the hands; on a map with plates the plate comes back dirty', () => {
    const { g } = mk({ map: '13' });
    expect(g.finitePlates).toBe(true);
    const oven = ovens(g)[0]!;
    bake(g, oven);
    run(g, GRACE_MS.normal + 100);
    const p = take(g, 1, oven);
    expect(p.item).toBe('burnt');
    face(g, 1, g.stations.find((s) => s.kind === 'trash')!);
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(g.teams[0]!.dirtyDue).toHaveLength(1);
  });
  it('a burnt oven takes no new ingredients (it is full until somebody takes it out)', () => {
    const { g } = mk();
    const oven = ovens(g)[0]!;
    bake(g, oven);
    run(g, GRACE_MS.normal + 100);
    const p = face(g, 1, oven);
    p.item = 'cut0';
    pressA(g, 1);
    expect(p.item).toBe('cut0');
    expect(oven.inputs).toEqual([0, 1]);
  });
});

describe('fire', () => {
  it('Normal: the oven catches fire FIRE_DELAY_MS after it burnt; what it held is lost and it is out of use', () => {
    const { g, log } = mk();
    const oven = ovens(g)[0]!;
    bake(g, oven);
    run(g, GRACE_MS.normal + FIRE_DELAY_MS - 200);
    expect(log['fire:start']).toBeUndefined();
    run(g, 400);
    expect(log['fire:start']).toHaveLength(1);
    expect(log['fire:start']![0]!.p.station).toBe(at(g, oven));
    near(times(log, 'fire:start')[0]! - times(log, 'oven:burnt')[0]!, FIRE_DELAY_MS);
    expect(ovenStage(oven)).toBe('fire');
    expect(oven.inputs).toEqual([]);
    expect(oven.done).toBe(false);
    // A on the burning oven: nothing moves
    const p = face(g, 1, oven);
    p.item = 'plate';
    pressA(g, 1);
    expect(p.item).toBe('plate');
    expect(log.interactInvalid).toHaveLength(1);
    // ... and it does not cook: ingredients cannot go in
    p.item = 'cut0';
    pressA(g, 1);
    expect(oven.inputs).toEqual([]);
  });
  it('Easy has no fire: the pizza burns and stays burnt for ever', () => {
    const { g, log } = mk({ difficulty: 'easy' });
    bake(g, ovens(g)[0]!);
    run(g, 60_000);
    expect(log['oven:burnt']).toHaveLength(1);
    expect(log['fire:start']).toBeUndefined();
    expect(g.burn!.fire).toBe(false);
  });
  it('the `fire` flag off: the pizza burns, no fire', () => {
    const { g, log } = mk({ fire: false });
    bake(g, ovens(g)[0]!);
    run(g, 40_000);
    expect(log['oven:burnt']).toHaveLength(1);
    expect(log['fire:start']).toBeUndefined();
  });
  it('fireAllowed: not on Easy, not under the Suave sabotage (the chaos cap), yes on Normal and Hard with Caos or without sabotage', () => {
    const cases: [Difficulty, SabotageMode | undefined, boolean][] = [
      ['easy', undefined, false],
      ['easy', 'chaos', false],
      ['normal', undefined, true],
      ['normal', 'off', true],
      ['normal', 'soft', false],
      ['normal', 'chaos', true],
      ['hard', 'soft', false],
      ['hard', 'chaos', true],
    ];
    for (const [d, s, want] of cases) expect(fireAllowed(d, s), `${d} ${s}`).toBe(want);
  });
  it('a versus round under Suave sabotage never has fire (createGame applies the cap); under Caos it can', () => {
    const m = versusMap('V1')!;
    const mkv = (sabotage: SabotageMode) =>
      createGame({
        mapId: m.id,
        rows: m.rows,
        spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]],
        difficulty: 'hard',
        teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }],
        sabotage,
        sigma: m.versus.sigma,
        burn: true,
        fire: true,
      });
    expect(mkv('soft').burn!.fire).toBe(false);
    expect(mkv('chaos').burn!.fire).toBe(true);
    expect(mkv('off').burn!.fire).toBe(true);
  });
  it('the fire jumps to the counters next to it every 3 s, burns what they held, and stops after two jumps', () => {
    const { g, log } = mk({ map: '11' });
    const burning = (s: Station) => s.fire !== undefined;
    const oven = ovens(g)[0]!;
    const neighbours = counters(g).filter((c) => Math.abs(c.tx - oven.tx) + Math.abs(c.ty - oven.ty) === 1);
    expect(neighbours.length).toBeGreaterThan(0);
    neighbours[0]!.item = 'raw1';
    bake(g, oven);
    run(g, GRACE_MS.normal + FIRE_DELAY_MS + 100);
    const t0 = times(log, 'fire:start')[0]!;
    expect(g.stations.filter(burning)).toEqual([oven]);
    run(g, FIRE_SPREAD_MS);
    expect(neighbours.every(burning)).toBe(true); // EVERY neighbour at once: no tie-break
    expect(neighbours[0]!.item).toBeNull();
    near(times(log, 'fire:spread')[0]! - t0, FIRE_SPREAD_MS);
    run(g, FIRE_SPREAD_MS * 5);
    const total = g.stations.filter(burning).length;
    expect(log['fire:spread']!.length).toBe(total - 1);
    // never more than FIRE_RINGS jumps from the oven: every burning counter is within that many steps of a burning station
    expect(FIRE_RINGS).toBe(2);
    expect(g.burn!.fires[0]!.rings).toBe(FIRE_RINGS);
  });
  it('one active fire per kitchen: a second oven that burns waits, and catches fire only after the kitchen is out', () => {
    const { g, log } = mk({ n: 2 });
    const [a, b] = ovens(g) as [Station, Station];
    bake(g, a);
    bake(g, b);
    run(g, GRACE_MS.normal + FIRE_DELAY_MS + 100);
    expect(log['fire:start']).toHaveLength(1); // only one of them
    expect(g.stations.filter((s) => s.kind === 'pot' && s.fire === undefined)).toHaveLength(1);
    const waiting = g.stations.find((s) => s.kind === 'pot' && s.fire === undefined)!;
    expect(waiting.burnt).toBe(true);
    run(g, FIRE_SPREAD_MS * 4); // the fire spreads and the other oven keeps waiting
    expect(log['fire:start']).toHaveLength(1);
    // two chefs put out every burning station
    let guard = 0;
    while (g.stations.some((s) => s.fire !== undefined && s.kind !== 'pot') && guard++ < 20) {
      const s = g.stations.find((x) => x.fire !== undefined && x.kind !== 'pot')!;
      faceAt(g, 1, s, 0);
      faceAt(g, 2, s, 1);
      run(g, DOUSE_MS, () => ({ ...idle, b: true }));
    }
    expect(g.stations.some((s) => s.fire !== undefined && s.kind !== 'pot')).toBe(false);
    const first = g.stations.find((s) => s.kind === 'pot' && s.fire !== undefined);
    if (first) {
      faceAt(g, 1, first, 0);
      faceAt(g, 2, first, 1);
      run(g, DOUSE_MS, () => ({ ...idle, b: true }));
    }
    expect(log['fire:end']).toHaveLength(1);
    expect(g.burn!.fires[0]).not.toBeNull(); // ... and the waiting oven caught fire right then
    expect(log['fire:start']).toHaveLength(2);
    expect(waiting.fire).toBeDefined();
  });
});

describe('putting it out: hold Picar (B) in front of the fire, DOUSE_MS in total', () => {
  function fireAt(o: { n?: number } = {}) {
    const m = mk({ map: '11', n: o.n ?? 1 });
    const oven = ovens(m.g)[0]!;
    bake(m.g, oven);
    run(m.g, GRACE_MS.normal + FIRE_DELAY_MS + 100);
    expect(oven.fire).toBeDefined();
    return { ...m, oven };
  }
  it('one chef: 3 s of B puts the oven out; the events are douseStart, fire:out, douseStop, fire:end', () => {
    const { g, log, oven } = fireAt();
    face(g, 1, oven);
    const t0 = g.time;
    run(g, DOUSE_MS - 100, () => ({ ...idle, b: true }));
    expect(oven.fire).toBeDefined();
    expect(log['fire:out']).toBeUndefined();
    run(g, 250, () => ({ ...idle, b: true }));
    expect(oven.fire).toBeUndefined();
    expect(log['fire:out']![0]!.p).toMatchObject({ player: 1, station: at(g, oven) });
    near(log['fire:out']![0]!.t - t0, DOUSE_MS);
    expect(log.douseStart).toHaveLength(1);
    run(g, 100, () => idle);
    expect(log.douseStop).toHaveLength(1);
    expect(log.chopStart).toBeUndefined(); // it is not chopping: the sound layer hears the extinguisher, not the knife
    expect(ovenStage(oven)).toBe('idle');
  });
  it('without B nothing happens; with B but facing something else the fire does not move', () => {
    const { g, oven } = fireAt();
    face(g, 1, oven);
    run(g, 6000, () => idle);
    expect(oven.fire).toBe(0);
    const other = g.stations.find((s) => s.kind === 'counter' && s.fire === undefined)!;
    face(g, 1, other);
    run(g, 6000, () => ({ ...idle, b: true }));
    expect(oven.fire).toBe(0);
  });
  it('two chefs add up: 1.5 s each', () => {
    const { g, log, oven } = fireAt({ n: 2 });
    faceAt(g, 1, oven, 0);
    faceAt(g, 2, oven, 1);
    run(g, DOUSE_MS / 2 + 120, () => ({ ...idle, b: true }));
    expect(oven.fire).toBeUndefined();
    expect(log['fire:out']).toHaveLength(1);
  });
  it('the oven works again afterwards: it takes ingredients and cooks', () => {
    const { g, oven } = fireAt();
    face(g, 1, oven);
    run(g, DOUSE_MS + 120, () => ({ ...idle, b: true }));
    const p = g.players.get(1)!;
    p.item = 'cut0';
    pressA(g, 1);
    expect(oven.inputs).toEqual([0]);
  });
  it('a counter on fire is put out the same way and then holds items again', () => {
    const { g } = fireAt();
    run(g, FIRE_SPREAD_MS);
    const c = g.stations.find((s) => s.kind === 'counter' && s.fire !== undefined)!;
    face(g, 1, c);
    run(g, DOUSE_MS + 120, () => ({ ...idle, b: true }));
    expect(c.fire).toBeUndefined();
    const p = g.players.get(1)!;
    p.item = 'raw1';
    pressA(g, 1);
    expect(c.item).toBe('raw1');
  });
  it('a chef that drops while it is putting out the fire stops the extinguisher', () => {
    const { g, log, oven } = fireAt({ n: 2 });
    face(g, 1, oven);
    run(g, 500, (id) => (id === 1 ? { ...idle, b: true } : idle));
    expect(log.douseStart).toHaveLength(1);
    dropPlayer(g, 1);
    expect(log.douseStop).toHaveLength(1);
  });
  it('a ghost counter is not a place to leave items: what a dropped chef carried does not go to a burning counter', () => {
    const { g } = fireAt({ n: 2 });
    run(g, FIRE_SPREAD_MS);
    const burningCounters = g.stations.filter((s) => s.kind === 'counter' && s.fire !== undefined);
    expect(burningCounters.length).toBeGreaterThan(0);
    const p = g.players.get(2)!;
    p.item = 'raw0';
    const c = burningCounters[0]!;
    Object.assign(p, { x: c.tx + 0.5, y: c.ty + 1.5 });
    dropPlayer(g, 2);
    expect(burningCounters.every((s) => s.item === null)).toBe(true);
  });
});

describe('the lobby turns the rules on', () => {
  const versus = modeOf(GAMES[0], 'versus');
  const teams = syncTeams(versus, null, [1, 2, 3, 4], 4, false)!;
  const round = (difficulty: Difficulty, modeOptions: Record<string, boolean | string>) =>
    startVersusRound({ teams, choice: 'V1', difficulty, seed: 4, modeOptions, slotOf: (id) => id - 1, rand: mulberry32(1) }).game;
  it('a versus round from the lobby has the burning oven; the fire follows the difficulty and the sabotage level (Easy no, Suave no, Caos yes)', () => {
    expect(round('normal', { sabotage: 'soft' }).burn).toMatchObject({ fire: false, graceMs: 8000 });
    expect(round('easy', { sabotage: 'chaos' }).burn).toMatchObject({ fire: false, graceMs: 15_000 });
    expect(round('hard', { sabotage: 'chaos' }).burn).toMatchObject({ fire: true, graceMs: 8000 });
    expect(round('normal', { sabotage: 'off' }).burn!.fire).toBe(true);
    expect(round('normal', { sabotage: 'off' }).burn!.fires).toHaveLength(2); // one slot per kitchen: at most one fire each
  });
});
