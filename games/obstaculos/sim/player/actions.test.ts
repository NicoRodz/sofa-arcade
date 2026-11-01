import { describe, expect, it } from 'vitest';
import { JUMP_V0, TILE } from '../../constants';
import { T } from '../../legend';
import { draw, hall, inp, level, names, obj, of, pl, run, teleport, tile, vline, world } from '../testkit/testkit';
import { previewB } from '../world';

const GROUND = 11;
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);

describe('B is contextual (plan §5): ring > teammate > box/lever > plant', () => {
  it('previewB follows the priority as the options disappear', () => {
    const w = world(level(draw(hall(), [10, 10, 'o'], [10, GROUND, 'x'])), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 8, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x - 36; // a teammate right beside
    run(w, 5);
    expect(previewB(w, 0).action).toBe('anchor');
    w.ent.rings.length = 0;
    expect(previewB(w, 0).action).toBe('lift');
    pl(w, 1).body.x -= 200;
    expect(previewB(w, 0).action).toBe('grab');
    w.ent.boxes.length = 0;
    expect(previewB(w, 0).action).toBe('plant');
    pl(w, 0).body.grounded = false;
    expect(previewB(w, 0).action).toBe('none'); // nothing to plant on in mid air
  });
  it('plant: B stands the player still (stick ignored), B again stands up', () => {
    const w = world(level(hall()), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    run(w, 1, B(0));
    expect(pl(w, 0).planted).toBe(true);
    expect(previewB(w, 0).action).toBe('unplant');
    const x = pl(w, 0).body.x;
    run(w, 30, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).body.x).toBe(x);
    run(w, 1, B(0));
    expect(pl(w, 0).planted).toBe(false);
    run(w, 20, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).body.x).toBeGreaterThan(x + 50);
  });
  it('A stands a planted player up and jumps', () => {
    const w = world(level(hall()), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    run(w, 1, B(0));
    const ev = run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 0).planted).toBe(false);
    expect(of(ev, 'obst.jump')).toEqual([{ player: 0, kind: 'ground' }]);
  });
});

