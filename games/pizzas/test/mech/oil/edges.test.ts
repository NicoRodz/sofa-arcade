// Exact-tick boundaries of 'oil': the sauce pot spill (SAUCE_WAIT) and the wiping with B (WIPE_OIL, WIPE_FIRE). One tick before nothing happens, on the threshold tick it does.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { FIRE, FIRE_TICKS, OIL, SAUCE_WAIT, WIPE_FIRE, WIPE_OIL, at, setTile } from '../../../sim/mech/oil/state';
import { OIL_ROWS } from './map';

const idle = new Map<number, Controls>();
const hold = new Map<number, Controls>([[1, { x: 0, y: 0, a: 0, b: true }]]);
const make = (): Game => {
  const g = createGame({ rows: OIL_ROWS, n: 1, mech: { oil: true, sprinkler: true }, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  return g;
};
const face = (g: Game, x: number, y: number, fx: number, fy: number) => Object.assign(g.players.get(1)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, fx, fy });
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const idx = (x: number, y: number) => y * 16 + x;

describe('mech.oil exact thresholds', () => {
  it('a ready sauce pot spills on tick SAUCE_WAIT, not on SAUCE_WAIT - 1', () => {
    const g = make();
    g.stations.find((s) => s.kind === 'saucepot')!.done = true;
    run(g, SAUCE_WAIT - 1);
    expect(at(g, idx(7, 4))).toBe(0);
    run(g, 1);
    expect(at(g, idx(7, 4))).toBe(OIL);
  });
  it('B held WIPE_OIL ticks wipes an oil tile; WIPE_OIL - 1 does not', () => {
    const g = make();
    face(g, 9, 3, 0, -1);
    run(g, WIPE_OIL - 1, hold);
    expect(at(g, idx(9, 2))).toBe(OIL);
    run(g, 1, hold);
    expect(at(g, idx(9, 2))).toBe(0);
  });
  it('B held WIPE_FIRE ticks puts out a fire tile; WIPE_FIRE - 1 does not', () => {
    const g = make();
    setTile(g, idx(10, 3), FIRE, FIRE_TICKS);
    face(g, 10, 2, 0, 1);
    run(g, WIPE_FIRE - 1, hold);
    expect(at(g, idx(10, 3))).toBe(FIRE);
    run(g, 1, hold);
    expect(at(g, idx(10, 3))).toBe(0);
  });
});
