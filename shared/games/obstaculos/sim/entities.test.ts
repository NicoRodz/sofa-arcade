import { describe, expect, it } from 'vitest';
import { PLAYER_H, TILE } from '../constants';
import { T } from '../legend';
import { requiredWeight } from './entities';
import { draw, hall, inp, level, names, obj, of, pl, run, teleport, tile, vline, world } from './testkit';

const GROUND = 11; // hall(60, 14): floor top on row 12, so feet on the bottom of row 11
const gateLevel = (latch: boolean, weight: number | 'all' = 1) =>
  level(draw(hall(), [10, GROUND, 'a'], ...vline(15, 8, 11, 'A')), {
    params: { a: { kind: 'plate', weight, opens: 'A', latch }, A: { kind: 'gate' } },
  });

describe('plate weights', () => {
  it('half-up / half-down / all / all-but-1 / number, resolved with the connected players', () => {
    const t = (n: number) => (['half-up', 'half-down', 'all', 'all-but-1', 3] as const).map((w) => requiredWeight(w, n));
    expect(t(5)).toEqual([3, 2, 5, 4, 3]);
    expect(t(4)).toEqual([2, 2, 4, 3, 3]);
    expect(t(2)).toEqual([1, 1, 2, 1, 2]); // never 0, and a number is capped at the players there are
    expect(t(1)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('plates and gates', () => {
  it('standing on the plate opens the gate (tile Door -> Object, event), stepping off closes it', () => {
    const w = world(gateLevel(false), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 8, GROUND);
    expect(tile(w, 15, 9)).toBe(T.Door);
    const ev = run(w, 10);
    expect(of(ev, 'obst.plate')).toEqual([{ id: 'a', pressed: true, weight: 1 }]);
    expect(of(ev, 'obst.gate')).toEqual([{ id: 'A', open: true }]);
    expect(tile(w, 15, 9)).toBe(T.Object);
    const ev2 = run(w, 10, (s) => (s === 0 ? inp({ move: -1 }) : undefined));
    expect(of(ev2, 'obst.gate')).toEqual([{ id: 'A', open: false }]);
    expect(tile(w, 15, 9)).toBe(T.Door);
  });
  it('a closed gate blocks walking; an open one lets a second player through', () => {
    const w = world(gateLevel(false), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 8, GROUND);
    run(w, 5);
    run(w, 120, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 1).body.x).toBeGreaterThan(15 * TILE + 10); // went through the open gate
    const w2 = world(gateLevel(false), { mode: 'free' });
    teleport(w2, 1, 12, GROUND);
    teleport(w2, 0, 2, GROUND);
    run(w2, 120, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    expect(pl(w2, 1).body.x).toBeLessThan(15 * TILE - 30); // stopped by the closed gate
  });
  it('latch: the gate stays open after the plate is released', () => {
    const w = world(gateLevel(true), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 10);
    run(w, 30, (s) => (s === 0 ? inp({ move: -1 }) : undefined));
    expect(pl(w, 0).body.x).toBeLessThan(9 * TILE);
    expect(tile(w, 15, 9)).toBe(T.Object);
    expect(obj(w, 'A').open).toBe(true);
  });
  it('a gate never closes on somebody: it waits until the doorway is empty', () => {
    const w = world(gateLevel(false), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 15, GROUND);
    run(w, 10);
    expect(obj(w, 'A').open).toBe(true);
    run(w, 30, (s) => (s === 0 ? inp({ move: -1 }) : undefined)); // plate released, P1 still in the doorway
    expect(obj(w, 'A').open).toBe(true);
    expect(pl(w, 1).mode).toBe('active');
    run(w, 40, (s) => (s === 1 ? inp({ move: 1 }) : undefined)); // P1 leaves
    expect(obj(w, 'A').open).toBe(false);
    expect(tile(w, 15, 9)).toBe(T.Door);
  });
  it('a tower counts: weight 2 needs the second player standing on the first one’s head', () => {
    const w = world(gateLevel(false, 2), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 6, GROUND);
    run(w, 10);
    expect(w.ent.activators[0]!.load).toBe(1);
    expect(w.ent.activators[0]!.pressed).toBe(false);
    teleport(w, 1, 10, GROUND - 2); // right above P0's head
    pl(w, 1).body.x = pl(w, 0).body.x;
    run(w, 25);
    expect(pl(w, 1).body.supportId).toBe(0);
    expect(w.ent.activators[0]!.load).toBe(2);
    expect(w.ent.activators[0]!.pressed).toBe(true);
    expect(tile(w, 15, 9)).toBe(T.Object);
  });
  it('"all" counts the connected players, not the slots: 3 connected need 3 on the plate', () => {
    const lvl = level(draw(hall(), [10, GROUND, 'aaa'], ...vline(15, 8, 11, 'A')), {
      params: { a: { kind: 'plate', weight: 'all', opens: 'A', latch: false }, A: { kind: 'gate' } },
    });
    const w = world(lvl, { mode: 'free', slots: [0, 3, 6] });
    teleport(w, 0, 10, GROUND);
    teleport(w, 3, 11, GROUND);
    teleport(w, 6, 3, GROUND);
    run(w, 10);
    expect(w.ent.activators[0]!.required).toBe(3);
    expect(w.ent.activators[0]!.pressed).toBe(false);
    teleport(w, 6, 12, GROUND);
    run(w, 10);
    expect(w.ent.activators[0]!.pressed).toBe(true);
  });
});

describe('movers and balance', () => {
  const moverLevel = (opener: boolean) =>
    level(draw(hall(), [10, 8, 'AAA'], ...(opener ? ([[3, GROUND, 'a']] as [number, number, string][]) : [])), {
      params: {
        A: { kind: 'mover', dx: 6, dy: 0, periodSec: 4 },
        ...(opener ? { a: { kind: 'plate', weight: 1, opens: 'A', latch: true } } : {}),
      },
    });
  it('a mover carries whoever stands on it: half a period later it is 6 tiles over and so is the rider', () => {
    const w = world(moverLevel(false), { mode: 'free' });
    teleport(w, 0, 11, 7);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    expect(pl(w, 0).body.supportId).toBe(200);
    const x0 = pl(w, 0).body.x;
    run(w, 115); // 2 s after the start, counting the 5 steps above
    expect(obj(w, 'A').ox).toBeCloseTo(6 * TILE, 0);
    expect(pl(w, 0).body.x - x0).toBeGreaterThan(6 * TILE - 12);
    expect(pl(w, 0).body.supportId).toBe(200);
    expect(pl(w, 0).body.grounded).toBe(true);
  });
  it('a mover with an opener stays put until it is opened', () => {
    const w = world(moverLevel(true), { mode: 'free' });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 15, GROUND);
    run(w, 60);
    expect(obj(w, 'A').ox).toBe(0);
    teleport(w, 1, 3, GROUND);
    run(w, 60);
    expect(obj(w, 'A').ox).toBeGreaterThan(10);
  });
  const balance = () =>
    level(draw(hall(), [10, 8, 'DDD'], [20, 8, 'EEE']), {
      tether: 'freeOnly',
      params: { D: { kind: 'balance', partner: 'E', travel: 3, speed: 1.2 }, E: { kind: 'balance', partner: 'D', travel: 3, speed: 1.2 } },
    });
  it('balance: moves only when both plates carry weight, the heavier side goes down at speed tiles/s, the other goes up', () => {
    const w = world(balance(), { mode: 'free', slots: [0, 1, 2] });
    teleport(w, 0, 11, 7);
    teleport(w, 1, 21, 7);
    teleport(w, 2, 30, GROUND);
    run(w, 60);
    expect(obj(w, 'D').load).toBe(1);
    expect(obj(w, 'E').load).toBe(1);
    expect(obj(w, 'D').oy).toBe(0); // equal weights: nothing
    teleport(w, 2, 10, 7); // joins D
    pl(w, 2).body.x = pl(w, 0).body.x + 30;
    run(w, 60);
    expect(obj(w, 'D').load).toBe(2);
    expect(obj(w, 'D').oy).toBeGreaterThan(1.2 * TILE * 0.7);
    expect(obj(w, 'D').oy).toBeLessThan(1.2 * TILE * 1.3);
    expect(obj(w, 'E').oy).toBeCloseTo(-obj(w, 'D').oy, 6);
    run(w, 240);
    expect(obj(w, 'D').oy).toBe(3 * TILE); // end of travel
    expect(obj(w, 'E').oy).toBe(-3 * TILE);
  });
  it('balance with one side empty does not move', () => {
    const w = world(balance(), { mode: 'free', slots: [0, 1] });
    teleport(w, 0, 11, 7);
    teleport(w, 1, 5, GROUND);
    run(w, 120);
    expect(obj(w, 'D').load).toBe(1);
    expect(obj(w, 'D').oy).toBe(0);
  });
});

describe('crumbling tiles and belts', () => {
  it('a crumble tile stands 0.5 s after the first step on it, disappears, and is back 3 s later', () => {
    const w = world(level(draw(hall(), [10, 9, '!!!'])), { mode: 'free', slots: [0, 1] });
    teleport(w, 0, 11, 8);
    teleport(w, 1, 2, GROUND);
    run(w, 8); // lands
    expect(tile(w, 11, 9)).toBe(T.Crumble);
    expect(w.ent.crumbles[1]!.state).toBe(1);
    run(w, 20);
    expect(tile(w, 11, 9)).toBe(T.Crumble); // 28 steps after landing: not yet
    run(w, 6);
    expect(tile(w, 11, 9)).toBe(T.Empty);
    expect(pl(w, 0).body.grounded).toBe(false);
    run(w, 170);
    expect(tile(w, 11, 9)).toBe(T.Empty);
    run(w, 30);
    expect(tile(w, 11, 9)).toBe(T.Crumble);
  });
  it('a crumble tile does not come back under somebody', () => {
    const w = world(level(draw(hall(), [10, 9, '!!!'])), { mode: 'free', slots: [0, 1] });
    teleport(w, 0, 11, 8);
    teleport(w, 1, 2, GROUND);
    run(w, 60);
    teleport(w, 0, 11, 8); // keep P0 inside the gap while the timer runs out
    run(w, 1);
    for (let i = 0; i < 250; i++) {
      const p = pl(w, 0).body;
      p.x = 11 * TILE + 7;
      p.y = 9 * TILE;
      p.vy = 0;
      run(w, 1);
      if (tile(w, 11, 9) === T.Crumble) break;
    }
    expect(tile(w, 11, 9)).toBe(T.Empty);
  });
  it('a belt carries whoever stands on it at 120 px/s', () => {
    const rows = hall();
    rows[12] = rows[12]!.slice(0, 10) + '>>>>>>>>>>' + rows[12]!.slice(20);
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 11, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 10);
    const x0 = pl(w, 0).body.x;
    run(w, 60);
    expect(pl(w, 0).body.x - x0).toBeGreaterThan(110);
    expect(pl(w, 0).body.x - x0).toBeLessThan(130);
    const w2 = world(level(rows.map((r, i) => (i === 12 ? r.replace(/>/g, '<') : r))), { mode: 'free' });
    teleport(w2, 0, 15, GROUND);
    teleport(w2, 1, 2, GROUND);
    run(w2, 10);
    const y0 = pl(w2, 0).body.x;
    run(w2, 60);
    expect(y0 - pl(w2, 0).body.x).toBeGreaterThan(110);
  });
});

describe('boxes and keys', () => {
  it('a box falls to the floor; a heavy one too', () => {
    const w = world(level(draw(hall(), [10, 5, 'x'], [14, 5, 'X'])), { mode: 'free' });
    run(w, 90);
    for (const b of w.ent.boxes) {
      expect(b.grounded).toBe(true);
      expect(b.y + 44).toBeCloseTo(12 * TILE, 5);
    }
    expect(w.ent.boxes.map((b) => b.heavy)).toEqual([false, true]);
  });
  it('B next to a box grabs it, it follows in front of the player, B again lets it drop', () => {
    const w = world(level(draw(hall(), [10, GROUND, 'x'])), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    const ev = run(w, 1, (s) => (s === 0 ? inp({ grab: true }) : undefined));
    expect(of(ev, 'obst.grab')).toEqual([{ player: 0, target: 'box', targetId: 100 }]);
    const x0 = w.ent.boxes[0]!.x;
    run(w, 40, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(w.ent.boxes[0]!.x - x0).toBeGreaterThan(100);
    expect(w.ent.boxes[0]!.x).toBeGreaterThan(pl(w, 0).body.x); // in front
    const ev2 = run(w, 1, (s) => (s === 0 ? inp({ grab: true }) : undefined));
    expect(names(ev2)).toContain('obst.release');
    expect(w.ent.boxes[0]!.holders).toEqual([]);
  });
  it('the heavy box does not move with one holder; with two it follows the first', () => {
    const w = world(level(draw(hall(), [10, GROUND, 'X'])), { mode: 'free', slots: [0, 1, 2] });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 11, GROUND);
    teleport(w, 2, 2, GROUND);
    run(w, 5);
    run(w, 1, (s) => (s === 0 ? inp({ grab: true }) : undefined));
    const x0 = w.ent.boxes[0]!.x;
    run(w, 4, (s) => (s === 0 ? inp({ move: -1 }) : undefined));
    expect(w.ent.boxes[0]!.x).toBe(x0); // one holder: the box stays, the player is dragged along by its grip only up to a point
    run(w, 1, (s) => (s === 1 ? inp({ grab: true }) : undefined));
    expect(w.ent.boxes[0]!.holders).toEqual([0, 1]);
    run(w, 10, (s) => (s === 0 ? inp({ move: -1 }) : undefined));
    expect(w.ent.boxes[0]!.x).toBeLessThan(x0 - 20); // two holders: it follows the first
  });
  it('a player standing on a box stands on it (one-way top)', () => {
    const w = world(level(draw(hall(), [10, GROUND, 'x'])), { mode: 'free' });
    teleport(w, 0, 10, GROUND - 2);
    teleport(w, 1, 2, GROUND);
    run(w, 30);
    expect(pl(w, 0).body.supportId).toBe(100);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(12 * TILE - 44, 0);
  });
  it('a key picked up opens the whole door it touches and is used up; without it the door holds', () => {
    const rows = draw(hall(), [10, GROUND, 'k'], ...vline(20, 8, 11, 'K'));
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 1, 15, GROUND);
    teleport(w, 0, 9, GROUND);
    run(w, 90, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 1).body.x).toBeLessThan(20 * TILE - 30); // P1 has no key and is stopped
    expect(tile(w, 20, 9)).toBe(T.Door);
    const ev = run(w, 120, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(w.ent.keys[0]!.used).toBe(true);
    for (const y of [8, 9, 10, 11]) expect(tile(w, 20, y)).toBe(T.Empty);
    expect(of(ev, 'obst.gate')).toEqual([{ id: 'door:20,8', open: true }]);
  });
  it('a key whose holder dies goes back home', () => {
    const rows = draw(hall(), [10, GROUND, 'k'], [14, 12, '^^^^']);
    const w = world(level(rows), { mode: 'free' });
    teleport(w, 0, 9, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 40, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(w.ent.keys[0]!.heldBy).toBe(0);
    run(w, 80, (s) => (s === 0 ? inp({ move: 1 }) : undefined));
    expect(pl(w, 0).stats.deaths).toBeGreaterThan(0);
    expect(w.ent.keys[0]!.heldBy).toBe(-1);
    expect([w.ent.keys[0]!.x, w.ent.keys[0]!.y]).toEqual([w.ent.keys[0]!.homeX, w.ent.keys[0]!.homeY]);
  });
});

describe('hazards', () => {
  const lava = (extra: Partial<Parameters<typeof level>[1]> = {}) => level(hall(), { hazard: { kind: 'risingLava', speed: 1 }, ...extra });
  it('rising lava climbs at its speed (x difficulty) and kills what it reaches', () => {
    const w = world(lava(), { mode: 'free' });
    run(w, 60);
    expect(w.ent.hazard!.pos).toBeCloseTo(14 * TILE - TILE, 3);
    const ev = run(w, 120);
    expect(of(ev, 'obst.death').map((d) => d.cause)).toEqual(['hazard', 'hazard']);
    const e = world(lava(), { mode: 'free', difficulty: 'easy' });
    run(e, 60);
    expect(e.ent.hazard!.pos).toBeCloseTo(14 * TILE - 0.7 * TILE, 3);
  });
  it('a checkpoint freezes the lava for 3 s', () => {
    const w = world(lava({ rows: draw(hall(), [20, GROUND, 'P']) }), { mode: 'free' });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 19, GROUND);
    run(w, 3);
    const pos = w.ent.hazard!.pos;
    run(w, 170);
    expect(w.ent.hazard!.pos).toBe(pos);
    run(w, 30);
    expect(w.ent.hazard!.pos).toBeLessThan(pos);
  });
  it('avalanche: a wall from the left at speed tiles/s kills whoever it overtakes, and only then', () => {
    const w = world(level(hall(), { hazard: { kind: 'avalanche', speed: 2 } }), { mode: 'free' });
    expect(of(run(w, 90), 'obst.death')).toEqual([]); // 1.5 s: the wall is still off screen at x = -4 + 3 tiles
    expect(w.ent.hazard!.pos).toBeCloseTo(-4 * TILE + 3 * TILE, 3);
    let ev: ReturnType<typeof run> = [];
    for (let i = 0; i < 200 && !of(ev, 'obst.death').length; i++) ev = run(w, 1);
    const dead = of(ev, 'obst.death');
    expect(dead.map((d) => d.cause)).toEqual(['hazard']);
    expect(Math.abs(w.ent.hazard!.pos - (pl(w, dead[0]!.player).body.x + 17))).toBeLessThan(5); // it killed him the step it reached him
  });
  it('tide: the level oscillates between the bottom and speed x 4 s above it, period 8 s', () => {
    const w = world(level(hall(), { hazard: { kind: 'tide', speed: 0.5 } }), { mode: 'free' });
    run(w, 4 * 60);
    expect(w.ent.hazard!.pos).toBeCloseTo(14 * TILE - 2 * TILE, 0);
    run(w, 4 * 60);
    expect(w.ent.hazard!.pos).toBeCloseTo(14 * TILE, 0);
  });
});

describe('ladders', () => {
  it('up on a ladder climbs at 170 px/s with no gravity; A jumps off', () => {
    const w = world(level(draw(hall(), ...vline(10, 3, GROUND, '|'))), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 2, GROUND);
    run(w, 5);
    const y0 = pl(w, 0).body.y;
    run(w, 60, (s) => (s === 0 ? inp({ up: true }) : undefined));
    expect(y0 - pl(w, 0).body.y).toBeGreaterThan(160);
    expect(y0 - pl(w, 0).body.y).toBeLessThan(180);
    expect(pl(w, 0).climbing).toBe(true);
    const yHang = pl(w, 0).body.y;
    run(w, 30);
    expect(pl(w, 0).body.y).toBe(yHang); // hangs: no gravity
    run(w, 1, (s) => (s === 0 ? inp({ jump: true }) : undefined));
    expect(pl(w, 0).climbing).toBe(false);
    expect(pl(w, 0).body.vy).toBeLessThan(-500);
  });
  it('down on a ladder reaches the floor and stops climbing there', () => {
    const w = world(level(draw(hall(), ...vline(10, 3, GROUND, '|'))), { mode: 'free' });
    teleport(w, 0, 10, 6);
    teleport(w, 1, 2, GROUND);
    run(w, 100, (s) => (s === 0 ? inp({ down: true }) : undefined));
    expect(pl(w, 0).climbing).toBe(false);
    expect(pl(w, 0).body.grounded).toBe(true);
    expect(pl(w, 0).body.y + PLAYER_H).toBeCloseTo(12 * TILE, 0);
  });
  it('a ladder objective appears when its plate is pressed (latched) and not before', () => {
    const lvl = level(draw(hall(), [4, GROUND, 'c'], ...vline(10, 4, GROUND, 'F')), {
      params: { c: { kind: 'plate', weight: 1, opens: 'F', latch: true }, F: { kind: 'ladder' } },
    });
    const w = world(lvl, { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 8, GROUND);
    expect(tile(w, 10, 8)).toBe(T.Object);
    run(w, 20, (s) => (s === 0 ? inp({ up: true }) : undefined));
    expect(pl(w, 0).climbing).toBe(false); // nothing to climb yet
    teleport(w, 1, 4, GROUND);
    run(w, 10);
    expect(tile(w, 10, 8)).toBe(T.Ladder);
    run(w, 40, (s) => (s === 0 ? inp({ up: true }) : undefined));
    expect(pl(w, 0).climbing).toBe(true);
  });
});
