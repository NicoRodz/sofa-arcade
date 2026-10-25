import { describe, expect, it } from 'vitest';
import { DT, LEVELS, ObstBot, ObstSession, TILE, snapshot, type LevelDef, type ObstEvent } from '../index';
import { Emitter } from '@pichi/core/events';
import type { ObstEvents } from '../index';
import { SimWorldView } from './render/adapter';
import { checkWorldView } from './render/view';
import { ObstRun } from './host';

const FRAME = 1000 / 60;
const def = (n: number): LevelDef => LEVELS[n - 1]!;
const mk = (levels: LevelDef[], n: number, mode: 'chain' | 'free' = 'free', difficulty: 'easy' | 'normal' | 'hard' = 'normal') =>
  new ObstSession({ mode, difficulty, level: 0, seed: 1, slots: Array.from({ length: n }, (_, i) => i), levels });
const play = (s: ObstSession, ms: number, each?: () => void) => {
  const out: ObstEvent[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    each?.();
    out.push(...s.advance(FRAME));
  }
  return out;
};
// scripted phones that wander, jump and grab at random (the same noise the world's own tests use)
function wander(s: ObstSession, seed = 5) {
  let r = seed;
  const rnd = () => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 2 ** 32;
  };
  const taps = Array.from({ length: 8 }, () => [0, 0]);
  const dir = Array<number>(8).fill(1);
  return () => {
    for (const p of s.world.players) {
      if (rnd() < 0.02) dir[p.slot] = [-1, 0, 1, 1, 1][Math.floor(rnd() * 5)]!;
      if (rnd() < 0.03) taps[p.slot]![0]!++;
      if (rnd() < 0.012) taps[p.slot]![1]!++;
      s.receive(p.slot, { x: dir[p.slot]!, y: rnd() < 0.05 ? 1 : 0, presses: [taps[p.slot]![0]!, taps[p.slot]![1]!] });
    }
  };
}

