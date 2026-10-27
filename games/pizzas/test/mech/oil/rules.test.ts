// Rules of 'oil': friction, drips, the sauce pot, fire (the oven lights the oil, it hops every 45, a burning tile is a wall for 360), the wiping with B, and the Derrame event.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import type { MechOpts } from '../../../sim/mech/ids';
import { mechOnFire } from '../../../sim/mech/loop';
import { DRIP_EVERY, FIRE, FIRE_TICKS, OIL, OIL_TICKS, SAUCE_WAIT, WATER, WIPE_OIL, at, setTile } from '../../../sim/mech/oil/state';
import { SPILL_PATCHES, spill } from '../../../sim/mech/oil/spill';
import { eventPool } from '../../../sim/midround';
import { mulberry32 } from '@pichi/core/rng';
import { OIL_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (mech: MechOpts = { oil: true, sprinkler: true }, n = 1): Game => {
  const g = createGame({ rows: OIL_ROWS, n, mech, countdownMs: 0 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
const put = (g: Game, x: number, y: number, fx = 1, fy = 0) =>
  Object.assign(g.players.get(1)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, fx, fy });
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const idx = (x: number, y: number) => y * 16 + x;
const oven = (g: Game) => g.stations.find((s) => s.kind === 'pot')!;

describe('mech.oil friction and the map', () => {
  it('the puddle a is oil from the start and never dries', () => {
    const g = make();
    expect(at(g, idx(9, 2))).toBe(OIL);
    run(g, OIL_TICKS + 10);
    expect(at(g, idx(9, 2))).toBe(OIL);
  });
  it('a chef who lets go of the stick keeps sliding on oil and stops short on dry floor', () => {
    const slide = (oily: boolean) => {
      const g = make();
      if (oily) for (let x = 1; x < 15; x++) setTile(g, idx(x, 6), OIL, 0);
      put(g, 1, 6);
      run(g, 20, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
      const x0 = g.players.get(1)!.x;
      run(g, 30);
      return g.players.get(1)!.x - x0;
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 2);
  });
});

describe('mech.oil sources', () => {
  it('the drip g oils a neighbour every 720 ticks in the order N, E, S, O', () => {
    const g = make();
    run(g, DRIP_EVERY);
    expect(at(g, idx(4, 2))).toBe(OIL);
    run(g, DRIP_EVERY);
    expect(at(g, idx(5, 3))).toBe(OIL);
    run(g, DRIP_EVERY);
    expect(at(g, idx(4, 4))).toBe(OIL);
    run(g, DRIP_EVERY);
    expect(at(g, idx(3, 3))).toBe(OIL);
  });
  it('a drop dries after 1800 ticks', () => {
    const g = make();
    run(g, DRIP_EVERY);
    run(g, OIL_TICKS - 3);
    expect(at(g, idx(4, 2))).toBe(OIL);
    run(g, 4);
    expect(at(g, idx(4, 2))).toBe(0);
  });
  it('a ready sauce pot nobody empties oils its four neighbours after 480 ticks', () => {
    const g = make();
    const r = g.stations.find((s) => s.kind === 'saucepot')!;
    r.done = true;
    run(g, SAUCE_WAIT - 2);
    expect(at(g, idx(7, 4))).toBe(0);
    run(g, 4);
    for (const [x, y] of [
      [7, 4],
      [8, 5],
      [7, 6],
      [6, 5],
    ] as const)
      expect(at(g, idx(x, y))).toBe(OIL);
    r.done = false;
    run(g, 2);
    r.done = true; // a new batch starts the clock again
    run(g, 5);
    expect(g.mech!.ext!.oil).toBeTruthy();
  });
});

describe('mech.oil fire', () => {
  const lit = () => {
    const g = make();
    for (const x of [10, 11, 12]) setTile(g, idx(x, 3), OIL, OIL_TICKS);
    mechOnFire(g, oven(g), 'start');
    return g;
  };
  it('an oven on fire lights the oil next to it, and the flame hops to the next oil every 45 ticks', () => {
    const g = lit();
    expect(at(g, idx(10, 3))).toBe(FIRE);
    expect(at(g, idx(11, 3))).toBe(OIL);
    run(g, 45);
    expect(at(g, idx(11, 3))).toBe(FIRE);
    run(g, 45);
    expect(at(g, idx(12, 3))).toBe(FIRE);
  });
  it('a burning tile is a wall; it burns out clean after 360 ticks', () => {
    const g = lit();
    put(g, 10, 2, 0, 1);
    run(g, 2);
    run(g, 60, new Map([[1, { x: 0, y: 1, a: 0, b: false }]]));
    expect(g.players.get(1)!.y).toBeLessThan(3);
    run(g, FIRE_TICKS);
    expect(at(g, idx(10, 3))).toBe(0);
  });
  it('never lights under a chef', () => {
    const g = make();
    setTile(g, idx(10, 3), OIL, OIL_TICKS);
    put(g, 10, 3);
    mechOnFire(g, oven(g), 'start');
    expect(at(g, idx(10, 3))).toBe(OIL);
  });
  it('putting the oven out (the extinguisher) also cleans the oil in front of it', () => {
    const g = lit();
    mechOnFire(g, oven(g), 'out');
    expect(at(g, idx(10, 3))).toBe(0);
  });
  it('B held for 60 ticks in front of an oil tile wipes it; letting go resets the count', () => {
    const g = make();
    put(g, 9, 3, 0, -1);
    const hold = new Map<number, Controls>([[1, { x: 0, y: 0, a: 0, b: true }]]);
    run(g, WIPE_OIL - 5, hold);
    expect(at(g, idx(9, 2))).toBe(OIL);
    run(g, 2); // let go
    run(g, WIPE_OIL - 5, hold);
    expect(at(g, idx(9, 2))).toBe(OIL);
    run(g, 10, hold);
    expect(at(g, idx(9, 2))).toBe(0);
  });
  it('is deterministic', () => {
    const h = () => {
      const g = lit();
      run(g, 800);
      return g.mech!.hash;
    };
    expect(h()).toBe(h());
  });
});

describe('Derrame', () => {
  it('is in the pool only with the oil mechanic on, and throws six patches', () => {
    expect(eventPool(make())).toContain('spill');
    expect(eventPool({ ...make(), flags: undefined })).not.toContain('spill');
    const g = make();
    const at6 = spill(g, mulberry32(7));
    expect(at6).toHaveLength(SPILL_PATCHES);
    for (const i of at6) expect(at(g, i)).toBe(OIL);
    expect(spill(make(), mulberry32(7))).toEqual(at6); // same stream, same patches
  });
  it('with water on a tile it is not oil: the layer keeps one thing per tile', () => {
    const g = make();
    setTile(g, idx(2, 6), WATER, 100);
    expect(at(g, idx(2, 6))).toBe(WATER);
  });
});