describe('ring: anchor', () => {
  const lvl = () => level(draw(hall(), [10, 10, 'o']));
  it('B near a ring hangs the player on it (still, no gravity); A jumps off at v0; B releases and drops', () => {
    const w = world(lvl(), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.grab')).toEqual([{ player: 0, target: 'ring', targetId: 0 }]);
    const y = pl(w, 0).body.y;
    run(w, 40);
    expect(pl(w, 0).body.y).toBe(y);
    expect(pl(w, 0).body.vy).toBe(0);
    expect(pl(w, 0).stats.anchoredSteps).toBeGreaterThanOrEqual(40);
    const ev2 = run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(of(ev2, 'obst.jump')).toEqual([{ player: 0, kind: 'rope' }]);
    expect(pl(w, 0).holding).toBe(null);
    expect(pl(w, 0).body.vy).toBeLessThan(-JUMP_V0 + 200);
    run(w, 60);
    // B again while anchored releases
    teleport(w, 0, 10, GROUND);
    run(w, 3, B(0));
    expect(pl(w, 0).holding?.kind).toBe('ring');
    const ev3 = run(w, 1, B(0));
    expect(names(ev3)).toContain('obst.release');
    expect(pl(w, 0).holding).toBe(null);
  });
});

describe('teammates: lift, carry, throw', () => {
  const setup = () => {
    const w = world(level(hall()), { mode: 'free', slots: [0, 1, 2] });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 10, GROUND);
    teleport(w, 2, 2, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x + 30;
    run(w, 5);
    return w;
  };
  it('B lifts the teammate over the head and carries it while walking', () => {
    const w = setup();
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.grab')).toEqual([{ player: 0, target: 'player', targetId: 1 }]);
    expect(pl(w, 1).carriedBy).toBe(0);
    run(w, 30, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 1).body.x).toBeCloseTo(pl(w, 0).body.x, 5);
    expect(pl(w, 1).body.y).toBeLessThan(pl(w, 0).body.y - 40);
    expect(previewB(w, 0).action).toBe('throw');
  });
  it('B again throws it: (420, -950) px/s forward, no control until it lands, about 7 tiles of flight', () => {
    const w = setup();
    run(w, 1, B(0));
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.throw')).toEqual([{ player: 0, target: 1, vx: 420, vy: -950 }]);
    expect(pl(w, 0).stats.throws).toBe(1);
    const x0 = pl(w, 1).body.x;
    let peak = pl(w, 1).body.y;
    let n = 0;
    do {
      run(w, 1, (s) => (s === 1 ? inp({ move: -1 }) : undefined));
      peak = Math.min(peak, pl(w, 1).body.y);
      n++;
    } while (!pl(w, 1).body.grounded && n < 200);
    const tiles = (pl(w, 1).body.x - x0) / TILE;
    expect(tiles).toBeGreaterThan(6.5); // measured 7.3: the plan says about 6.6
    expect(tiles).toBeLessThan(8);
    expect(pl(w, 1).thrown).toBe(0);
    expect(pl(w, 1).body.y + 46).toBeCloseTo(12 * TILE, 0); // landed on the floor
    expect(w.players[1]!.body.y - peak).toBeGreaterThan(200); // it went up about 5 tiles first
  });
  it('A by the holder drops the teammate; A by the carried one frees it with a jump', () => {
    const w = setup();
    run(w, 1, B(0));
    run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 1).carriedBy).toBe(-1);
    expect(pl(w, 0).holding).toBe(null);
    const w2 = setup();
    run(w2, 1, B(0));
    const ev = run(w2, 1, (s) => (s === 1 ? inp({ jump: true }) : undefined));
    expect(pl(w2, 1).carriedBy).toBe(-1);
    expect(of(ev, 'obst.jump')).toEqual([{ player: 1, kind: 'ground' }]);
    expect(pl(w2, 1).body.vy).toBeLessThan(-500);
  });
  it('the weight of a carried player counts on a plate with its holder', () => {
    const lvl = level(draw(hall(), [10, GROUND, 'a'], ...vline(15, 8, 11, 'A')), {
      params: { a: { kind: 'plate', weight: 2, opens: 'A', latch: false }, A: { kind: 'gate' } },
    });
    const w = world(lvl, { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 10, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x + 30;
    run(w, 5);
    run(w, 1, B(0));
    run(w, 5);
    expect(w.ent.activators[0]!.load).toBe(2);
    expect(tile(w, 15, 9)).toBe(T.Object);
  });
});

describe('mano amiga (plan §5)', () => {
  // a block with its top on row 8 and its right edge at column 16
  const cliff = () => {
    const rows = hall().map((r, y) => (y >= 8 && y <= 11 ? r.slice(0, 5) + '#'.repeat(11) + r.slice(16) : r));
    return world(level(rows), { mode: 'free' });
  };
  it('a planted player at the edge catches a teammate falling beside it and lifts him onto the ledge in 0.4 s', () => {
    const w = cliff();
    teleport(w, 0, 15, 7);
    teleport(w, 1, 17, 3);
    const p0 = pl(w, 0).body;
    p0.x = 16 * TILE - 3;
    p0.facing = 1;
    run(w, 3);
    expect(p0.grounded).toBe(true);
    run(w, 1, B(0));
    expect(pl(w, 0).planted).toBe(true);
    let caught: ReturnType<typeof of<'obst.handCatch'>> = [];
    for (let i = 0; i < 80 && !caught.length; i++) caught = of(run(w, 1), 'obst.handCatch');
    expect(caught).toEqual([{ player: 0, target: 1 }]);
    expect(pl(w, 0).stats.catches).toBe(1);
    expect(pl(w, 1).lift).not.toBe(null);
    run(w, 25);
    expect(pl(w, 1).lift).toBe(null);
    run(w, 5);
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(pl(w, 1).body.y).toBeCloseTo(pl(w, 0).body.y, 0);
    expect(pl(w, 1).body.x).toBeLessThan(pl(w, 0).body.x); // behind the catcher, on the block
  });
  it('a teammate caught from BELOW the ledge is lifted up first and then across: it does not cut through the corner of the block and die crushed (level 1)', () => {
    // wall of 4 tiles (top on row 8) with its LEFT face at column 20; the catcher stands on its edge facing the void, the jumper rises beside the wall
    const rows = hall().map((r, y) => (y >= 8 && y <= 11 ? r.slice(0, 20) + '#'.repeat(20) + r.slice(40) : r));
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 21, 7);
    teleport(w, 1, 19, GROUND);
    const c = pl(w, 0).body;
    c.x = 20 * TILE - 6;
    c.facing = -1; // hanging 6 px over the edge, facing the void
    run(w, 3);
    run(w, 1, B(0));
    expect(pl(w, 0).planted).toBe(true);
    const t0 = w.tick;
    const ev = run(w, 140, (s, t) => (s === 1 && t === t0 + 2 ? inp({ jump: true }) : undefined)); // the jump from the floor ends in the sensor
    expect(of(ev, 'obst.handCatch')).toEqual([{ player: 0, target: 1 }]);
    expect(of(ev, 'obst.death')).toEqual([]);
    expect(pl(w, 1).stats.deaths).toBe(0);
    expect(pl(w, 1).mode).toBe('active');
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(pl(w, 1).body.y + 46).toBeCloseTo(8 * TILE, 0); // standing on the ledge
  });
  it('without planting there is no catch: the teammate just falls', () => {
    const w = cliff();
    teleport(w, 0, 15, 7);
    teleport(w, 1, 17, 3);
    pl(w, 0).body.x = 16 * TILE - 3;
    pl(w, 0).body.facing = 1;
    const ev = run(w, 120);
    expect(of(ev, 'obst.handCatch')).toEqual([]);
    expect(pl(w, 1).body.y).toBeGreaterThan(8 * TILE);
  });
  it('a teammate who is not falling inside the sensor is left alone', () => {
    const w = cliff();
    teleport(w, 0, 15, 7);
    teleport(w, 1, 24, GROUND);
    pl(w, 0).body.x = 16 * TILE - 3;
    pl(w, 0).body.facing = 1;
    run(w, 3);
    run(w, 1, B(0));
    expect(of(run(w, 60), 'obst.handCatch')).toEqual([]);
  });
});