describe('SimWorldView: the real world seen as a WorldView', () => {
  it('passes checkWorldView every 15 frames on levels with rings, plates, balance, keys, hazards and movers, with 2 and 8 players, in both modes', () => {
    const picks: [number, number, 'chain' | 'free'][] = [
      [1, 2, 'chain'],
      [1, 8, 'chain'],
      [4, 6, 'chain'],
      [8, 8, 'free'],
      [8, 4, 'free'],
      [9, 4, 'free'],
      [14, 4, 'chain'],
      [11, 8, 'free'],
      [3, 8, 'chain'],
      [5, 2, 'free'],
      [12, 5, 'chain'],
    ];
    for (const [lv, n, mode] of picks) {
      const s = mk([def(lv)], n, mode);
      const feed = wander(s);
      const v = new SimWorldView(s);
      for (let t = 0; t < 600; t++) {
        feed();
        s.advance(FRAME);
        v.sync();
        if (t % 15 === 0) expect(checkWorldView(v), `level ${lv} n=${n} ${mode} frame ${t}`).toEqual([]);
      }
    }
  });
  it('one PlayerView per player of the world: id and slot are the slot (so the obst.* events, which carry slots, line up), name from the lobby', () => {
    const s = mk([def(1)], 3);
    const v = new SimWorldView(s, s.world, (slot) => ['Nico', 'Angi', 'Pablo'][slot]!);
    expect(v.players.map((p) => [p.id, p.slot, p.name])).toEqual([
      [0, 0, 'Nico'],
      [1, 1, 'Angi'],
      [2, 2, 'Pablo'],
    ]);
    expect(v.mode).toBe('free');
    expect(v.level).toBe(s.world.level);
    expect(v.grid).toBe(s.world.grid); // the live grid: doors and crumbling tiles are repainted by the renderer
  });
  it("prevX/prevY are where the body was before the latest step, and alpha is the session's leftover", () => {
    const s = mk([def(1)], 2);
    const v = new SimWorldView(s);
    play(s, 3300);
    const hold = () => s.receive(0, { x: 1, y: 0, presses: [0, 0] }); // the phone keeps sending: the stick of a quiet one decays after 300 ms
    play(s, 400, hold);
    const x0 = s.world.players[0]!.body.x;
    hold();
    s.advance(FRAME);
    v.sync();
    const p = v.players[0]!;
    expect(p.x).toBe(s.world.players[0]!.body.x);
    expect(p.prevX).toBeLessThanOrEqual(p.x);
    expect(p.prevX).toBeGreaterThanOrEqual(x0 - 8);
    expect(p.x - p.prevX).toBeGreaterThan(4); // one step of running is 5.5 px: prev is the position of the step before, not the current one
    expect(p.x - p.prevX).toBeLessThan(8); // ...and only one step back, not the whole frame history
    expect(v.alpha).toBe(s.alpha);
  });
  it('shows lives, stars, time and where in the expedition we are', () => {
    const s = mk([def(1), def(2), def(3)], 2, 'free', 'hard');
    const v = new SimWorldView(s);
    expect(v.hud).toMatchObject({ lives: 6, livesMax: 6, starsTaken: 0, levelIndex: 0, levelCount: 3 });
    const easy = new SimWorldView(mk([def(1)], 2, 'free', 'easy'));
    expect(easy.hud.lives).toBe(Infinity);
    play(s, 4500);
    v.sync();
    expect(v.hud.timeSec).toBeCloseTo(s.world.tick * DT, 6);
    expect(v.hud.timeSec).toBeGreaterThan(1);
  });
  it('stars, checkpoints and the goal light up when the world says so', () => {
    const s = mk([def(1)], 2);
    const v = new SimWorldView(s);
    play(s, 3100);
    const on = (id: string) => v.entities.find((e) => e.id === id)!.on;
    expect([on('star0'), on('cp0'), on('goal0')]).toEqual([false, false, false]);
    const star = s.world.level.markers.star[0]!,
      cp = s.world.level.markers.checkpoint[0]!;
    const b0 = s.world.players[0]!.body;
    b0.x = star.x * TILE + 7;
    b0.y = star.y * TILE;
    play(s, 100);
    v.sync();
    expect(on('star0')).toBe(true);
    b0.x = cp.x * TILE + 7;
    b0.y = cp.y * TILE;
    play(s, 100);
    v.sync();
    expect(on('cp0')).toBe(true);
    const g = s.world.level.markers.goal[0]!;
    for (const p of s.world.players) {
      p.body.x = g.x * TILE + 7;
      p.body.y = (g.y + 1) * TILE - 46;
    }
    play(s, 100);
    v.sync();
    expect(on('goal0')).toBe(true);
    expect(v.hud.starsTaken).toBe(1);
  });
  it('plates press, gates open and balances move: the entity follows the object of the world (level 8)', () => {
    const s = mk([def(8)], 8, 'free');
    const v = new SimWorldView(s);
    play(s, 3100);
    const plate = (tag: string) => v.entities.find((e) => e.tag === tag)!;
    expect(plate('a').on).toBe(false);
    const a = s.world.ent.activators.find((x) => x.letter === 'a')!;
    // four players on plate a: half-up of 8 is 4
    for (let i = 0; i < 4; i++) {
      const b = s.world.players[i]!.body;
      b.x = a.rect.x + 2 + i * 7;
      b.y = a.rect.y + a.rect.h - 46;
    }
    play(s, 500);
    v.sync();
    expect(plate('a').on).toBe(a.pressed);
    expect(plate('a').value).toBeGreaterThan(0);
    const bal = s.world.ent.objectives.find((o) => o.letter === 'D')!;
    bal.oy = 40;
    v.sync();
    expect(v.entities.find((e) => e.tag === 'D')!.y).toBe(bal.rect.y + 40);
  });
  it('crumbling planks get a shaking sprite while they fall and none while they are whole (level 2)', () => {
    const s = mk([def(2)], 2, 'free');
    const v = new SimWorldView(s);
    expect(v.entities.some((e) => e.kind === 'crumble')).toBe(false);
    const c = s.world.ent.crumbles[0]!;
    c.state = 1;
    c.t = 10;
    v.sync();
    const e = v.entities.find((x) => x.kind === 'crumble')!;
    expect(e).toBeDefined();
    expect(e.value).toBeGreaterThan(0);
    c.state = 0;
    v.sync();
    expect(v.entities.some((x) => x.kind === 'crumble')).toBe(false);
  });
  it('a hazard (level 14) is reported with its position', () => {
    const s = mk([def(14)], 3, 'chain');
    const v = new SimWorldView(s);
    expect(v.hazard).toMatchObject({ kind: 'risingLava', frozen: false });
    s.world.ent.hazard!.pos = 123;
    v.sync();
    expect(v.hazard!.pos).toBe(123);
  });
  it('a bubble is a fly phase that grows and a pop phase; a dead player is dead and not in a bubble; a dropped phone is shown as not connected', () => {
    const s = mk([def(1)], 3, 'free');
    const v = new SimWorldView(s);
    play(s, 3100);
    const w = s.world;
    const p1 = w.players[1]!,
      p2 = w.players[2]!,
      p0 = w.players[0]!;
    p1.mode = 'bubble';
    p1.bubble = { tx: 0, ty: 0, arrived: false };
    v.sync();
    expect(v.players[1]!.bubble).toMatchObject({ phase: 'fly', t: 0 });
    w.tick += 12; // 0.2 s of flight
    v.sync();
    const fly = v.players[1]!.bubble;
    expect(fly?.phase).toBe('fly');
    expect(fly!.t).toBeCloseTo(0.2, 6);
    p1.bubble = { tx: 0, ty: 0, arrived: true };
    p1.timer = 6;
    v.sync();
    expect(v.players[1]!.bubble).toMatchObject({ phase: 'pop' });
    expect(v.players[1]!.bubble!.t).toBeCloseTo(6 * DT, 6);
    p2.mode = 'dead';
    v.sync();
    expect(v.players[2]!.dead).toBe(true);
    expect(v.players[2]!.bubble).toBeNull();
    expect(checkWorldView(v)).toEqual([]);
    s.setConnected(0, false);
    v.sync();
    expect(v.players[0]!.connected).toBe(false);
    void p0;
  });
  it('what B would do shows above the head: plant when idle on the ground, nothing in the air, throw when carrying', () => {
    const s = mk([def(1)], 2, 'free');
    const v = new SimWorldView(s);
    play(s, 3300);
    s.world.players[1]!.body.x -= 600; // away from the other
    play(s, 300);
    v.sync();
    expect(v.players[0]!.hint).toBe('plant');
    s.world.players[0]!.body.grounded = false;
    s.world.players[0]!.body.vx = 0;
    v.sync();
    expect(v.players[0]!.hint).toBe('none');
  });
  it('ropes: one RopeView per cordada with the world tension, none in Libres', () => {
    const chain = mk([def(1)], 6, 'chain');
    const vc = new SimWorldView(chain);
    expect(vc.ropes.map((r) => r.links.length)).toEqual([2, 2]); // 3 + 3
    expect(vc.players.map((p) => p.cordada)).toEqual([0, 0, 0, 1, 1, 1]);
    play(chain, 3200);
    vc.sync();
    expect(vc.ropes[0]!.links[0]!.tension).toBeCloseTo(chain.world.ropes[0]!.links[0]!.tension, 9);
    expect(new SimWorldView(mk([def(1)], 4, 'free')).ropes).toEqual([]);
  });
});

