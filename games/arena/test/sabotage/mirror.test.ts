import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import { createManchazo, hashManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';

/** F1's scripted players plus button 2 about every 90 ticks (the same draws for a run and its mirror). */
function playSab(s: ManchazoState, seed: number, ticks: number, flip: boolean) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++)
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 90 }])));
}

const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];

describe('mirror with sabotages: swapping the teams swaps everything, cards included', () => {
  for (const [name, teams] of CASES)
    it(`${name}: paint, counts, hands, armed cards, rollers, footprints and pickups mirror`, () => {
      const slots = teams.map((_t, i) => i);
      for (const rs of [101, 202, 303, 404]) {
        const a = createManchazo({ slots, teams, seed: 4, sabotage: true });
        const b = createManchazo({ slots, teams: teams.map((t) => 1 - t), seed: 4, sabotage: true });
        playSab(a, rs, 3000, false);
        playSab(b, rs, 3000, true);
        const [sa, sb] = [a.match.sab!, b.match.sab!];
        expect(sa.used).toBeGreaterThan(0); // the run did play cards, so this checks something
        expect(sb.used).toBe(sa.used);
        expect(sb.held).toEqual(sa.held);
        expect(sb.armed).toEqual(sa.armed);
        expect(sb.roller).toEqual(sa.roller);
        expect(sb.footprints).toEqual([sa.footprints[1], sa.footprints[0]]);
        const key = (p: { x: number; y: number }, flip: boolean) => `${flip ? MAP_W - 1 - p.x : p.x},${p.y}`;
        const at = (s: typeof sa, flip: boolean) => new Map(s.pickups.map((p) => [key(p, flip), [p.drawn, p.wait]]));
        expect(at(sb, true)).toEqual(at(sa, false));
        expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
        for (let y = 0; y < 15; y++)
          for (let x = 0; x < MAP_W; x++) {
            const pa = a.match.paint[y * MAP_W + x]!;
            expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
          }
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
    });
  it('same seed and inputs, same hash (deterministic); another round seed, another deck', () => {
    const run = (seed: number) => {
      const s = createManchazo({ slots: [0, 1, 2, 3], teams: [0, 1, 0, 1], seed, sabotage: true });
      playSab(s, 7, 2400, false);
      return hashManchazo(s);
    };
    expect(run(4)).toBe(run(4));
    expect(run(4)).not.toBe(run(6));
  });
});
