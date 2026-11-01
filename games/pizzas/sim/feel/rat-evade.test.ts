// HAZARD_V2 rat, second defence (feel/rat-evade.ts): it bolts from a chef that closes in, it can be cornered or pinned, and the panting after a burst is the window.
import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, isFloor } from '../maps';
import { addPlayer, createGame, tick, type Controls, type Game } from '../overcooked';
import type { Rat } from '../rules/midround';

const RUN: Controls = { x: 1, y: 0, a: 0, b: false };
const LEFT: Controls = { x: -1, y: 0, a: 0, b: false };
const STAY: Controls = { x: 0, y: 0, a: 0, b: false };
// The first floor tile of the first map with free floor 4 tiles to its left and right and 2 above and below (an open spot).
function spot(g: Game): [number, number] {
  for (let y = 0; y < g.grid.length; y++)
    for (let x = 0; x < g.grid[0]!.length; x++)
      if (
        isFloor(g.grid, x, y) &&
        [
          [-4, 0],
          [-3, 0],
          [-2, 0],
          [-1, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
          [0, -2],
          [0, -1],
          [0, 1],
          [0, 2],
        ].every(([dx, dy]) => isFloor(g.grid, x + dx!, y + dy!))
      )
        return [x, y];
  throw new Error('no spot');
}
/** `chefs` chefs and a seeking rat on an open spot; `deadEnd` makes it a corridor closed on the right, open only to the left (where a chef will come from). */
function setup(chefs: number, deadEnd = false) {
  const m = FIXED_MAPS.find((mm) => {
    try {
      spot(createGame({ mapId: mm.id, rows: mm.rows, spawns: mm.spawns, n: 1, seed: 3, countdownMs: 0 }));
      return true;
    } catch {
      return false;
    }
  })!;
  const g = createGame({
    mapId: m.id,
    rows: m.rows,
    spawns: m.spawns,
    n: chefs,
    seed: 3,
    countdownMs: 0,
    events: true,
    magnet: true,
    difficulty: 'normal',
  });
  for (let i = 1; i <= chefs; i++) addPlayer(g, i, i - 1);
  const [x, y] = spot(g);
  if (deadEnd) {
    const wall = (dx: number, dy: number) => (g.grid[y + dy]![x + dx] = { ...g.grid[y + dy]![x + dx]!, kind: 'wall' } as never);
    wall(1, 0);
    for (let dx = -4; dx <= 1; dx++) for (const dy of [-1, 1]) wall(dx, dy);
  }
  const rat: Rat = {
    x: x + 0.5,
    y: y + 0.5,
    state: 'seek',
    item: null,
    from: -1,
    hole: [x, y],
    scared: false,
    idleMs: 0,
    born: g.time - 60_000,
    evadeCd: 0,
  };
  Object.assign(g.mid!, { kind: 'rat', phase: 'active', endAt: Infinity, startAt: 0, announceAt: 0, rat });
  return { g, rat, x: x + 0.5, y: y + 0.5 };
}
const put = (g: Game, id: number, x: number, y: number, item: NonNullable<ReturnType<Game['players']['get']>>['item'] = null) =>
  Object.assign(g.players.get(id)!, { x, y, vx: 0, vy: 0, item });
const run = (g: Game, ticks: number, ctl: Map<number, Controls>, until?: () => boolean) => {
  for (let i = 0; i < ticks && !(until && until()); i++) tick(g, ctl);
};

describe('rat evasion', () => {
  it('a chef running at it from open floor does not touch it: the rat bolts away (several tiles in a fraction of a second), then pants', () => {
    const { g, rat, x, y } = setup(1);
    put(g, 1, x - 3, y);
    let scared = false;
    g.bus.on('rat:scared', () => (scared = true));
    run(g, 120, new Map([[1, RUN]]), () => (rat.pantMs ?? 0) > 0);
    expect(scared).toBe(false);
    expect(rat.pantMs ?? 0).toBeGreaterThan(0); // a burst happened and it now pants
    expect(Math.hypot(rat.x - x, rat.y - y)).toBeGreaterThan(2.5);
  });
  it('cornered in a dead end it has nowhere to bolt: the chef running at it scares it', () => {
    const { g, rat, x, y } = setup(1, true);
    put(g, 1, x - 3, y);
    let scared = false;
    g.bus.on('rat:scared', () => (scared = true));
    run(g, 120, new Map([[1, RUN]]), () => scared);
    expect(rat.evadeCd ?? 0).toBe(0); // it never even tried
    expect(scared).toBe(true);
  });
  it('two chefs closing from opposite sides pin it: no burst, and the touch lands', () => {
    const { g, rat, x, y } = setup(2);
    put(g, 1, x - 3, y);
    put(g, 2, x + 3, y, 'raw0'); // hands full too
    let scared = false;
    g.bus.on('rat:scared', () => (scared = true));
    run(
      g,
      120,
      new Map([
        [1, RUN],
        [2, LEFT],
      ]),
      () => scared,
    );
    expect(scared).toBe(true);
  });
  it('panting is the window: a chef with full hands who runs into the panting rat catches it; the same chef against a rat that is not panting does not', () => {
    const outcome = (pantMs: number) => {
      const { g, rat, x, y } = setup(1);
      Object.assign(rat, { pantMs });
      put(g, 1, x - 1.6, y, 'raw0');
      let scared = false;
      g.bus.on('rat:scared', () => (scared = true));
      run(g, 30, new Map([[1, RUN]]));
      return scared;
    };
    expect(outcome(700)).toBe(true);
    expect(outcome(0)).toBe(false);
  });
  it('a chef standing still next to it does not provoke a burst (only a chef closing in does)', () => {
    const { g, rat, x, y } = setup(1);
    put(g, 1, x - 1, y);
    run(g, 20, new Map([[1, STAY]]));
    expect(rat.evadeCd ?? 0).toBe(0);
  });
});
