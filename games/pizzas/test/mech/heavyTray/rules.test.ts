// Rules of 'heavyTray': the carrier of a Bandeja plate walks at x0.45 without dash, a free-handed chef that presses A in front of it takes the other end (x1.0, average of the sticks, no collision, A lets go),
// a bridge step with the tray wears 3, the phone asks for help / says how to let go, and the whole thing is deterministic.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { phoneNoteOf } from '../../../sim/mech/phone';
import { BRIDGE_ROWS } from '../bridge/map';

const idle = new Map<number, Controls>();
const stick = (x: number, y = 0, a = 0): Controls => ({ x, y, a, b: false });
const make = (n = 2, mech: Record<string, boolean> = { heavyTray: true, bridge: true }): Game => {
  const g = createGame({ rows: BRIDGE_ROWS, n, mech, countdownMs: 0 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  g.teams[0]!.orders.push({ id: 900, expiresAt: 1e9, warned: false, recipe: 'bandeja', parts: ['marinara', 'marinara', 'marinara'] });
  g.players.get(1)!.item = 'dish'; // a plate of the open Bandeja: player 1 carries the tray
  return g;
};
const put = (g: Game, id: number, x: number, y: number, fx = 1) =>
  Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, fx, fy: 0 });
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const walkOf = (g: Game, id: number, c: Map<number, Controls>, k = 60) => {
  const x0 = g.players.get(id)!.x;
  run(g, k, c);
  return g.players.get(id)!.x - x0;
};