describe('levers', () => {
  const lvl = (latch: boolean) =>
    level(draw(hall(), [10, GROUND, 'a'], ...vline(15, 8, 11, 'A')), {
      params: { a: { kind: 'lever', opens: 'A', latch }, A: { kind: 'gate' } },
    });
  it('holding the lever keeps the gate open; letting go closes it', () => {
    const w = world(lvl(false), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    expect(previewB(w, 0).action).toBe('grab');
    const ev = run(w, 1, B(0));
    expect(of(ev, 'obst.grab')).toEqual([{ player: 0, target: 'lever', targetId: 0 }]);
    run(w, 3);
    expect(tile(w, 15, 9)).toBe(T.Object);
    expect(obj(w, 'A').open).toBe(true);
    run(w, 1, B(0));
    run(w, 3);
    expect(tile(w, 15, 9)).toBe(T.Door);
  });
  it('a latched lever stays on after the player lets go', () => {
    const w = world(lvl(true), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    run(w, 1, B(0));
    run(w, 3);
    run(w, 1, B(0));
    run(w, 10);
    expect(tile(w, 15, 9)).toBe(T.Object);
  });
});

describe('A lets go of what the hands hold', () => {
  it('A with a box in the hands drops it and jumps', () => {
    const w = world(level(draw(hall(), [10, GROUND, 'x'])), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    run(w, 1, B(0));
    expect(pl(w, 0).holding?.kind).toBe('box');
    const ev = run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 0).holding).toBe(null);
    expect(w.ent.boxes[0]!.holders).toEqual([]);
    expect(names(ev)).toContain('obst.release');
    expect(of(ev, 'obst.jump')).toEqual([{ player: 0, kind: 'ground' }]);
  });
  it('dying drops everything: a carried teammate falls free, a held box is let go', () => {
    const w = world(level(draw(hall(), [14, 12, '^^^^'])), { mode: 'free', slots: [0, 1, 2] });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 10, GROUND);
    teleport(w, 2, 2, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x + 30;
    run(w, 5);
    run(w, 1, B(0));
    let died = 0;
    for (let i = 0; i < 100 && !died; i++)
      died = of(
        run(w, 1, (s) => (s === 0 ? inp({ move: 1 }) : undefined)),
        'obst.death',
      ).length;
    expect(died).toBe(1);
    expect(pl(w, 0).mode).toBe('dead');
    expect(pl(w, 1).carriedBy).toBe(-1);
    expect(pl(w, 0).holding).toBe(null);
  });
});
