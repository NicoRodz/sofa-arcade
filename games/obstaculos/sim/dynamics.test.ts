// Campaign dynamics 4-6 (plan §4, phase A5) in the real sim: balance, target, soft enemies. Each one has its quick-match twin that must NOT show it
// (the layer is opt-in) and the numbers that params(2) freezes (campaign.test.ts). Ice and wind: dynamics-ice-wind.test.ts; pickaxe and throw niche: dynamics-pickaxe-throw.test.ts.

import { describe, expect, it } from 'vitest';
import { DT, JUMP_V0, TILE } from '../constants';
import { campaignParams } from './rules/campaign';
import { draw, hall, inp, level, names, obj, of, pl, run, teleport, vline, world } from './testkit/testkit';
import { snapshot } from './world';

const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const FLOOR = 13; // standing row of hall(40, 16)
const steps = (sec: number) => Math.round(sec / DT);

describe('dynamic 4: balance (the larger load goes down at 2 tiles/s, also against an empty plate)', () => {
  const rows = draw(hall(40, 16), [8, 9, 'DDDD'], [20, 9, 'EEEE']);
  const params = {
    D: { kind: 'balance' as const, partner: 'E', travel: 3, speed: 1.2 },
    E: { kind: 'balance' as const, partner: 'D', travel: 3, speed: 1.2 },
  };
  const mk = (o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(rows, { params }), { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
    for (const p of w.players) teleport(w, p.slot, 3 + p.slot, FLOOR); // out of the way until a test puts them on a plate
    return w;
  };
  it('alone on D it goes down 2 tiles in a second, the empty E rises the same, the rider goes along, one obst.balance rings with D as the heavier', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    const y0 = pl(w, 0).body.y;
    const ev = run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(85);
    expect(obj(w, 'D').oy).toBeLessThan(97); // 2 tiles/s = 96 px/s, minus the step it takes to load
    expect(obj(w, 'E').oy).toBeCloseTo(-obj(w, 'D').oy, 6);
    expect(pl(w, 0).body.y - y0).toBeGreaterThan(80); // standing on it, it went down too
    expect(of(ev, 'obst.balance')).toEqual([{ id: 'D', other: 'E' }]);
  });
  it('it stops at its travel (3 tiles) and does not ring again', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    const ev = run(w, 200);
    expect(obj(w, 'D').oy).toBeCloseTo(3 * TILE, 6);
    expect(of(ev, 'obst.balance')).toHaveLength(1);
  });
  it('one on each plate is a tie: nothing moves', () => {
    const w = mk();
    teleport(w, 0, 9, 8);
    teleport(w, 1, 21, 8);
    const ev = run(w, 90);
    expect(obj(w, 'D').oy).toBe(0);
    expect(of(ev, 'obst.balance')).toEqual([]);
  });
  it('with 3 players, two on D and one on E: the counts decide (D goes down)', () => {
    const w = mk({ slots: [0, 1, 2], n: 3 });
    teleport(w, 0, 9, 8);
    teleport(w, 1, 10, 8);
    teleport(w, 2, 21, 8);
    run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(80);
  });
  it("quick match keeps the old rule: alone on a plate nothing moves; two against one moves at the level's own speed (1.2 tiles/s), not at 2", () => {
    const q = mk({ campaign: false });
    teleport(q, 0, 9, 8);
    run(q, 60);
    expect(obj(q, 'D').oy).toBe(0);
    const w = mk({ campaign: false, slots: [0, 1, 2] });
    teleport(w, 0, 9, 8);
    teleport(w, 1, 10, 8);
    teleport(w, 2, 21, 8);
    run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(50);
    expect(obj(w, 'D').oy).toBeLessThan(58); // 1.2 x 48 = 57.6 per second, minus the step it takes to load
  });
});

