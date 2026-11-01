// Sabotage S2: the rules of the bags, the catapult, the reticle, the landing, the limits and the cleaning, on the real versus maps V1 and V3.
// Pure logic: chefs are put next to the stations by hand and the ticks are run directly.
import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from '../round/events';
import { FIXED_MAPS, DIRS, isFloor, parseMap } from '../maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Item, type Player, type Station } from '../overcooked';
import { addFloorItem, pilesIn } from './floor';
import { RULES, SLIP, AIM_MAX_MS, LAND_AFTER_MS, RETICLE_STEP_MS, DESECHOS_DRIP_MS, type SabotageMode } from '../sabotage-config';
import { adjustLanding, catapultState, kitchenTiles, landingTiles, reticleAt, sabotageHint, sweepOrder } from './sabotage';
import { floorItemNear, targetStation } from '../overcooked';
import { LABEL_MAX } from '@pichi/core/contract';
import { versusMap } from '../versus/maps';
import type { Difficulty } from '@pichi/core/difficulty';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };

function mk(o: { map?: string; mode?: SabotageMode; difficulty?: Difficulty; teams?: number[][]; handicap?: boolean; seed?: number } = {}) {
  const m = versusMap(o.map ?? 'V1')!;
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const teams = o.teams ?? [
    [1, 2],
    [3, 4],
  ];
  const g = createGame({
    mapId: m.id,
    rows: m.rows,
    spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]],
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    teams: teams.map((playerIds) => ({ playerIds })),
    handicap: o.handicap,
    sabotage: o.mode ?? 'soft',
    sigma: m.versus.sigma,
  });
  for (const k of [
    'sabotage:bagReady',
    'sabotage:aim',
    'sabotage:launch',
    'sabotage:land',
    'sabotage:caught',
    'sabotage:burst',
    'sabotage:blocked',
    'chef:slip',
    'chef:recover',
    'trash:picked',
    'trash:binned',
    'trash:decayed',
    'itemPicked',
    'interactInvalid',
  ] as const) {
    bus.on(k, ((p: never) => {
      ((log[k] ??= []) as { t: number; p: unknown }[]).push({ t: g.time, p });
    }) as never);
  }
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  return { g, log, m };
}
const run = (g: Game, ms: number, c?: (id: number) => Controls) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS)
    tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c ? c(id) : idle])));
};
const only = (id: number, c: Controls) => new Map([[id, c]]);
const A: Controls = { ...idle, a: 1 };
/** Puts the chef on a floor tile next to the station, facing it. */
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
const station = (g: Game, kind: string, team: number) => g.stations.find((s) => s.kind === kind && s.owner === team)!;
const pressA = (g: Game, id: number) => tick(g, only(id, A));
const pressB = (g: Game, id: number) => {
  tick(g, only(id, { ...idle, b: true }));
  tick(g, only(id, idle));
};
/** Chef `id` carries a bag to its catapult and loads it (A). */
function load(g: Game, id: number) {
  const p = g.players.get(id)!;
  p.item = 'trashBag';
  face(g, id, station(g, 'catapult', p.team));
  pressA(g, id);
  return p;
}
const flights = (g: Game, team: number) => g.sab!.teams[team]!.flights;
/** Throws the bag that is loaded (B), waits for it to land. */
function throwAndLand(g: Game, id: number) {
  pressB(g, id);
  run(g, LAND_AFTER_MS + 40);
}
const hashOf = (g: Game) =>
  JSON.stringify([
    [...g.players.values()].map((p) => [p.x, p.y, p.item, p.slip, p.immuneUntil, p.inTrash]),
    g.floor,
    g.sab,
    g.time,
    g.teams.map((t) => [t.score, t.orders.map((o) => o.recipe)]),
  ]);