// Campaign A5 (dynamics 4-9) in the view: the enemies have no static twin, the pickaxe follows its holder, the target carries its clock, the wind phase is reported.
describe('SimWorldView: campaign A5 entities', () => {
  const rows = Array.from({ length: 16 }, (_, y) => {
    const cs = ('#' + '.'.repeat(38) + '#').split('');
    if (y >= 14) cs.fill('#');
    if (y === 13) {
      cs[2] = 'S';
      cs[36] = 'G';
      cs[10] = 'p';
    }
    if (y === 6) {
      cs[20] = 'a';
      cs[21] = 'a';
    }
    if (y >= 10 && y <= 13) cs[30] = y === 13 ? 'I' : 'A';
    return cs.join('');
  });
  const level: LevelDef = {
    id: 'a5',
    name: 'a5',
    biome: 'glacier',
    players: { min: 2, max: 2 },
    tether: 'freeOnly',
    stars: 1,
    parSec: 60,
    rows,
    params: { a: { kind: 'target', opens: 'A' }, A: { kind: 'gate' } },
    enemies: [{ x: 25, y: 13, range: 2 }],
    wind: { dir: 1, periodSec: 4, gustSec: 1 },
  };
  const mkc = () =>
    new ObstSession({
      mode: 'free',
      difficulty: 'normal',
      level: 0,
      seed: 1,
      slots: [0, 1],
      levels: [level],
      campaign: { world: 'glacier' },
    });
  it('the view lists the enemy, the pickaxe and the target, passes checkWorldView, and the enemy walks', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    v.sync();
    const by = (id: string) => v.entities.find((e) => e.id === id);
    expect(by('enemy0')?.kind).toBe('enemy');
    expect(by('pick0')?.kind).toBe('pickaxe');
    expect(by('obja')?.kind).toBe('target');
    const x0 = by('enemy0')!.x;
    play(s, 1000);
    v.sync();
    expect(by('enemy0')!.x).not.toBe(x0);
    expect(checkWorldView(v)).toEqual([]);
  });
  it("a player on the pickaxe takes it: held, with the holder's id; the target shows its clock once hit; the wind phase is reported", () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const p = s.world.players[0]!;
    p.body.x = 10 * TILE + 7;
    p.body.y = 14 * TILE - 46; // standing in the cell of the pickaxe
    play(s, 300);
    v.sync();
    const k = v.entities.find((e) => e.id === 'pick0')!;
    expect(k.on).toBe(true);
    expect(k.holder).toBe(0);
    const q = s.world.players[1]!;
    q.body.x = 20 * TILE + 7;
    q.body.y = 6 * TILE;
    q.body.vy = 0;
    play(s, 60);
    v.sync();
    const t = v.entities.find((e) => e.id === 'obja')!;
    expect(t.on).toBe(true);
    expect(t.value).toBeGreaterThan(0.5);
    expect(v.wind?.phase).toBeDefined();
    expect(checkWorldView(v)).toEqual([]);
  });
  it('the wind phase goes calm -> warn -> gust, with the direction and no zone', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const seen = new Set<string>();
    for (let t = 0; t < 270; t++) {
      s.advance(FRAME);
      v.sync();
      seen.add(v.wind!.phase);
    }
    expect([...seen].sort()).toEqual(['calm', 'gust', 'warn']);
    expect(v.wind).toMatchObject({ dir: 1, zone: null });
  });
  it('a quick-match session has no wind and no enemies in its view', () => {
    const s = new ObstSession({ mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level] });
    const v = new SimWorldView(s);
    play(s, 3500);
    v.sync();
    expect(v.wind).toBeNull();
    expect(v.entities.some((e) => e.kind === 'enemy')).toBe(false);
  });
});