describe('mech.heavyTray', () => {
  it('the carrier walks at x0.45 of the free pace', () => {
    const free = make();
    free.players.get(1)!.item = null;
    put(free, 1, 2, 3);
    const slow = make();
    put(slow, 1, 2, 3);
    const go = new Map([[1, stick(1)]]);
    const dFree = walkOf(free, 1, go),
      dSlow = walkOf(slow, 1, go);
    expect(dSlow / dFree).toBeGreaterThan(0.42);
    expect(dSlow / dFree).toBeLessThan(0.48);
  });
  it('the carrier cannot dash; free-handed it can', () => {
    const g = make();
    put(g, 1, 2, 3);
    run(g, 2, new Map([[1, { x: 1, y: 0, a: 0, b: true }]]));
    expect(g.players.get(1)!.dashMs).toBe(0);
    const f = make();
    f.players.get(1)!.item = null;
    put(f, 1, 2, 3);
    run(f, 2, new Map([[1, { x: 1, y: 0, a: 0, b: true }]]));
    expect(f.players.get(1)!.dashMs).toBeGreaterThan(0);
  });
  it('a plate with no open Bandeja is not the tray: the chef walks free', () => {
    const g = make();
    g.teams[0]!.orders.length = 0;
    put(g, 1, 2, 3);
    const free = make();
    free.players.get(1)!.item = null;
    put(free, 1, 2, 3);
    const go = new Map([[1, stick(1)]]);
    expect(walkOf(g, 1, go)).toBeCloseTo(walkOf(free, 1, go), 5);
  });
  it('A in front of the carrier with empty hands couples; the pair moves at x1.0 along the average of the sticks; A lets go', () => {
    const g = make();
    put(g, 1, 4, 3);
    put(g, 2, 3, 3);
    run(g, 1, new Map([[2, stick(0, 0, 1)]]));
    expect(g.mech!.tray).toEqual({ carrier: 1, helper: 2 });
    const both = new Map([
      [1, stick(1)],
      [2, stick(1)],
    ]);
    const free = make();
    free.players.get(1)!.item = null;
    put(free, 1, 4, 3);
    expect(walkOf(g, 1, both, 20)).toBeCloseTo(walkOf(free, 1, new Map([[1, stick(1)]]), 20), 1); // x1.0, not x0.45
    const g2 = make();
    put(g2, 1, 4, 3);
    put(g2, 2, 3, 3);
    run(g2, 1, new Map([[2, stick(0, 0, 1)]]));
    const split = new Map([
      [1, stick(1, 1)],
      [2, stick(1, -1)],
    ]);
    const y0 = g2.players.get(1)!.y;
    run(g2, 10, split);
    expect(g2.players.get(1)!.y).toBeCloseTo(y0, 3); // the average of (1,1) and (1,-1) is (1,0)
    expect(g2.players.get(2)!.y).toBeCloseTo(g2.players.get(1)!.y, 3);
    run(g2, 1, new Map([[2, stick(0, 0, 1)]]));
    expect(g2.mech!.tray).toEqual({ carrier: 1, helper: null });
  });
  it('an A that is not in front of the carrier, or from a chef with a full hand, couples nothing', () => {
    const g = make(3);
    put(g, 1, 4, 3);
    put(g, 2, 3, 3, -1); // facing away
    put(g, 3, 6, 3, -1); // too far
    run(
      g,
      1,
      new Map([
        [2, stick(0, 0, 1)],
        [3, stick(0, 0, 1)],
      ]),
    );
    expect(g.mech!.tray!.helper).toBeNull();
    const h = make();
    put(h, 1, 4, 3);
    put(h, 2, 3, 3);
    h.players.get(2)!.item = 'raw0';
    run(h, 1, new Map([[2, stick(0, 0, 1)]]));
    expect(h.mech!.tray!.helper).toBeNull();
  });
  it('the helper does not collide with the carrier; apart, the two bodies do', () => {
    const g = make();
    put(g, 1, 4, 3);
    put(g, 2, 3.4, 3);
    run(g, 1, new Map([[2, stick(0, 0, 1)]]));
    put(g, 2, 4.2, 3); // on top of the carrier
    const d = () => Math.hypot(g.players.get(1)!.x - g.players.get(2)!.x, g.players.get(1)!.y - g.players.get(2)!.y);
    run(g, 5);
    expect(d()).toBeLessThan(0.5);
    const free = make();
    free.players.get(1)!.item = null;
    put(free, 1, 4, 3);
    put(free, 2, 4.2, 3);
    run(free, 5);
    expect(Math.hypot(free.players.get(1)!.x - free.players.get(2)!.x, free.players.get(1)!.y - free.players.get(2)!.y)).toBeGreaterThan(
      0.6,
    );
  });
  it('the pair breaks when the carrier loses the plate or the helper falls too far behind', () => {
    const g = make();
    put(g, 1, 4, 3);
    put(g, 2, 3, 3);
    run(g, 1, new Map([[2, stick(0, 0, 1)]]));
    g.players.get(1)!.item = null;
    run(g, 1);
    expect(g.mech!.tray).toEqual({ carrier: null, helper: null });
    const h = make();
    put(h, 1, 4, 3);
    put(h, 2, 3, 3);
    run(h, 1, new Map([[2, stick(0, 0, 1)]]));
    put(h, 2, 1, 6);
    run(h, 1);
    expect(h.mech!.tray!.helper).toBeNull();
  });
  it('a step onto a bridge with the tray wears it 3; a free chef, 1', () => {
    const B = 2 * 16 + 7;
    const g = make(1);
    put(g, 1, 6, 2);
    run(g, 2);
    put(g, 1, 7, 2);
    run(g, 5);
    expect(g.mech!.bridge![B]!.uses).toBe(3);
    const f = make(1);
    f.players.get(1)!.item = null;
    put(f, 1, 6, 2);
    run(f, 2);
    put(f, 1, 7, 2);
    run(f, 5);
    expect(f.mech!.bridge![B]!.uses).toBe(1);
  });
  it('the phone asks the carrier for help, tells the helper how to let go, and stays quiet otherwise', () => {
    const g = make(3);
    put(g, 1, 4, 3);
    put(g, 2, 3, 3);
    run(g, 1);
    expect(phoneNoteOf(g, g.players.get(1)!)).toMatchObject({ label: 'Pide ayuda', key: 'tray-help' });
    expect(phoneNoteOf(g, g.players.get(2)!)).toBeNull();
    run(g, 1, new Map([[2, stick(0, 0, 1)]]));
    expect(phoneNoteOf(g, g.players.get(1)!)).toBeNull();
    expect(phoneNoteOf(g, g.players.get(2)!)).toMatchObject({ label: 'A para soltar', key: 'tray-helper' });
    expect(phoneNoteOf(g, g.players.get(3)!)).toBeNull();
  });
  it('is deterministic: two runs of the same walk give the same fingerprint, and state is integers of chef ids', () => {
    const hash = () => {
      const g = make(2);
      put(g, 1, 4, 3);
      put(g, 2, 3, 3);
      run(g, 1, new Map([[2, stick(0, 0, 1)]]));
      run(
        g,
        300,
        new Map([
          [1, stick(1, 0.3)],
          [2, stick(0.5, -1)],
        ]),
      );
      return [g.mech!.hash, g.mech!.tray];
    };
    expect(hash()).toEqual(hash());
  });
});