describe('the catapult letter and the maps', () => {
  it('Y is a versus-only letter: a coop map refuses it, a versus game accepts it, and no coop map has one', () => {
    const rows = versusMap('V1')!.rows;
    expect(() => parseMap(rows)).toThrow(/unknown tile 'Y' at \(5, 8\): only a versus map has it/);
    expect(parseMap(rows, true)[8]![5]).toMatchObject({ kind: 'station', station: 'catapult' });
    expect(() => createGame({ rows, n: 2 })).toThrow(/only a versus map has it/);
    for (const m of FIXED_MAPS) expect(m.rows.join('')).not.toContain('Y');
  });
  it('V1-V5 carry one catapult per kitchen, twins by sigma, and every kitchen has landing tiles to spare', () => {
    for (const id of ['V1', 'V2', 'V3', 'V4', 'V5']) {
      const { g } = mk({
        map: id,
        teams: [
          [1, 2],
          [3, 4],
        ],
      });
      const ys = g.stations.filter((s) => s.kind === 'catapult');
      expect(ys.map((s) => s.owner).sort(), id).toEqual([0, 1]);
      expect(g.sab, id).not.toBeNull();
      expect(landingTiles(g, 0).length, id).toBeGreaterThanOrEqual(6);
      expect(landingTiles(g, 1).length, id).toBeGreaterThanOrEqual(6);
    }
  });
  it('a map with no catapult switches the sabotage off by itself (and hazards stay off)', () => {
    const g = createGame({
      rows: versusMap('11-vs')!.rows,
      spawns: [...versusMap('11-vs')!.versus.spawns[0], ...versusMap('11-vs')!.versus.spawns[1]],
      teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }],
      sabotage: 'chaos',
      sigma: versusMap('11-vs')!.versus.sigma,
    });
    expect(g.sab).toBeNull();
    expect(g.hazards).toBe(false);
  });
  it('mode off, or no sigma, or coop: no sabotage state at all', () => {
    expect(mk({ mode: 'off' }).g.sab).toBeNull();
    expect(mk({ mode: 'off' }).g.hazards).toBe(false);
    expect(createGame({ n: 2 }).sab).toBeNull();
  });
  it('the modes set the sim: Suave on Fácil only slips, Normal drops the item, Caos spoils raw ingredients', () => {
    const e = mk({ mode: 'soft', difficulty: 'easy' }).g,
      n = mk({ mode: 'soft', difficulty: 'normal' }).g,
      c = mk({ mode: 'chaos', difficulty: 'easy' }).g;
    expect([e.slipDrops, e.spoilRaw]).toEqual([false, false]);
    expect([n.slipDrops, n.spoilRaw]).toEqual([true, false]);
    expect([c.slipDrops, c.spoilRaw]).toEqual([true, true]);
    expect(e.hazards).toBe(true);
  });
});

