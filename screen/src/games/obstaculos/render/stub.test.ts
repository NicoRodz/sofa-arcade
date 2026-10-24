import { describe, expect, it } from 'vitest';
import { PLAYER_H, ROPE_LEN, TILE, type ObstEvents } from '@party/shared/obstaculos';
import { Emitter } from '@party/shared/events';
import { LEVEL_01, LEVEL_04, LEVEL_08 } from '../../../../../shared/games/obstaculos/levels';
import { FakeWorld, botController, cordadas, entitiesFromLevel } from './stub';
import { checkWorldView, type WorldView } from './view';
import { parseLevelStrict } from '@party/shared/obstaculos';

const run = (w: FakeWorld, steps: number, every = 0) => { for (let i = 0; i < steps; i++) { w.step(); if (every && i % every === 0) expect(checkWorldView(w)).toEqual([]); } };

describe('cordadas (plan §4)', () => {
  it('one rope up to 4, then 3+2, 3+3, 4+3, 4+4', () => {
    expect(cordadas(2)).toEqual([[0, 1]]);
    expect(cordadas(4)).toEqual([[0, 1, 2, 3]]);
    expect(cordadas(5).map((g) => g.length)).toEqual([3, 2]);
    expect(cordadas(6).map((g) => g.length)).toEqual([3, 3]);
    expect(cordadas(7).map((g) => g.length)).toEqual([4, 3]);
    expect(cordadas(8).map((g) => g.length)).toEqual([4, 4]);
    expect(cordadas(8).flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('a level can force pairs', () => { expect(cordadas(6, 2).length).toBeGreaterThan(1); });
});

describe('entitiesFromLevel', () => {
  it('level 1: three stars, a checkpoint and the goal', () => {
    const e = entitiesFromLevel(parseLevelStrict(LEVEL_01));
    expect(e.filter((x) => x.kind === 'star')).toHaveLength(3);
    expect(e.filter((x) => x.kind === 'checkpoint')).toHaveLength(1);
    expect(e.filter((x) => x.kind === 'goal')).toHaveLength(1);
  });
  it('level 4: one ring entity per o marker (plan geometry: (14,9) and (44,7))', () => {
    expect(entitiesFromLevel(parseLevelStrict(LEVEL_04)).filter((x) => x.kind === 'ring').map((r) => [r.x / TILE, r.y / TILE])).toEqual([[44, 7], [14, 9]]);
  });
  it('level 8: plates carry their weight text, objects are as big as their cells, tags pair activators and objectives', () => {
    const e = entitiesFromLevel(parseLevelStrict(LEVEL_08));
    const a = e.find((x) => x.tag === 'a')!, b = e.find((x) => x.tag === 'b')!, A = e.find((x) => x.tag === 'A')!;
    expect(a.kind).toBe('plate'); expect(a.label).toBe('½↑');
    expect(b.label).toBe('½↓');
    expect(A.kind).toBe('gate'); expect(A.h).toBe(3 * TILE);
    expect(e.find((x) => x.tag === 'D')!.kind).toBe('balance');
    expect(e.find((x) => x.tag === 'F')!.kind).toBe('ladder');
    expect(e.find((x) => x.tag === 'c')!.label).toBe('1');
  });
});

describe('FakeWorld honours the WorldView contract', () => {
  it('passes checkWorldView on every level with 2 and 8 players for 10 s', () => {
    for (const def of [LEVEL_01, LEVEL_04, LEVEL_08]) for (const n of [2, 8]) {
      const w = new FakeWorld(def, n, def === LEVEL_08 ? 'free' : 'chain', 'normal');
      w.controller = botController();
      run(w, 600, 30);
    }
  });
  it('prevX/prevY are the position of the step before (the renderer interpolates with them)', () => {
    const w = new FakeWorld(LEVEL_01, 2, 'chain', 'normal');
    w.controller = botController();
    run(w, 90);
    const before = w.players.map((p) => [p.x, p.y]);
    w.step();
    w.players.forEach((p, i) => { expect(p.prevX).toBe(before[i]![0]); expect(p.prevY).toBe(before[i]![1]); });
  });
  it('is deterministic: two worlds with the same bots end in the same place', () => {
    const snap = (): number[] => { const w = new FakeWorld(LEVEL_01, 4, 'chain', 'normal'); w.controller = botController(); run(w, 1200); return w.players.flatMap((p) => [p.x, p.y]); };
    expect(snap()).toEqual(snap());
  });
  it('publishes jump, land, checkpoint and star events on the bus', () => {
    const bus = new Emitter<ObstEvents>();
    const seen = new Set<string>();
    for (const k of ['obst.jump', 'obst.land', 'obst.checkpoint', 'obst.star', 'obst.ropeTaut'] as const) bus.on(k, () => seen.add(k));
    const w = new FakeWorld(LEVEL_01, 4, 'chain', 'normal', bus);
    w.controller = botController();
    run(w, 60 * 14);
    expect([...seen].sort()).toEqual(['obst.checkpoint', 'obst.jump', 'obst.land', 'obst.ropeTaut', 'obst.star']);
  });
  it('rope tension is distance over ROPE_LEN and the valve switches the link off with a bubble', () => {
    const w = new FakeWorld(LEVEL_01, 2, 'chain', 'normal');
    const link = w.ropes[0]!.links[0]!;
    const a = w.centre(0), b = w.centre(1);
    expect(link.tension).toBeCloseTo(Math.hypot(a.x - b.x, a.y - b.y) / ROPE_LEN, 5);
    w.requestBubbles([1]);
    w.step();
    expect(w.players[1]!.bubble).not.toBeNull();
    expect(w.ropes[0]!.links[0]!.active).toBe(false);
  });
  it('the stub rope holds a pair together: one runs away, the other is dragged and the tension stays near 1', () => {
    const w = new FakeWorld(LEVEL_01, 2, 'chain', 'normal');
    w.controller = (i) => ({ move: i === 1 ? 1 : 0, down: false, jump: false });
    let maxT = 0;
    for (let i = 0; i < 100; i++) { w.step(); maxT = Math.max(maxT, w.ropes[0]!.links[0]!.tension); }
    expect(maxT).toBeLessThan(1.12);
    expect(w.players[0]!.x).toBeGreaterThan(3 * TILE + 100); // dragged along
  });
  it('a bubble flies to the others, pops after 0.4 s and leaves a second of invulnerability', () => {
    const w = new FakeWorld(LEVEL_01, 3, 'free', 'normal');
    w.teleport(2, 20, 11);
    w.requestBubbles([2]);
    let popped = false;
    for (let i = 0; i < 60 * 10 && !popped; i++) { w.step(); popped = w.players[2]!.bubble?.phase === 'pop'; }
    expect(popped).toBe(true);
    for (let i = 0; i < 40; i++) w.step();
    expect(w.players[2]!.bubble).toBeNull();
    expect(w.players[2]!.invulnSec).toBeGreaterThan(0.5);
  });
  it('spikes kill: death event, then respawn at the last checkpoint', () => {
    const bus = new Emitter<ObstEvents>();
    const events: string[] = [];
    bus.on('obst.death', (e) => events.push(`death:${e.cause}`)); bus.on('obst.respawn', (e) => events.push(`respawn:${e.via}`));
    const w = new FakeWorld(LEVEL_01, 2, 'free', 'normal', bus);
    w.teleport(0, 32, 11); // the spike pit of level 1 (cols 31-33, row 12 is spikes: the body stands above them)
    for (let i = 0; i < 200; i++) w.step();
    expect(events.slice(0, 2)).toEqual(['death:spikes', 'respawn:checkpoint']);
    expect(w.players[0]!.dead).toBe(false);
    void PLAYER_H;
  });
});

describe('checkWorldView catches broken adapters', () => {
  const fresh = (): FakeWorld => new FakeWorld(LEVEL_01, 3, 'chain', 'normal');
  const broken = (mut: (w: FakeWorld) => void): string[] => { const w = fresh(); mut(w); return checkWorldView(w as WorldView); };
  it('accepts a healthy world', () => { expect(checkWorldView(fresh())).toEqual([]); });
  it('NaN positions, bad alpha, bad slots, duplicate ids, unknown rope players and held-by ghosts', () => {
    expect(broken((w) => { w.players[0]!.x = NaN; }).join()).toMatch(/not finite/);
    expect(broken((w) => { w.alpha = 1.5; }).join()).toMatch(/alpha/);
    expect(broken((w) => { w.players[1]!.slot = 9; }).join()).toMatch(/slot/);
    expect(broken((w) => { w.players[1]!.id = 0; }).join()).toMatch(/duplicate player/);
    expect(broken((w) => { w.ropes[0]!.links[0]!.b = 42; }).join()).toMatch(/unknown player/);
    expect(broken((w) => { w.entities[0]!.holder = 77; }).join()).toMatch(/held by unknown/);
    expect(broken((w) => { w.players[0]!.carriedBy = 55; }).join()).toMatch(/carried by unknown/);
    expect(broken((w) => { w.entities.push({ ...w.entities[0]! }); }).join()).toMatch(/duplicate entity/);
  });
});
