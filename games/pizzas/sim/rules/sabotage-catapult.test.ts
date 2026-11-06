import { describe, expect, it } from 'vitest';
import { isFloor } from '../maps';
import { TICK_MS, tick, type Game, type Player } from '../overcooked';
import { addFloorItem } from './floor';
import { SLIP, AIM_MAX_MS, LAND_AFTER_MS, RETICLE_STEP_MS } from '../sabotage-config';
import { adjustLanding, catapultState, kitchenTiles, reticleAt, sweepOrder } from './sabotage';
import { idle, mk, run, face, station, pressA, pressB, load, flights } from './sabotage.kit';

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
