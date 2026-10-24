// Campaign dynamics 4-9 (plan §4, phase A5) and the throw niche, in the real sim: balance, target, soft enemies, ice, wind, pickaxe. Each one has its quick-match twin
// that must NOT show it (the layer is opt-in) and the numbers that params(2) freezes (campaign.test.ts).
import { describe, expect, it } from 'vitest';
import { DT, JUMP_V0, PLAYER_H, TILE } from '../constants';
import { campaignParams } from './campaign';
import { draw, hall, inp, level, names, obj, of, pl, run, teleport, vline, world } from './testkit';
import { previewB, snapshot, step } from './world';

const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const FLOOR = 13; // standing row of hall(40, 16)
const steps = (sec: number) => Math.round(sec / DT);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 4: balance (the larger load goes down at 2 tiles/s, also against an empty plate)', () => {
  const rows = draw(hall(40, 16), [8, 9, 'DDDD'], [20, 9, 'EEEE']);
  const params = { D: { kind: 'balance' as const, partner: 'E', travel: 3, speed: 1.2 }, E: { kind: 'balance' as const, partner: 'D', travel: 3, speed: 1.2 } };
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
    teleport(w, 0, 9, 8); teleport(w, 1, 21, 8);
    const ev = run(w, 90);
    expect(obj(w, 'D').oy).toBe(0);
    expect(of(ev, 'obst.balance')).toEqual([]);
  });
  it('with 3 players, two on D and one on E: the counts decide (D goes down)', () => {
    const w = mk({ slots: [0, 1, 2], n: 3 });
    teleport(w, 0, 9, 8); teleport(w, 1, 10, 8); teleport(w, 2, 21, 8);
    run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(80);
  });
  it('quick match keeps the old rule: alone on a plate nothing moves; two against one moves at the level\'s own speed (1.2 tiles/s), not at 2', () => {
    const q = mk({ campaign: false });
    teleport(q, 0, 9, 8);
    run(q, 60);
    expect(obj(q, 'D').oy).toBe(0);
    const w = mk({ campaign: false, slots: [0, 1, 2] });
    teleport(w, 0, 9, 8); teleport(w, 1, 10, 8); teleport(w, 2, 21, 8);
    run(w, 60);
    expect(obj(w, 'D').oy).toBeGreaterThan(50); expect(obj(w, 'D').oy).toBeLessThan(58); // 1.2 x 48 = 57.6 per second, minus the step it takes to load
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 5: target (touched in flight, it opens its gate for targetSec)', () => {
  const tparams = { a: { kind: 'target' as const, opens: 'A' }, A: { kind: 'gate' as const } };
  const air = draw(hall(40, 16), [20, 5, 'aa'], [20, 6, 'aa'], ...vline(30, 9, 13, 'A'));
  const ground = draw(hall(40, 16), [20, 12, 'aa'], [20, 13, 'aa'], ...vline(30, 9, 12, 'A')); // the target sits where a walking player overlaps it
  const mk = (rows: string[], o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(rows, { params: tparams }), { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
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
    teleport(w, 0, 20, 5); run(w, 2);
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
    teleport(w, 0, 20, 5); run(w, 2);
    const t = snapshot(w).plates.find((p) => p.letter === 'a')!;
    expect(t.kind).toBe('target');
    expect(t.pressed).toBe(true);
    expect(t.leftSec).toBeGreaterThan(3.8);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 6: soft enemies (they shove, never kill; landing on one stuns it for 3 s)', () => {
  const rows = hall(40, 16);
  const def = level(rows, { enemies: [{ x: 20, y: FLOOR, range: 3 }] });
  const mk = (o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(def, { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
    teleport(w, 0, 3, FLOOR); teleport(w, 1, 5, FLOOR);
    return w;
  };
  const cx = (w: ReturnType<typeof mk>, i = 0) => w.ent.enemies[i]!.x + w.ent.enemies[i]!.w / 2;
  it('it patrols +-3 tiles around its home at 1.5 tiles/s and turns back at both ends', () => {
    const w = mk();
    const home = (20 + 0.5) * TILE;
    let lo = Infinity, hi = -Infinity;
    run(w, 600, undefined, () => { lo = Math.min(lo, cx(w)); hi = Math.max(hi, cx(w)); });
    expect(lo).toBeGreaterThan(home - 3 * TILE - 2); expect(lo).toBeLessThan(home - 3 * TILE + 3);
    expect(hi).toBeLessThan(home + 3 * TILE + 2); expect(hi).toBeGreaterThan(home + 3 * TILE - 3);
    const x0 = cx(w); run(w, 60);
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
    e.x = pl(w, 0).body.x + 10; e.dir = -1; // right on top of the player, walking towards it
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
    const ev = run(w, 40, undefined, () => { hop = Math.min(hop, pl(w, 0).body.vy); });
    expect(of(ev, 'obst.enemy').some((e) => e.action === 'stun' && e.player === 0)).toBe(true);
    expect(w.ent.enemies[0]!.stun).toBeGreaterThan(0);
    expect(hop).toBeLessThan(-JUMP_V0 * 0.5); // bounced
    teleport(w, 0, 3, FLOOR); // out of the way (a head is a platform: the lander must not keep standing on the other player's)
    const x0 = cx(w);
    teleport(w, 1, 20, FLOOR); pl(w, 1).body.x = x0 - 17;
    const ev2 = run(w, 60);
    expect(cx(w)).toBe(x0); // not moving while stunned
    expect(of(ev2, 'obst.enemy').filter((e) => e.action === 'push')).toEqual([]);
    run(w, steps(3));
    expect(w.ent.enemies[0]!.stun).toBe(0);
    const x1 = cx(w); run(w, 30);
    expect(cx(w)).not.toBe(x1); // walking again
  });
  it('N=4 adds one enemy (+1 every 2 players beyond 2) that walks the other way', () => {
    expect(mk().ent.enemies).toHaveLength(1);
    const w = mk({ slots: [0, 1, 2, 3], n: 4 });
    expect(w.ent.enemies).toHaveLength(2);
    expect(w.ent.enemies.map((e) => e.dir)).toEqual([1, -1]);
    expect(campaignParams(2, 'forest').enemyExtra).toBe(0);
  });
  it('quick match: the level\'s enemies do not exist', () => {
    const w = mk({ campaign: false });
    expect(w.ent.enemies).toEqual([]);
    expect(snapshot(w).enemies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 7: ice (friction x0.15 on I tiles; an anchor planted on ice slides)', () => {
  // the first half of the floor is rock and the second half ice: row 14 = the floor top
  const floor = (a: string, b: string) => { const r = hall(60, 16); r[14] = '#' + a.repeat(29) + b.repeat(30); return r; };
  const ICE = floor('#', 'I'), ROCK = floor('#', '#');
  // runs 40 steps to the right from `col`, lets go and measures how far the body glides until it stops
  const glide = (rows: string[], col: number, o: { campaign?: boolean } = {}) => {
    const w = world(level(rows), { mode: 'free', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 1, 2, FLOOR); teleport(w, 0, col, FLOOR);
    run(w, 5);
    const vx10: number[] = [];
    run(w, 40, (s) => (s === 0 ? inp({ move: 1 }) : undefined), () => { if (vx10.length < 10) vx10.push(pl(w, 0).body.vx); });
    const x0 = pl(w, 0).body.x, vTop = pl(w, 0).body.vx;
    let stopAt = 0;
    run(w, 120, undefined, () => { if (Math.abs(pl(w, 0).body.vx) > 1) stopAt = pl(w, 0).body.x - x0; });
    return { vx: vx10[9]!, vTop, glide: stopAt, w };
  };
  it('on ice it accelerates slowly (10 steps in: under 40 % of the speed rock gives) and glides >4x farther after letting go', () => {
    const ice = glide(ICE, 35), rock = glide(ROCK, 35);
    expect(rock.vx).toBeGreaterThan(300);
    expect(ice.vx).toBeLessThan(0.4 * rock.vx);
    expect(ice.glide).toBeGreaterThan(4 * rock.glide);
    expect(ice.glide).toBeGreaterThan(40);
  });
  it('quick match: ice grips like rock (no friction parameter outside a campaign)', () => {
    const ice = glide(ICE, 35, { campaign: false }), rock = glide(ROCK, 35, { campaign: false });
    expect(ice.vx).toBeCloseTo(rock.vx, 3);
    expect(ice.glide).toBeCloseTo(rock.glide, 3);
  });
  it('stepping from rock onto ice rings obst.ice once; walking on rock never does', () => {
    const w = world(level(ICE), { mode: 'free', ...camp() });
    teleport(w, 1, 2, FLOOR); teleport(w, 0, 27, FLOOR);
    const ev = run(w, 90, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(of(ev, 'obst.ice')).toEqual([{ player: 0 }]);
    const r = world(level(ROCK), { mode: 'free', ...camp() });
    teleport(r, 1, 2, FLOOR); teleport(r, 0, 27, FLOOR);
    expect(of(run(r, 90, (s) => (s === 0 ? inp({ move: 1 }) : undefined)), 'obst.ice')).toEqual([]);
  });
  // plateau (cols 1..14, top at row 8): the planted one stands on its edge, the other dangles from the rope (same set-up as the anchor tests)
  const plateau = (top: string) => Array.from({ length: 16 }, (_, y) => {
    const cs = ('#' + '.'.repeat(28) + '#').split('');
    if (y >= 8) for (let x = 1; x <= 14; x++) cs[x] = y === 8 ? top : '#';
    if (y === 15) cs.fill('#');
    if (y === 7) cs[2] = 'S';
    if (y === 14) cs[27] = 'G';
    return cs.join('');
  });
  const hang = (top: string) => {
    const w = world(level(plateau(top)), { mode: 'chain', ...camp() });
    teleport(w, 0, 13, 7); teleport(w, 1, 16, 5);
    run(w, 5); run(w, 1, B(0));
    const x0 = pl(w, 0).body.x;
    run(w, 90);
    return { dx: pl(w, 0).body.x - x0, w };
  };
  it('a planted anchor on ice slides towards the edge like one over its limit (0.5 tile/s); on rock it does not move', () => {
    const rock = hang('#'), ice = hang('I');
    expect(Math.abs(rock.dx)).toBeLessThan(0.01);
    expect(ice.dx).toBeGreaterThan(15); // 0.5 tile/s x 1.5 s = 36 px, minus the braking
    expect(ice.dx).toBeLessThan(40);
    expect(pl(ice.w, 0).planted).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 8: wind (a gust announced 1 s ahead pushes whoever is in the air)', () => {
  const wind = { dir: 1 as const, periodSec: 4, gustSec: 1 }; // calm 0-2 s, warn 2-3 s, gust 3-4 s
  const mk = (extra: object = {}, o: { campaign?: boolean; slots?: number[]; n?: number } = {}) => {
    const w = world(level(hall(40, 16), { wind, ...extra }), { mode: 'free', slots: o.slots ?? [0, 1], ...(o.campaign === false ? {} : camp(o.n)) });
    teleport(w, 0, 3, FLOOR); teleport(w, 1, 36, FLOOR);
    return w;
  };
  it('the phases ring at 2.0 s (warn), 3.0 s (gust) and 4.0 s (calm), every period', () => {
    const w = mk();
    const seen: [number, string][] = [];
    run(w, 250, undefined, (ev) => { for (const e of of(ev, 'obst.wind')) seen.push([w.tick, e.phase]); });
    expect(seen).toEqual([[120, 'warn'], [180, 'gust'], [240, 'calm']]);
    expect(of(run(w, 250, undefined), 'obst.wind').map((e) => e.phase)).toEqual(['warn', 'gust', 'calm']); // the next period (ticks 240..480)
  });
  const drift = (w: ReturnType<typeof mk>, slot: number, from: number) => {
    run(w, from - w.tick - 1);
    teleport(w, slot, 10, 3); // up in the air at the start of the gust
    const x0 = pl(w, slot).body.x;
    run(w, 30);
    return pl(w, slot).body.x - x0;
  };
  it('in the air during the gust: 140 px/s to the side of `dir` (35 px in 30 steps... 70 for the half second); the same fall in the calm drifts nothing', () => {
    const calm = drift(mk(), 0, 20); // ticks 20..50: calm
    const gust = drift(mk(), 0, 181); // ticks 181..211: gust
    expect(Math.abs(calm)).toBeLessThan(0.01);
    expect(gust).toBeGreaterThan(65); expect(gust).toBeLessThan(75); // 30 steps x 140 / 60 = 70
  });
  it('on the ground nothing moves during the gust', () => {
    const w = mk();
    run(w, 179);
    teleport(w, 0, 10, FLOOR); run(w, 2);
    const x0 = pl(w, 0).body.x; run(w, 40);
    expect(pl(w, 0).body.x).toBeCloseTo(x0, 3);
  });
  it('a zone limits it: outside the rectangle the air is still', () => {
    const inside = drift(mk({ wind: { ...wind, zone: { x: 5, y: 0, w: 10, h: 14 } } }), 0, 181);
    const outside = drift(mk({ wind: { ...wind, zone: { x: 25, y: 0, w: 10, h: 14 } } }), 0, 181);
    expect(inside).toBeGreaterThan(65);
    expect(Math.abs(outside)).toBeLessThan(0.01);
  });
  it('N>=3: the force is x0.8 (plan §4)', () => {
    const n2 = drift(mk(), 0, 181);
    const n3 = drift(mk({}, { slots: [0, 1, 2], n: 3 }), 0, 181);
    expect(n3 / n2).toBeCloseTo(0.8, 2);
  });
  it('quick match: the wind is not part of the world (no event, no push)', () => {
    const w = mk({}, { campaign: false });
    const seen = names(run(w, 250));
    expect(seen.filter((n) => n === 'obst.wind')).toEqual([]);
    expect(Math.abs(drift(mk({}, { campaign: false }), 0, 181))).toBeLessThan(0.01);
    expect(snapshot(w).wind).toBeNull();
  });
  it('the snapshot says which phase it is (the renderer draws the streaks from it)', () => {
    const w = mk();
    run(w, 130);
    expect(snapshot(w).wind).toEqual({ phase: 'warn', dir: 1, zone: null });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('dynamic 9: pickaxe (a role item: climb ice walls at 1 tile/s, pass it with B)', () => {
  // a 5-tile wall (rows 9..13) of ice on its left face (col 15) glued to rock (cols 16..20); the pickaxe lies at col 10
  const rows = (() => {
    const r = hall(40, 16);
    for (let y = 9; y <= 13; y++) r[y] = r[y]!.slice(0, 15) + 'I' + '#'.repeat(5) + r[y]!.slice(21);
    r[FLOOR] = r[FLOOR]!.slice(0, 10) + 'p' + r[FLOOR]!.slice(11);
    return r;
  })();
  const mk = (o: { campaign?: boolean; mode?: 'chain' | 'free' } = {}) => {
    const w = world(level(rows), { mode: o.mode ?? 'free', ...(o.campaign === false ? {} : camp()) });
    teleport(w, 0, 10, FLOOR); teleport(w, 1, 3, FLOOR);
    run(w, 2);
    return w;
  };
  const flush = (w: ReturnType<typeof mk>, slot: number) => { teleport(w, slot, 14, FLOOR); pl(w, slot).body.x = 15 * TILE - 34; pl(w, slot).body.facing = 1; }; // against the ice, facing it
  const up = (s: number) => (slot: number) => (slot === s ? inp({ up: true }) : undefined);
  it('walking over it takes it (once, with the cue), and it follows its holder', () => {
    const w = mk();
    expect(w.ent.pickaxes[0]!.heldBy).toBe(0);
    expect(pl(w, 0).camp.pick).toBe(0);
    const w2 = world(level(rows), { mode: 'free', ...camp() });
    teleport(w2, 0, 10, FLOOR); teleport(w2, 1, 3, FLOOR);
    expect(of(run(w2, 3), 'obst.pickaxe')).toEqual([{ player: 0, action: 'take' }]);
    teleport(w2, 0, 12, FLOOR); run(w2, 2);
    expect(w2.ent.pickaxes[0]!.x).toBeCloseTo(pl(w2, 0).body.x + 17, 3);
  });
  it('without the pickaxe, UP beside the ice does nothing', () => {
    const w = mk();
    flush(w, 1);
    const y0 = pl(w, 1).body.y;
    run(w, 120, up(1));
    expect(pl(w, 1).body.y).toBe(y0);
    expect(pl(w, 1).camp.pick).toBe(0);
  });
  it('with it, UP beside the wall clings and climbs 1 tile per second; it rings "climb" once', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    const y0 = pl(w, 0).body.y;
    const ev = run(w, 60, up(0));
    expect(of(ev, 'obst.pickaxe')).toEqual([{ player: 0, action: 'climb' }]);
    expect(pl(w, 0).camp.pick).toBe(1);
    expect(y0 - pl(w, 0).body.y).toBeGreaterThan(44); expect(y0 - pl(w, 0).body.y).toBeLessThan(49); // 48 px/s
    expect(pl(w, 0).body.grounded).toBe(false);
  });
  it('it reaches the top in about 5 s, mantles over it ("top") and ends standing on the wall', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    const ev = run(w, 600, up(0));
    expect(of(ev, 'obst.pickaxe').map((e) => e.action)).toEqual(['climb', 'top']);
    expect(pl(w, 0).body.grounded).toBe(true);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // feet on the top of the wall
    expect(pl(w, 0).camp.pick).toBe(0);
  });
  it('holding still on the wall hangs there; DOWN climbs back; the floor lets go', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3);
    run(w, 100, up(0));
    const y = pl(w, 0).body.y;
    run(w, 60, (s) => (s === 0 ? inp({}) : undefined));
    expect(pl(w, 0).body.y).toBe(y);
    run(w, 300, (s) => (s === 0 ? inp({ down: true }) : undefined));
    expect(pl(w, 0).camp.pick).toBe(0);
    expect(pl(w, 0).body.grounded).toBe(true);
  });
  it('A jumps off the wall, away from it', () => {
    const w = mk();
    flush(w, 0);
    run(w, 3); run(w, 40, up(0));
    expect(pl(w, 0).camp.pick).toBe(1);
    run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 0).camp.pick).toBe(0);
    expect(pl(w, 0).body.vx).toBeLessThan(0);
    expect(pl(w, 0).body.vy).toBeLessThan(0);
  });
  it('a wall taller than the rope: the climber on top passes the pickaxe DOWN the rope (B, range = rope length) and the partner climbs it too, with the climber planted', () => {
    const w = mk({ mode: 'chain' });
    flush(w, 0); teleport(w, 1, 12, FLOOR);
    run(w, 3);
    run(w, 330, up(0));
    expect(pl(w, 0).body.grounded).toBe(true);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // on top
    expect(pl(w, 1).body.grounded).toBe(false); // dangling on the rope, far below
    expect(pl(w, 1).body.y).toBeGreaterThan(pl(w, 0).body.y + 3 * TILE);
    expect(previewB(w, 0).action).toBe('pass'); // the partner is farther than a grab but within the rope
    const ev1 = run(w, 1, B(0));
    expect(of(ev1, 'obst.pickaxe')).toEqual([{ player: 0, action: 'pass' }]);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
    run(w, 1, B(0)); // hands empty now: B plants (anchor) so the partner is not dragged off the wall
    expect(pl(w, 0).planted).toBe(true);
    const ev2 = run(w, 600, (s) => (s === 1 ? inp({ up: true, move: 1 }) : undefined));
    expect(of(ev2, 'obst.pickaxe').map((e) => `${e.player}${e.action}`)).toEqual(['1climb', '1top']);
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(pl(w, 1).body.y + PLAYER_H).toBeCloseTo(9 * TILE, 0); // both on top
    expect(pl(w, 1).mode).toBe('active');
  });
  it('a plain pass is limited to the grab range when nobody is tied (free mode): 62 px away B just plants', () => {
    const w = mk({ mode: 'free' });
    teleport(w, 1, 12, FLOOR); run(w, 2);
    expect(previewB(w, 0).action).toBe('plant');
  });
  it('B hands it to a teammate within reach (before lift and plant); out of reach B plants as usual', () => {
    const w = mk();
    teleport(w, 1, 11, FLOOR);
    run(w, 2);
    expect(previewB(w, 0).action).toBe('pass');
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.pickaxe')).toEqual([{ player: 0, action: 'pass' }]);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
    expect(pl(w, 0).planted).toBe(false);
    expect(previewB(w, 1).action).toBe('pass'); // and it can go back
    teleport(w, 1, 30, FLOOR); run(w, 2);
    expect(previewB(w, 1).action).toBe('plant');
    run(w, 1, B(1));
    expect(pl(w, 1).planted).toBe(true);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(1);
  });
  it('whoever dies loses it: it goes back where it was found', () => {
    const w = mk();
    expect(w.ent.pickaxes[0]!.heldBy).toBe(0);
    pl(w, 0).body.y = w.level.h * TILE + 300; // fell out of the level
    run(w, 3);
    expect(w.ent.pickaxes[0]!.heldBy).toBe(-1);
    expect(w.ent.pickaxes[0]!.x).toBe(w.ent.pickaxes[0]!.homeX);
  });
  it('quick match: the item is inert and the ice is just a wall', () => {
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 10, FLOOR); teleport(w, 1, 14, FLOOR);
    run(w, 5);
    expect(w.ent.pickaxes).toEqual([]);
    const y0 = pl(w, 1).body.y;
    run(w, 100, up(1));
    expect(pl(w, 1).body.y).toBe(y0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('throw niche: in a campaign the thrown player\'s rope stretches and the launch is faster, so a throw crosses what a jump or a tower cannot', () => {
  // floor to col 12, a GAP-wide pit (safe floor 3 rows down), floor again; the thrower stands at the edge with the partner beside it
  const cross = (gap: number, o: { campaign: boolean }) => {
    const rows = Array.from({ length: 20 }, (_, y) => {
      const cs = ('#' + '.'.repeat(48) + '#').split('');
      if (y >= 15) for (let x = 1; x <= 12; x++) cs[x] = '#';
      if (y >= 15) for (let x = 13 + gap; x < 49; x++) cs[x] = '#';
      if (y >= 18) cs.fill('#');
      if (y === 14) cs[2] = 'S';
      if (y === 14) cs[46] = 'G';
      return cs.join('');
    });
    const w = world(level(rows, { tether: 'chainOnly' }), { mode: 'chain', ...(o.campaign ? { campaign: { world: 'beach' as const } } : {}) });
    const [a, b] = [pl(w, 0), pl(w, 1)];
    a.body.x = 12 * TILE + 8; a.body.y = 15 * TILE - PLAYER_H; b.body.x = 11 * TILE + 4; b.body.y = 15 * TILE - PLAYER_H;
    for (const p of [a, b]) { p.body.grounded = true; p.body.air = 0; p.body.facing = 1; }
    run(w, 5);
    run(w, 1, B(0)); run(w, 3); // lift
    let maxLen = 0, landed = false;
    const ev = run(w, 1, B(0), (e) => { void e; });
    maxLen = w.ropes[0]!.links[0]!.len;
    run(w, 200, (s) => (s === 1 && b.body.grounded && !b.planted ? inp({ grab: true }) : undefined), () => { if (b.body.grounded && b.body.x > (13 + gap) * TILE - 20 && b.body.y + PLAYER_H <= 15 * TILE + 1) landed = true; });
    return { landed, maxLen, ev, w };
  };
  it('campaign: a 5-tile pit (a jump carries 4 in the tied rope, a tower 3) is crossed by the throw', () => {
    const r = cross(5, { campaign: true });
    expect(r.landed).toBe(true);
  });
  it('quick match with the very same inputs: the old throw does not make it', () => {
    expect(cross(5, { campaign: false }).landed).toBe(false);
  });
  it('the rope of the thrown one is 1.5x longer at the throw and eases back to its own length within 1.2 s; the quick match rope is never longer', () => {
    const w = cross(3, { campaign: true }).w;
    const l = w.ropes[0]!.links[0]!;
    expect(l.len).toBeCloseTo(l.base, 6); // long settled
    const c = campaignParams(2, 'beach');
    expect(c.throwSlack).toBe(1.5);
    expect(c.throwSlackSec).toBe(1.2);
    const w2 = world(level(hall(40, 16)), { mode: 'chain', campaign: { world: 'beach' } });
    teleport(w2, 0, 10, FLOOR); teleport(w2, 1, 10, FLOOR);
    run(w2, 3);
    run(w2, 1, B(0)); run(w2, 2);
    run(w2, 1, B(0));
    expect(w2.ropes[0]!.links[0]!.len).toBeGreaterThan(w2.ropes[0]!.links[0]!.base * 1.45);
    expect(w2.ropes[0]!.links[0]!.len).toBeLessThanOrEqual(w2.ropes[0]!.links[0]!.base * 1.5 + 1e-9);
    run(w2, steps(1.2) + 2);
    expect(w2.ropes[0]!.links[0]!.len).toBeCloseTo(w2.ropes[0]!.links[0]!.base, 6);
    const q = world(level(hall(40, 16)), { mode: 'chain' });
    teleport(q, 0, 10, FLOOR); teleport(q, 1, 10, FLOOR);
    run(q, 3); run(q, 1, B(0)); run(q, 2); run(q, 1, B(0));
    expect(q.ropes[0]!.links[0]!.len).toBe(q.ropes[0]!.links[0]!.base);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('determinism: a campaign world with every A5 dynamic on hashes the same twice', () => {
  it('same inputs, same hash', async () => {
    const { hashState } = await import('./world');
    const r = hall(40, 16);
    r[9] = r[9]!.slice(0, 8) + 'DDDD' + r[9]!.slice(12, 20) + 'EEEE' + r[9]!.slice(24);
    const mk = () => world(level(r, {
      params: { D: { kind: 'balance', partner: 'E', travel: 3, speed: 1 }, E: { kind: 'balance', partner: 'D', travel: 3, speed: 1 } },
      enemies: [{ x: 28, y: FLOOR, range: 3 }], wind: { dir: -1, periodSec: 3, gustSec: 1 },
    }), { mode: 'free', ...camp() });
    const a = mk(), b = mk();
    const f = (s: number, t: number) => inp({ move: s === 0 ? 1 : -0.5, jump: t % 37 === s, grab: t % 90 === 11 && s === 1, up: t % 5 === 0 });
    for (let i = 0; i < 600; i++) { step(a, [f(0, i), f(1, i)]); step(b, [f(0, i), f(1, i)]); }
    expect(hashState(a)).toBe(hashState(b));
  });
});
