// Rules of 'oneWay': a > tile is entered only moving right; leaving is free; the other three senses are the same turned.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { ONEWAY_ROWS } from './map';

const make = (rows: readonly string[] = ONEWAY_ROWS): Game => {
  const g = createGame({ rows, n: 1, mech: { oneWay: true }, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  return g;
};
const put = (g: Game, x: number, y: number) => Object.assign(g.players.get(1)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });
const walk = (g: Game, x: number, y: number, k = 60) => {
  const c = new Map<number, Controls>([[1, { x, y, a: 0, b: false }]]);
  for (let i = 0; i < k; i++) tick(g, c);
};

describe('mech.oneWay', () => {
  it('enters a > tile going right and is stopped going left', () => {
    const g = make();
    put(g, 3, 4);
    walk(g, 1, 0);
    expect(g.players.get(1)!.x).toBeGreaterThan(5);
    const h = make();
    put(h, 13, 4);
    walk(h, -1, 0);
    expect(h.players.get(1)!.x).toBeGreaterThanOrEqual(12); // the last > is at x = 11: it cannot be entered from the right
  });
  it('can step into a > tile from below only if it moves right: from the side it is a wall', () => {
    const g = make();
    put(g, 6, 3);
    walk(g, 0, 1);
    expect(g.players.get(1)!.y).toBeLessThan(4);
  });
  it('leaving is free: a chef standing on > can walk off sideways or back', () => {
    const g = make();
    put(g, 6, 4);
    walk(g, 0, -1);
    expect(g.players.get(1)!.y).toBeLessThan(4);
  });
  it('< is the mirror: entered going left only', () => {
    const g = make();
    put(g, 3, 5);
    walk(g, 1, 0);
    expect(g.players.get(1)!.x).toBeLessThan(4);
    const h = make();
    put(h, 13, 5);
    walk(h, -1, 0);
    expect(h.players.get(1)!.x).toBeLessThan(11); // walks the whole < lane
  });
  it('the same map without the flag is a load error: the letters are never floor in silence', () => {
    expect(() => createGame({ rows: ONEWAY_ROWS, n: 1, countdownMs: 0 })).toThrow(/mech.oneWay/);
  });
});