describe('SimWorldView: campaign A6 entities (lantern, crystals, elastic ring, sinker, geyser)', () => {
  const rows = Array.from({ length: 16 }, (_, y) => {
    const cs = ('#' + '.'.repeat(38) + '#').split('');
    if (y >= 14) cs.fill('#');
    if (y === 13) {
      cs[2] = 'S';
      cs[36] = 'G';
      cs[8] = 'l';
      cs[30] = 'E';
      cs[22] = 'Y';
    }
    if (y === 5) cs[16] = 'u';
    if (y === 6) cs[16] = 'o';
    if (y === 9) {
      cs[12] = 'D';
      cs[13] = 'D';
      cs[14] = 'D';
    }
    return cs.join('');
  });
  const level: LevelDef = {
    id: 'a6',
    name: 'a6',
    biome: 'mine',
    players: { min: 2, max: 2 },
    tether: 'any',
    stars: 1,
    parSec: 60,
    rows,
    params: { D: { kind: 'sinker', travel: 3 }, E: { kind: 'geyser', periodSec: 4 } },
  };
  const mkc = () =>
    new ObstSession({ mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level], campaign: { world: 'mine' } });
  it('the view lists the lantern, the sinker, the geyser and an elastic ring after the plain one; passes checkWorldView; the darkness has a light on the lantern', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    v.sync();
    const by = (id: string) => v.entities.find((e) => e.id === id);
    expect(by('lantern0')?.kind).toBe('lantern');
    expect(by('objD')?.kind).toBe('sinker');
    expect(by('objE')?.kind).toBe('geyser');
    expect(by('ring0')?.label).toBe('');
    expect(by('ring1')?.label).toBe('elastic');
    expect(v.dark).toMatchObject({ radius: 4 * TILE });
    expect(v.dark!.lights).toHaveLength(1);
    expect(checkWorldView(v)).toEqual([]);
  });
  it('whoever steps on the lantern holds it (the light follows); standing on the rock sinks it (value grows); the geyser phase goes 0 -> 0.5 -> 1', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const p = s.world.players[0]!,
      q = s.world.players[1]!;
    p.body.x = 8 * TILE + 7;
    p.body.y = 14 * TILE - 46;
    play(s, 120);
    v.sync();
    expect(v.entities.find((e) => e.id === 'lantern0')).toMatchObject({ on: true, holder: 0 });
    expect(v.dark!.lights[0]!.x).toBeCloseTo(p.body.x + 17, 0);
    q.body.x = 12 * TILE + 7;
    q.body.y = 9 * TILE - 46;
    q.body.vy = 0;
    play(s, 1500);
    v.sync(); // 1.5 s on the rock = 0.75 tile down of 3
    expect(v.entities.find((e) => e.id === 'objD')!.value).toBeGreaterThan(0.15);
    const seen = new Set<number>();
    for (let t = 0; t < 280; t++) {
      s.advance(FRAME);
      v.sync();
      seen.add(v.entities.find((e) => e.id === 'objE')!.value);
    }
    expect([...seen].sort()).toEqual([0, 0.5, 1]);
  });
  it('a quick-match session shows none of it: no dark, no elastic ring link', () => {
    const s = new ObstSession({ mode: 'chain', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level] });
    const v = new SimWorldView(s);
    play(s, 3500);
    v.sync();
    expect(v.dark).toBeNull();
    expect(v.ropes[0]!.links[0]!.elastic).toBe(false);
  });
});

