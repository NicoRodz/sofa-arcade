// Rules of 'bridge': steps wear it, it cracks at 4, breaks at 6 once empty, is a wall for 1200 ticks and mends itself; a chef on it never falls.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { BRIDGE_MEND_TICKS, wear } from '../../../sim/mech/bridge/module';
import { BRIDGE_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (n = 1): Game => {
  const g = createGame({ rows: BRIDGE_ROWS, n, mech: { bridge: true }, countdownMs: 0 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
const put = (g: Game, id: number, x: number, y: number) => Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const B = 2 * 16 + 7; // the bridge at (7, 2)

describe('mech.bridge', () => {
  it('each step onto it adds 1 wear, standing still adds nothing', () => {
    const g = make();
    put(g, 1, 6, 2);
    run(g, 2);
    put(g, 1, 7, 2);
    run(g, 30);
    expect(g.mech!.bridge![B]!.uses).toBe(1);
    put(g, 1, 6, 2);
    run(g, 2);
    put(g, 1, 7, 2);
    run(g, 2);
    expect(g.mech!.bridge![B]!.uses).toBe(2);
  });
  it('at 6 it holds while a chef stands on it, and breaks the moment it is empty', () => {
    const g = make();
    put(g, 1, 7, 2);
    run(g, 2);
    wear(g, B, 6);
    run(g, 30);
    expect(g.mech!.bridge![B]!.brokenUntil).toBe(0);
    put(g, 1, 6, 2);
    run(g, 2);
    expect(g.mech!.bridge![B]!.brokenUntil).toBeGreaterThan(0);
  });
  it('a broken bridge is a wall; it mends after 1200 ticks with its wear cleared', () => {
    const g = make();
    wear(g, B, 6);
    put(g, 1, 5, 2);
    run(g, 2);
    const right = new Map<number, Controls>([[1, { x: 1, y: 0, a: 0, b: false }]]);
    run(g, 90, right);
    expect(g.players.get(1)!.x).toBeLessThan(7);
    run(g, BRIDGE_MEND_TICKS);
    expect(g.mech!.bridge![B]).toEqual({ uses: 0, brokenUntil: 0 });
    run(g, 90, right);
    expect(g.players.get(1)!.x).toBeGreaterThan(7);
  });
  it('is deterministic: two runs of the same walk give the same fingerprint', () => {
    const hash = () => {
      const g = make(2);
      const go = new Map<number, Controls>([[1, { x: 1, y: 0, a: 0, b: false }], [2, { x: -1, y: 0, a: 0, b: false }]]);
      put(g, 1, 5, 2);
      put(g, 2, 9, 3);
      run(g, 400, go);
      return g.mech!.hash;
    };
    expect(hash()).toBe(hash());
  });
});