describe('dynamic 5: target (touched in flight, it opens its gate for targetSec)', () => {
  const tparams = { a: { kind: 'target' as const, opens: 'A' }, A: { kind: 'gate' as const } };
  const air = draw(hall(40, 16), [20, 5, 'aa'], [20, 6, 'aa'], ...vline(30, 9, 13, 'A'));
  const ground = draw(hall(40, 16), [20, 12, 'aa'], [20, 13, 'aa'], ...vline(30, 9, 12, 'A')); // the target sits where a walking player overlaps it
  const mk = (rows: string[], o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(rows, { params: tparams }), {
      mode: 'free',
      slots: o.slots ?? [0, 1],
      ...(o.campaign === false ? {} : camp(o.n)),
    });
    for (const p of w.players) teleport(w, p.slot, 3 + p.slot, FLOOR);
    return w;
  };
  it('a jumper that passes through it opens the gate for 4 s (240 steps), then the gate closes again', () => {
    const w = mk(air);
    expect(obj(w, 'A').open).toBe(false);
    teleport(w, 0, 20, 5);
    const ev = run(w, 2);
    expect(of(ev, 'obst.target')).toEqual([{ id: 'a', player: 0, seconds: 4 }]);
    expect(obj(w, 'A').open).toBe(true);
    run(w, 200);
    expect(obj(w, 'A').open).toBe(true); // 3.4 s later still open
    run(w, 60);
    expect(obj(w, 'A').open).toBe(false); // past 4 s
  });
  it('a second hit restarts the clock and rings nothing new while it is still open', () => {
    const w = mk(air);
    teleport(w, 0, 20, 5);
    run(w, 2);
    run(w, 180);
    teleport(w, 1, 20, 5);
    const ev = run(w, 2);
    expect(of(ev, 'obst.target')).toEqual([]); // not fresh
    run(w, 200);
    expect(obj(w, 'A').open).toBe(true); // 3 s after the 2nd hit: the first clock would have run out
    run(w, 60);
    expect(obj(w, 'A').open).toBe(false);
  });
  it('walking into it (feet on the ground) does nothing', () => {
    const w = mk(ground);
    teleport(w, 0, 20, FLOOR);
    const ev = run(w, 120);
    expect(of(ev, 'obst.target')).toEqual([]);
    expect(obj(w, 'A').open).toBe(false);
  });
  it('N=4: +1 s (floor((N-2)/2)): the gate stays open 5 s and the event says so', () => {
    const w = mk(air, { slots: [0, 1, 2, 3], n: 4 });
    teleport(w, 0, 20, 5);
    const ev = run(w, 2);
    expect(of(ev, 'obst.target')[0]!.seconds).toBe(5);
    run(w, 270);
    expect(obj(w, 'A').open).toBe(true); // 4.5 s in: a 4 s gate would be shut by now
    run(w, 60);
    expect(obj(w, 'A').open).toBe(false);
  });
  it('quick match: the target is inert (no event, the gate stays shut)', () => {
    const w = mk(air, { campaign: false });
    teleport(w, 0, 20, 5);
    const ev = run(w, 5);
    expect(names(ev)).not.toContain('obst.target');
    expect(obj(w, 'A').open).toBe(false);
  });
  it('the snapshot carries the gate clock for the renderer', () => {
    const w = mk(air);
    teleport(w, 0, 20, 5);
    run(w, 2);
    const t = snapshot(w).plates.find((p) => p.letter === 'a')!;
    expect(t.kind).toBe('target');
    expect(t.pressed).toBe(true);
    expect(t.leftSec).toBeGreaterThan(3.8);
  });
});