describe('desechos and bags: what fills the bin', () => {
  const bin = (g: Game, id: number, item: Item) => {
    const p = face(g, id, station(g, 'trash', g.players.get(id)!.team));
    p.item = item;
    pressA(g, id);
  };
  it('an item binned is +1, a baked pizza +2, rubbish +1, a caught bag +3; three make a bag', () => {
    const { g, log } = mk({ mode: 'chaos' });
    const st = g.sab!.teams[0]!;
    bin(g, 1, 'raw0');
    expect(st.desechos).toBe(1);
    bin(g, 1, 'dish');
    expect(st.bags).toBe(1);
    expect(st.desechos).toBe(0); // 1 + 2
    bin(g, 1, 'trash');
    expect(st.desechos).toBe(1);
    bin(g, 1, 'trashBag');
    expect(st.bags).toBe(2);
    expect(st.desechos).toBe(1); // 1 + 3 = 4: one more bag (stock 2) and 1 left over
    expect(log['sabotage:bagReady']!.map((e) => [e.p.team, e.p.bags])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(log['trash:binned']!.map((e) => [e.p.gained, e.p.item])).toEqual([
      [1, 'raw0'],
      [2, 'dish'],
      [1, 'trash'],
      [3, 'trashBag'],
    ]);
    expect(g.sab!.teams[1]!.desechos).toBe(0); // the other team's counter is its own
  });
  it('the base trickle gives +1 every 15 s: a bag every 45 s with nobody doing anything', () => {
    const { g, log } = mk();
    run(g, DESECHOS_DRIP_MS * 3 - 100);
    expect(g.sab!.teams[0]!.bags).toBe(0);
    run(g, 200);
    expect(g.sab!.teams.map((t) => t.bags)).toEqual([1, 1]);
    expect(log['sabotage:bagReady']).toHaveLength(2);
  });
  it('a team two orders behind gets the trickle 1.5 times faster', () => {
    const { g } = mk();
    g.teams[1]!.delivered = 2;
    run(g, 15_000);
    run(g, 10_000 + 100); // team 0 (behind) scheduled its second drop 10 s later, team 1 15 s later
    expect(g.sab!.teams[0]!.desechos).toBeCloseTo(2, 5);
    expect(g.sab!.teams[1]!.desechos).toBeCloseTo(1, 5);
  });
  it('the stock is full (Suave: 1 bag): the counter stops adding', () => {
    const { g, log } = mk({ mode: 'soft' });
    const st = g.sab!.teams[0]!;
    bin(g, 1, 'dish');
    bin(g, 1, 'raw0');
    expect(st.bags).toBe(1);
    bin(g, 1, 'dish');
    bin(g, 1, 'dish');
    bin(g, 1, 'dish');
    expect(st.bags).toBe(1);
    expect(st.desechos).toBe(0); // it stayed where it was: nothing was added while the stock is full
    expect(log['trash:binned']!.slice(2).map((e) => e.p.gained)).toEqual([0, 0, 0]);
  });
  it('A with empty hands at the bin takes the bag (once); with no bag waiting nothing happens', () => {
    const { g, log } = mk();
    const p = face(g, 1, station(g, 'trash', 0));
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(log['interactInvalid']).toHaveLength(1);
    g.sab!.teams[0]!.bags = 1;
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(g.sab!.teams[0]!.bags).toBe(0);
    pressA(g, 1); // with the bag in hand at the bin: it is binned for 3
    expect([p.item, g.sab!.teams[0]!.bags]).toEqual([null, 1]);
  });
  it('with the sabotage off nothing counts and the bin is the bin it always was', () => {
    const { g, log } = mk({ mode: 'off' });
    const p = face(g, 1, station(g, 'trash', 0));
    p.item = 'dish';
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(g.sab).toBeNull();
    expect(log['trash:binned']).toBeUndefined();
  });
});

describe('the catapult: load, aim, throw', () => {
  it('A with a bag loads it: the chef is anchored and the reticle starts on the rival kitchen', () => {
    const { g, log } = mk();
    const p = load(g, 1);
    expect(p.item).toBeNull();
    expect(g.sab!.teams[0]!.aim).toMatchObject({ player: 1 });
    expect(log['sabotage:aim']).toHaveLength(1);
    const [x0, y0] = [p.x, p.y];
    run(g, 600, (id) => (id === 1 ? { x: 1, y: -1, a: 0, b: false } : idle)); // pushing the stick does not move it
    expect([p.x, p.y]).toEqual([x0, y0]);
    // the reticle only visits the rival (right) kitchen
    for (const e of log['sabotage:aim']!) expect(e.p.at[0]).toBeGreaterThan(8);
    expect(log['sabotage:aim']!.length).toBeGreaterThanOrEqual(3); // one per step
  });
  it('the reticle is a pure function of the time: one tile per 250 ms, back and forth over every tile of the kitchen', () => {
    const { g } = mk();
    const sweep = sweepOrder(g, 1);
    expect(sweep).toHaveLength(kitchenTiles(g, 1).length);
    expect(new Set(sweep.map((p) => p.join())).size).toBe(sweep.length);
    expect(reticleAt(g, 1, 0)).toEqual(sweep[0]);
    expect(reticleAt(g, 1, RETICLE_STEP_MS - 1)).toEqual(sweep[0]);
    expect(reticleAt(g, 1, RETICLE_STEP_MS)).toEqual(sweep[1]);
    const n = sweep.length;
    expect(reticleAt(g, 1, (n - 1) * RETICLE_STEP_MS)).toEqual(sweep[n - 1]);
    expect(reticleAt(g, 1, n * RETICLE_STEP_MS)).toEqual(sweep[n - 2]); // it comes back
    expect(reticleAt(g, 1, (2 * n - 2) * RETICLE_STEP_MS)).toEqual(sweep[0]);
    expect(reticleAt(g, 1, 1234)).toEqual(reticleAt(g, 1, 1234)); // same time, same tile
  });
  it('B throws: 700 ms later the bag lands on the tile under the reticle as rubbish of the rival kitchen', () => {
    const { g, log } = mk();
    const p = load(g, 1);
    run(g, 1000);
    const want = reticleAt(g, 1, g.time - g.sab!.teams[0]!.aim!.t0 + TICK_MS);
    pressB(g, 1);
    expect(g.sab!.teams[0]!.aim).toBeNull(); // the chef is free again
    expect(log['sabotage:launch']).toHaveLength(1);
    const to = log['sabotage:launch']![0]!.p.landAt;
    expect(Math.abs(to[0] - want[0]) + Math.abs(to[1] - want[1])).toBeLessThanOrEqual(2);
    expect(g.floor).toHaveLength(0); // still in the air
    expect(flights(g, 0)).toHaveLength(1);
    run(g, LAND_AFTER_MS - 3 * TICK_MS);
    expect(g.floor).toHaveLength(0);
    run(g, 6 * TICK_MS);
    expect(g.floor).toHaveLength(1);
    expect(g.floor[0]).toMatchObject({ kind: 'trash', item: 'trash', team: 1, by: 0, tx: to[0], ty: to[1] });
    expect(log['sabotage:land']).toHaveLength(1);
    expect(log['sabotage:land']![0]!.t - log['sabotage:launch']![0]!.t).toBeGreaterThanOrEqual(LAND_AFTER_MS - TICK_MS);
    expect(p.item).toBeNull();
  });
  it('no B in 3 s: it fires by itself', () => {
    const { g, log } = mk();
    load(g, 1);
    run(g, AIM_MAX_MS - 100);
    expect(log['sabotage:launch']).toBeUndefined();
    run(g, 200);
    expect(log['sabotage:launch']).toHaveLength(1);
    expect(g.sab!.teams[0]!.aim).toBeNull();
  });
  it('wherever the reticle is, the bag lands in the RIVAL kitchen, on a floor tile that is not a spawn or rubbish already', () => {
    const { g } = mk();
    const k1 = new Set(kitchenTiles(g, 1).map((p) => p.join()));
    const k0 = new Set(kitchenTiles(g, 0).map((p) => p.join()));
    const n = sweepOrder(g, 1).length;
    let spawnTargets = 0;
    for (let i = 0; i < 2 * n; i++) {
      const to = adjustLanding(g, 1, reticleAt(g, 1, i * RETICLE_STEP_MS));
      expect(to, `step ${i}`).not.toBeNull();
      expect(k1.has(to!.join()), `step ${i} in the rival kitchen`).toBe(true);
      expect(k0.has(to!.join())).toBe(false);
      expect(g.grid[to![1]]![to![0]]).toMatchObject({ kind: 'floor', spawn: false });
      if ((g.grid[reticleAt(g, 1, i * RETICLE_STEP_MS)[1]]![reticleAt(g, 1, i * RETICLE_STEP_MS)[0]] as { spawn: boolean }).spawn)
        spawnTargets++;
    }
    expect(spawnTargets).toBeGreaterThan(0); // the sweep does cross spawn tiles and they were moved
  });
  it("the gate of the kitchen: a tile of the thrower's own kitchen (or a wall) is never a landing, whatever the aim says", () => {
    const { g } = mk();
    expect(adjustLanding(g, 1, [3, 3])).toBeNull(); // (3, 3) is on the left, the kitchen of team 0: the bag cannot be sent there
    expect(adjustLanding(g, 0, [12, 2])).toBeNull();
    expect(adjustLanding(g, 1, [0, 0])).toBeNull(); // a wall
    expect(adjustLanding(g, 1, [12, 2])).toEqual([12, 2]); // and a free floor tile in the right kitchen is fine
  });
  it('a target that is not valid moves to the nearest valid tile; with rubbish already there, to a neighbour', () => {
    const { g } = mk();
    const spawn = g.spawns.find(([x]) => x > 8)!;
    const near = adjustLanding(g, 1, spawn as [number, number])!;
    expect(Math.abs(near[0] - spawn[0]) + Math.abs(near[1] - spawn[1])).toBe(1);
    addFloorItem(g, { tx: 12, ty: 3, item: 'trash', kind: 'trash', team: 1 });
    const moved = adjustLanding(g, 1, [12, 3])!;
    expect(Math.abs(moved[0] - 12) + Math.abs(moved[1] - 3)).toBe(1);
  });
  it('nothing valid within 2 steps: the bag bursts (no rubbish, a "burst" event) and the cooldown runs anyway', () => {
    const { g, log } = mk();
    g.sab!.rules = { ...g.sab!.rules, maxPiles: 99 }; // (the limit would refuse the bag before it burst: lift it for this test)
    for (const [x, y] of kitchenTiles(g, 1)) addFloorItem(g, { tx: x, ty: y, item: 'trash', kind: 'trash', team: 1 });
    load(g, 1);
    pressB(g, 1);
    expect(log['sabotage:burst']).toHaveLength(1);
    expect(log['sabotage:launch']).toBeUndefined();
    expect(flights(g, 0)).toHaveLength(0);
    expect(catapultState(g, 0)).toBe('cooldown');
  });
  it('an empty-handed rival chef within 0.45 tile of the landing catches the bag: no rubbish, it holds the bag', () => {
    const { g, log } = mk();
    load(g, 1);
    run(g, 500);
    pressB(g, 1);
    const to = flights(g, 0)[0]!.to;
    const c = g.players.get(3)!;
    Object.assign(c, { x: to[0] + 0.5 + 0.4, y: to[1] + 0.5, vx: 0, vy: 0 }); // 0.4 tile away (a floor tile: not necessarily, but close enough)
    run(g, LAND_AFTER_MS + 40);
    expect(log['sabotage:caught']).toHaveLength(1);
    expect(log['sabotage:caught']![0]!.p).toMatchObject({ chef: 3, team: 0, target: 1 });
    expect(c.item).toBe('trashBag');
    expect(g.floor).toHaveLength(0);
    expect(log['sabotage:land']).toBeUndefined();
  });
  it("...but not with a full hand, not from farther than 0.6, and not a chef of the thrower's own team", () => {
    const attempt = (setup: (c: Player, to: [number, number], g: Game) => void) => {
      const { g, log } = mk();
      load(g, 1);
      run(g, 500);
      pressB(g, 1);
      const to = flights(g, 0)[0]!.to;
      setup(g.players.get(3)!, to, g);
      run(g, LAND_AFTER_MS + 40);
      return { caught: log['sabotage:caught']?.length ?? 0, floor: g.floor.length };
    };
    expect(
      attempt((c, to) => {
        Object.assign(c, { x: to[0] + 0.55, y: to[1] + 0.5 });
        c.item = 'raw0';
      }),
    ).toEqual({ caught: 0, floor: 1 });
    expect(
      attempt((c, to) => {
        Object.assign(c, { x: to[0] + 0.5 + 0.7, y: to[1] + 0.5 });
      }),
    ).toMatchObject({ caught: 0 });
    expect(
      attempt((_c, to, g) => {
        Object.assign(g.players.get(2)!, { x: to[0] + 0.5, y: to[1] + 0.5 });
      }),
    ).toMatchObject({ caught: 0 }); // chef 2 is in the other kitchen's reach? it is on the thrower's team
  });
});

describe('limits: cooldown, per minute, piles', () => {
  const nextBag = (g: Game, team: number, n = 1) => {
    g.sab!.teams[team]!.bags = n;
  };
  it('Suave: 12 s between two throws of a team; the catapult refuses the bag meanwhile (the chef keeps it)', () => {
    const { g, log } = mk({ mode: 'soft' });
    load(g, 1);
    pressB(g, 1);
    expect(catapultState(g, 0)).toBe('cooldown');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(log['sabotage:blocked']!.map((e) => e.p.why)).toEqual(['cooldown']);
    run(g, RULES.soft.cooldownMs - 400); // 12 s after the throw
    pressA(g, 1);
    expect(log['sabotage:blocked']).toHaveLength(2);
    run(g, 600);
    pressA(g, 1);
    expect(p.item).toBeNull();
    expect(g.sab!.teams[0]!.aim).not.toBeNull();
  });
  it('Caos: 6 s between throws', () => {
    const { g } = mk({ mode: 'chaos' });
    load(g, 1);
    pressB(g, 1);
    run(g, 5000);
    expect(catapultState(g, 0)).toBe('cooldown');
    run(g, 1100);
    expect(['ready', 'piles']).toContain(catapultState(g, 0));
  });
  it('Suave: 4 throws per sliding minute, then "window" until the first one is a minute old', () => {
    const { g, log } = mk({ mode: 'soft' });
    for (let i = 0; i < 4; i++) {
      load(g, 1);
      pressB(g, 1);
      run(g, RULES.soft.cooldownMs + 100);
      g.floor.length = 0;
    } // rubbish removed: this test is about the window
    expect(g.time).toBeGreaterThan(36_000);
    expect(catapultState(g, 0)).toBe('window');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(log['sabotage:blocked']!.at(-1)!.p.why).toBe('window');
    run(g, 60_000 - g.time + 600);
    expect(catapultState(g, 0)).toBe('ready');
  });
  it('Caos: 6 throws per minute', () => {
    const { g } = mk({ mode: 'chaos' });
    for (let i = 0; i < 6; i++) {
      load(g, 1);
      pressB(g, 1);
      run(g, RULES.chaos.cooldownMs + 100);
      g.floor.length = 0;
    }
    expect(g.time).toBeLessThan(60_000);
    expect(catapultState(g, 0)).toBe('window');
  });
  it('maximum piles on the rival floor (Suave 3, Caos 4), counting bags in the air: the catapult goes red and keeps the bag', () => {
    const { g, log } = mk({ mode: 'soft' });
    const tiles = landingTiles(g, 1);
    for (const i of [0, 3]) addFloorItem(g, { tx: tiles[i]![0], ty: tiles[i]![1], item: 'trash', kind: 'trash', team: 1 });
    expect(catapultState(g, 0)).toBe('ready');
    addFloorItem(g, { tx: tiles[5]![0], ty: tiles[5]![1], item: 'trash', kind: 'trash', team: 1 });
    expect(catapultState(g, 0)).toBe('piles');
    const p = g.players.get(1)!;
    p.item = 'trashBag';
    face(g, 1, station(g, 'catapult', 0));
    pressA(g, 1);
    expect(p.item).toBe('trashBag');
    expect(log['sabotage:blocked']!.map((e) => e.p.why)).toEqual(['piles']);
    // a bag in the air counts as a pile too
    const { g: h } = mk({ mode: 'soft' });
    for (const i of [0, 3]) addFloorItem(h, { tx: tiles[i]![0], ty: tiles[i]![1], item: 'trash', kind: 'trash', team: 1 });
    load(h, 1);
    pressB(h, 1);
    expect(flights(h, 0)).toHaveLength(1);
    expect(pilesIn(h, 1)).toBe(2);
    run(h, RULES.soft.cooldownMs + 100);
    expect(catapultState(h, 0)).toBe('piles'); // 2 down + 1 landed
  });
  it('Caos: the bag leaves a double pile (the target and a neighbour), never above the maximum of 4', () => {
    const { g, log } = mk({ mode: 'chaos' });
    load(g, 1);
    pressB(g, 1);
    run(g, LAND_AFTER_MS + 40);
    expect(g.floor).toHaveLength(2);
    expect(log['sabotage:land']![0]!.p.double).toBe(true);
    const [a, b] = g.floor;
    expect(Math.abs(a!.tx - b!.tx) + Math.abs(a!.ty - b!.ty)).toBe(1);
    run(g, RULES.chaos.cooldownMs);
    load(g, 1);
    pressB(g, 1);
    run(g, LAND_AFTER_MS + 40);
    expect(pilesIn(g, 1)).toBeLessThanOrEqual(4);
  });
  it('Suave: single piles that last 25 s; Caos 40 s; on the kitchen of a team with k > 1 they last 0.85 times that', () => {
    const t = (mode: SabotageMode, o: { teams?: number[][] } = {}) => {
      const { g, log } = mk({ mode, ...o });
      load(g, 1);
      pressB(g, 1);
      run(g, LAND_AFTER_MS + 40);
      const born = g.floor[0]!.bornAt;
      return { life: g.floor[0]!.expiresAt - born, g, log };
    };
    expect(t('soft').life).toBe(25_000);
    expect(t('chaos').life).toBe(40_000);
    const small = t('soft', {
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    }); // team 1 is the small one: k = 1.22
    expect(small.g.teams[1]!.k).toBeGreaterThan(1);
    expect(small.life).toBeCloseTo(25_000 * 0.85, 3);
    run(small.g, 21_300);
    expect(small.g.floor).toHaveLength(0);
    expect(small.log['trash:decayed']).toHaveLength(1);
  });
  it('3 v 2: the big team waits k times as long between throws', () => {
    const { g } = mk({
      mode: 'soft',
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    });
    const k = g.teams[1]!.k;
    expect(g.teams[0]!.k).toBe(1);
    load(g, 1);
    pressB(g, 1);
    run(g, RULES.soft.cooldownMs * k - 500);
    expect(catapultState(g, 0)).toBe('cooldown');
    run(g, 700);
    expect(catapultState(g, 0)).not.toBe('cooldown');
    const { g: h } = mk({
      mode: 'soft',
      teams: [
        [1, 2, 5],
        [3, 4],
      ],
    }); // the small team waits the base 12 s
    load(h, 3);
    pressB(h, 3);
    run(h, RULES.soft.cooldownMs + 100);
    expect(catapultState(h, 1)).not.toBe('cooldown');
  });
  it('a chef that drops while it aims gives the bag back to the stock', () => {
    const { g } = mk();
    load(g, 1);
    expect(g.sab!.teams[0]!.bags).toBe(0);
    // dropPlayer lives in the sim
    return import('../overcooked').then(({ dropPlayer }) => {
      dropPlayer(g, 1);
      expect(g.sab!.teams[0]!.aim).toBeNull();
      expect(g.sab!.teams[0]!.bags).toBe(1);
    });
  });
});

describe('the whole duel: throw, slip, clean, throw back', () => {
  it('a rival who steps on the rubbish slips and drops its pizza; its team cleans the rubbish and the bin feeds ITS catapult', () => {
    const { g, log } = mk({ mode: 'soft', difficulty: 'normal' });
    load(g, 1);
    pressB(g, 1);
    run(g, LAND_AFTER_MS + 40);
    const trash = g.floor[0]!;
    // chef 3 (rival) walks over it carrying a pizza
    const c = g.players.get(3)!;
    c.item = 'dishQ';
    const from = [trash.tx + 0.5 - 1.6, trash.ty + 0.5] as const;
    Object.assign(c, { x: from[0], y: from[1], fx: 1, fy: 0 });
    if (!isFloor(g.grid, Math.floor(from[0]), Math.floor(from[1])))
      Object.assign(c, { x: trash.tx + 0.5 + 1.6, y: trash.ty + 0.5, fx: -1 });
    const dir = c.fx > 0 ? 1 : -1;
    for (let i = 0; i < 120 && !log['chef:slip']; i++) tick(g, new Map([[3, { x: dir, y: 0, a: 0, b: false }]]));
    expect(log['chef:slip']).toHaveLength(1);
    expect(log['chef:slip']![0]!.p).toMatchObject({ chef: 3, team: 1, dropped: 'dishQ' });
    expect(c.item).toBeNull();
    expect(g.floor.filter((f) => f.kind === 'dropped')).toHaveLength(1);
    run(g, SLIP.normal.slideMs + SLIP.normal.recoverMs);
    expect(log['chef:recover']).toHaveLength(1);
    // the rival team picks the pizza up (A) and the rubbish (A), and bins it
    const dropped = g.floor.find((f) => f.kind === 'dropped')!;
    const q = g.players.get(4)!;
    Object.assign(q, { x: dropped.tx + 0.5 - 0.5, y: dropped.ty + 0.5, fx: 1, fy: 0, vx: 0, vy: 0 });
    pressA(g, 4);
    expect(q.item).toBe('dishQ');
    q.item = null;
    const t2 = g.floor.find((f) => f.kind === 'trash');
    expect(t2).toBeTruthy();
    Object.assign(q, { x: t2!.tx + 0.5, y: t2!.ty + 0.5, fx: 1, fy: 0, immuneUntil: 1e9 });
    pressA(g, 4);
    expect(q.item).toBe('trash');
    expect(log['trash:picked']!.map((e) => e.p.kind)).toEqual(['dropped', 'trash']);
    const bin = face(g, 4, station(g, 'trash', 1));
    pressA(g, 4);
    expect(bin.item).toBeNull();
    expect(g.sab!.teams[1]!.desechos).toBe(1); // handed back to the rival as a desecho
    expect(g.sab!.teams[0]!.desechos).toBe(0);
  });
});

describe('determinism and the guarantee that off is off', () => {
  const script = (id: number, i: number): Controls => {
    const k = (i + id * 13) % 480;
    return k < 240 ? { x: 1, y: 0, a: i % 11 === 0 ? 1 : 0, b: i % 97 === 0 } : { x: -1, y: 0.3, a: i % 17 === 0 ? 1 : 0, b: false };
  };
  const play = (mode: SabotageMode) => {
    const { g } = mk({ mode, seed: 9 });
    g.sab?.teams.forEach((t) => {
      t.bags = 1;
    });
    for (let i = 0; i < 3000; i++) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, script(id, i)])));
    return g;
  };
  it('same seed, same inputs: the same state hash, twice (sabotage on)', () => {
    expect(hashOf(play('chaos'))).toBe(hashOf(play('chaos')));
  });
  it("the sabotage never touches the orders' random stream: queues are the same with it on, off and in chaos", () => {
    const q = (g: Game) => JSON.stringify(g.teams.map((t) => t.orders.map((o) => [o.recipe, o.expiresAt, o.id])));
    const nothing = (mode: SabotageMode) => {
      const { g } = mk({ mode, seed: 9 });
      run(g, 100_000);
      return q(g);
    };
    expect(nothing('soft')).toBe(nothing('off'));
    expect(nothing('chaos')).toBe(nothing('off'));
  });
});

