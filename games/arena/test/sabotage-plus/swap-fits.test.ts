import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { createManchazo, stepManchazo, type ManchazoInput } from '../../sim';
import { fits } from '../../sim/grid/move';
import { scripts } from '../match-drive';
import { put } from './plus-drive';

/** The swap only trades the places of two bodies that already fit, so nobody can end up inside furniture, a sofa or a shut brush: checked on the living map, every tick. */
describe('swap never leaves a body inside a wall or a living part', () => {
  it.each([3, 4242, 99991, 777])('map seed %i: every body fits on every tick of a round full of swaps and moving parts', (mapSeed) => {
    const teams = [0, 1, 0, 1, 0, 1, 0, 1];
    const s = createManchazo({
      slots: teams.map((_t, i) => i),
      teams,
      seed: 9,
      mapSeed,
      sabotage: true,
      sabotagePlus: true,
      events: true,
      living: true,
    });
    // everybody in the middle band, each on the first free tile from (10 + i, 6) on, so rivals meet
    s.grid.bodies.forEach((_b, i) => {
      for (let k = 0; k < 400; k++) {
        const [tx, ty] = [10 + i + (k % 8), 6 + Math.floor(k / 8)];
        if (
          fits(s.grid.map, tx * 16 + 8, ty * 16 + 8) &&
          !s.grid.bodies.some((o, j) => j < i && o.x === tx * 16 + 8 && o.y === ty * 16 + 8)
        )
          return put(s, i, tx, ty);
      }
      throw new Error('no free tile');
    });
    const ps = scripts(teams.length, 31);
    const use = s.grid.bodies.map((_b, i) => mulberry32(mapSeed + i));
    let swaps = 0;
    for (let t = 0; t < 2400 && !s.grid.over; t++) {
      if (t % 30 === 0) s.match.sab!.held[(t / 30) % teams.length] = 'swap';
      const before = s.match.sab!.used;
      stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 20 }])));
      if (s.match.sab!.used > before) swaps++;
      for (const b of s.grid.bodies) expect(fits(s.grid.map, b.x, b.y), `tick ${t}: body at ${b.x},${b.y}`).toBe(true);
    }
    expect(swaps).toBeGreaterThan(10);
  });
});