describe('dynamic 6: soft enemies (they shove, never kill; landing on one stuns it for 3 s)', () => {
  const rows = hall(40, 16);
  const def = level(rows, { enemies: [{ x: 20, y: FLOOR, range: 3 }] });
  const mk = (o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(def, { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
    teleport(w, 0, 3, FLOOR);
    teleport(w, 1, 5, FLOOR);
    return w;
  };
  const cx = (w: ReturnType<typeof mk>, i = 0) => w.ent.enemies[i]!.x + w.ent.enemies[i]!.w / 2;
  it('it patrols +-3 tiles around its home at 1.5 tiles/s and turns back at both ends', () => {
    const w = mk();
    const home = (20 + 0.5) * TILE;
    let lo = Infinity,
      hi = -Infinity;
    run(w, 600, undefined, () => {
      lo = Math.min(lo, cx(w));
      hi = Math.max(hi, cx(w));
    });
    expect(lo).toBeGreaterThan(home - 3 * TILE - 2);
    expect(lo).toBeLessThan(home - 3 * TILE + 3);
    expect(hi).toBeLessThan(home + 3 * TILE + 2);
    expect(hi).toBeGreaterThan(home + 3 * TILE - 3);
    const x0 = cx(w);
    run(w, 60);
    expect(Math.abs(cx(w) - x0)).toBeCloseTo(1.5 * TILE, 0); // 72 px per second
  });
  it('walking into it you are shoved back, nothing dies and no heart is spent; obst.obst.enemy says "push"', () => {
    const w = mk();
    teleport(w, 0, 17, FLOOR);
    const ev = run(w, 240, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(of(ev, 'obst.enemy').some((e) => e.action === 'push' && e.player === 0)).toBe(true);
    expect(w.deaths).toBe(0);
    expect(w.heartsLost).toBe(0);
    expect(pl(w, 0).mode).toBe('active');
  });
  it('the shove wins against walking: pushing against its patrol range edge you do not get through it', () => {
    const w = mk();
    const e = w.ent.enemies[0]!;
    teleport(w, 0, 19, FLOOR);
    e.x = pl(w, 0).body.x + 10;
    e.dir = -1; // right on top of the player, walking towards it
    const x0 = pl(w, 0).body.x;
    run(w, 20, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).body.x).toBeLessThan(x0 + 1); // pushed left (or held), not carried through
  });
  it('landing on it from above stuns it for 3 s (180 steps) and bounces the lander; a stunned one neither moves nor shoves', () => {
    const w = mk();
    const ex = Math.round(cx(w));
    teleport(w, 0, 20, 9); // above it
    pl(w, 0).body.x = ex - 17;
    let hop = 0;
    const ev = run(w, 40, undefined, () => {
      hop = Math.min(hop, pl(w, 0).body.vy);
    });
    expect(of(ev, 'obst.enemy').some((e) => e.action === 'stun' && e.player === 0)).toBe(true);
    expect(w.ent.enemies[0]!.stun).toBeGreaterThan(0);
    expect(hop).toBeLessThan(-JUMP_V0 * 0.5); // bounced
    teleport(w, 0, 3, FLOOR); // out of the way (a head is a platform: the lander must not keep standing on the other player's)
    const x0 = cx(w);
    teleport(w, 1, 20, FLOOR);
    pl(w, 1).body.x = x0 - 17;
    const p1x = pl(w, 1).body.x;
    const ev2 = run(w, 60);
    expect(cx(w)).toBe(x0); // not moving while stunned
    expect(pl(w, 1).body.x).toBe(p1x); // standing inside it, nobody shoves: it is harmless (the cue alone would hide a shove: it has a cooldown)
    expect(of(ev2, 'obst.enemy').filter((e) => e.action === 'push')).toEqual([]);
    run(w, steps(3));
    expect(w.ent.enemies[0]!.stun).toBe(0);
    const x1 = cx(w);
    run(w, 30);
    expect(cx(w)).not.toBe(x1); // walking again
  });
  it('N=4 adds one enemy (+1 every 2 players beyond 2) that walks the other way', () => {
    expect(mk().ent.enemies).toHaveLength(1);
    const w = mk({ slots: [0, 1, 2, 3], n: 4 });
    expect(w.ent.enemies).toHaveLength(2);
    expect(w.ent.enemies.map((e) => e.dir)).toEqual([1, -1]);
    expect(campaignParams(2, 'forest').enemyExtra).toBe(0);
  });
  it("quick match: the level's enemies do not exist", () => {
    const w = mk({ campaign: false });
    expect(w.ent.enemies).toEqual([]);
    expect(snapshot(w).enemies).toEqual([]);
  });
});