describe('the labels of the two buttons (no third button)', () => {
  const hint = (g: Game, id: number) => {
    const p = g.players.get(id)!;
    return sabotageHint(g, p, targetStation(g, p), !!floorItemNear(g, p));
  };
  it('A and B are only renamed: Tomar bolsa at the bin with a bag waiting, Cargar at the catapult with the bag, ¡Lanzar! while aiming, Recoger next to rubbish', () => {
    const { g } = mk();
    expect(hint(g, 1)).toEqual({ a: null, b: null });
    face(g, 1, station(g, 'trash', 0));
    expect(hint(g, 1)).toEqual({ a: null, b: null }); // nothing waiting
    g.sab!.teams[0]!.bags = 1;
    expect(hint(g, 1)).toEqual({ a: 'Tomar bolsa', b: null });
    g.players.get(1)!.item = 'trashBag';
    expect(hint(g, 1)).toEqual({ a: 'Botar bolsa', b: null });
    face(g, 1, station(g, 'catapult', 0));
    expect(hint(g, 1)).toEqual({ a: 'Cargar', b: null });
    pressA(g, 1);
    expect(hint(g, 1)).toEqual({ a: null, b: '¡Lanzar!' });
    const q = g.players.get(2)!;
    Object.assign(q, { x: 4.5, y: 2.5, fx: 1, fy: 0 });
    addFloorItem(g, { tx: 5, ty: 2, item: 'trash', kind: 'trash', team: 0 });
    expect(hint(g, 2)).toEqual({ a: 'Recoger', b: null });
    for (const h of [{ a: 'Tomar bolsa' }, { a: 'Botar bolsa' }, { a: 'Cargar' }, { b: '¡Lanzar!' }, { a: 'Recoger' }])
      for (const v of Object.values(h)) expect(v.length).toBeLessThanOrEqual(LABEL_MAX);
  });
  it('with the sabotage off there is nothing to rename', () => {
    const { g } = mk({ mode: 'off' });
    expect(sabotageHint(g, g.players.get(1)!, null, true)).toEqual({ a: null, b: null });
  });
});