describe('ObstRun: what main.ts wires to the scene, the bus and the phones', () => {
  const run = (levels: LevelDef[] = [def(1)], n = 2) => {
    const bus = new Emitter<ObstEvents>();
    const seen: string[] = [];
    for (const k of ['obst.jump', 'obst.land', 'obst.levelClear', 'obst.runEnd', 'obst.goalEnter'] as const) bus.on(k, () => seen.push(k));
    let over = 0;
    const r = new ObstRun(
      { mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: Array.from({ length: n }, (_, i) => i), levels },
      { names: (s) => `J${s}`, bus, onOver: () => over++ },
    );
    return { r, seen, over: () => over };
  };
  it('step() publishes the obst.* events of the world on the bus, as they happen', () => {
    const { r, seen } = run();
    for (let t = 0; t < 3200; t += FRAME) r.step(FRAME);
    r.receive(0, { x: 0, y: 0, presses: [0, 0] });
    r.receive(0, { x: 0, y: 0, presses: [1, 0] });
    for (let t = 0; t < 1100; t += FRAME) r.step(FRAME);
    expect(seen).toContain('obst.jump');
    expect(seen).toContain('obst.land');
  });
  it('world() is the same view until the level changes, then a new one (the scene rebuilds its picture when the object changes)', () => {
    const { r } = run([def(1), def(2)]);
    const first = r.world();
    for (let t = 0; t < 3200; t += FRAME) r.step(FRAME);
    expect(r.world()).toBe(first);
    const g = r.session.world.level.markers.goal[0]!;
    for (const p of r.session.world.players) {
      p.body.x = g.x * TILE + 7;
      p.body.y = (g.y + 1) * TILE - 46;
    }
    for (let t = 0; t < 5000; t += FRAME) r.step(FRAME);
    expect(r.session.levelIndex).toBe(1);
    expect(r.world()).not.toBe(first);
    expect(r.world().level.def.id).toBe('l02');
    expect(r.world().hud.levelIndex).toBe(1);
  });
  it('the final banner is held, then onOver fires ONCE (the screen goes to the results)', () => {
    const { r, over, seen } = run([def(1)]);
    for (let t = 0; t < 3200; t += FRAME) r.step(FRAME);
    const g = r.session.world.level.markers.goal[0]!;
    for (const p of r.session.world.players) {
      p.body.x = g.x * TILE + 7;
      p.body.y = (g.y + 1) * TILE - 46;
    }
    for (let t = 0; t < 4500; t += FRAME) r.step(FRAME);
    expect(seen).toContain('obst.runEnd');
    expect(over()).toBe(0);
    for (let t = 0; t < 4500; t += FRAME) r.step(FRAME);
    expect(over()).toBe(1);
    expect(r.session.summary()!.reason).toBe('complete');
  });
  it("the camera verdict goes to the world: a player out of the picture long enough turns into a bubble (by the world's own clock)", () => {
    const { r } = run([def(1)], 3);
    for (let t = 0; t < 3200; t += FRAME) r.step(FRAME);
    const w = r.session.world;
    w.players[2]!.body.x = 8 * TILE; // far behind the other two, who stay at the start
    const fakeView = { camera: { result: { offscreen: [{ id: 2 }] } }, banner: () => {} } as unknown as Parameters<
      ObstRun['afterRender']
    >[0];
    const events: string[] = [];
    for (let t = 0; t < 3000 && w.players[2]!.mode === 'active'; t += FRAME) {
      r.step(FRAME);
      r.afterRender(fakeView);
    }
    events.push(w.players[2]!.mode);
    expect(events).toEqual(['bubble']);
  });
  it('the 3-2-1 and the level card are drawn once each, on the live view', () => {
    const { r } = run([def(1), def(2)]);
    const shown: string[] = [];
    const v = { camera: { result: null }, banner: (t: string) => shown.push(t) } as unknown as Parameters<ObstRun['afterRender']>[0];
    for (let t = 0; t < 3300; t += FRAME) {
      r.step(FRAME);
      r.afterRender(v);
    }
    expect(shown.slice(0, 4)).toEqual(['3', '2', '1', '¡VAMOS!']);
    const g = r.session.world.level.markers.goal[0]!;
    for (const p of r.session.world.players) {
      p.body.x = g.x * TILE + 7;
      p.body.y = (g.y + 1) * TILE - 46;
    }
    for (let t = 0; t < 5000; t += FRAME) {
      r.step(FRAME);
      r.afterRender(v);
    }
    expect(shown.filter((x) => x.startsWith('NIVEL 2'))).toHaveLength(1);
  });
  it('the music state: nothing while counting down, the biome and movement once the group runs, tension from the rope', () => {
    const bus = new Emitter<ObstEvents>();
    const r = new ObstRun(
      { mode: 'chain', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1, 2, 3], levels: [def(1)] },
      { names: String, bus, onOver: () => {} },
    );
    expect(r.musicState()).toMatchObject({ playing: false, biome: 'beach' });
    for (let t = 0; t < 3300; t += FRAME) r.step(FRAME);
    const idle = r.musicState();
    expect(idle).toMatchObject({ playing: true, moving: false, checkpointed: false });
    expect(idle.progress).toBeLessThan(0.1);
    const bots = [0, 1, 2, 3].map((i) => new ObstBot(i));
    const taps = [0, 1, 2, 3].map(() => [0, 0]);
    let sawMoving = false;
    for (let f = 0; f < 60 * 9; f++) {
      if (f === 30) sawMoving = r.musicState().moving;
      const snap = snapshot(r.session.world);
      const view = { tick: r.session.world.tick, grid: r.session.world.grid, players: snap.players, goal: snap.goal };
      bots.forEach((b, i) => {
        const o = b.decide(view);
        if (o.jump) taps[i]![0]!++;
        if (o.grab) taps[i]![1]!++;
        r.receive(i, { x: o.x, y: o.y, presses: [taps[i]![0]!, taps[i]![1]!] });
      });
      r.step(FRAME);
    }
    const run1 = r.musicState();
    expect(sawMoving).toBe(true);
    expect(run1.progress).toBeGreaterThan(0.4);
    expect(run1.checkpointed).toBe(true);
    expect(run1.maxRopeTension).toBeGreaterThan(0);
  });
});
