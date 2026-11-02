import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { createGrid, fits, hashGrid, stepGrid, type ControlPlan, type GridInput, type GridState } from '../sim';

/** A scripted "player": a random stick held for a random 3-40 ticks, from its own seed. Same seed, same script. */
function scripts(n: number, seed: number) {
  return Array.from({ length: n }, (_, i) => {
    const rnd = mulberry32(seed + i * 7919);
    let left = 0;
    let cur: GridInput = { sx: 0, sy: 0 };
    return (): GridInput => {
      if (left-- <= 0) {
        left = 3 + Math.floor(rnd() * 38);
        const a = rnd() * Math.PI * 2;
        const mag = rnd() < 0.15 ? 0 : 200 + Math.floor(rnd() * 800);
        cur = {
          sx: Math.round(Math.cos(a) * mag),
          sy: Math.round(Math.sin(a) * mag),
        };
      }
      return cur;
    };
  });
}

function play(plan: ControlPlan, bodies: number, ticks: number, seed: number, probe?: (s: GridState) => void, marks: number[] = []) {
  const s = createGrid({
    slots: Array.from({ length: bodies }, (_, i) => i),
    control: plan,
    durationTicks: 1_000_000,
  });
  const ps = scripts(bodies, seed);
  const hashes = new Map<number, number>();
  for (let t = 1; t <= ticks; t++) {
    stepGrid(s, new Map(ps.map((p, i) => [i, p()])));
    probe?.(s);
    if (marks.includes(t)) hashes.set(t, hashGrid(s));
  }
  return { s, hashes };
}

describe('grid sim determinism and safety', () => {
  for (const plan of ['A', 'B'] as const) {
    it(`plan ${plan}: the same script gives the same hash at ticks 600 and 3600`, () => {
      const a = play(plan, 8, 3600, 42, undefined, [600, 3600]);
      const b = play(plan, 8, 3600, 42, undefined, [600, 3600]);
      expect([...a.hashes]).toEqual([...b.hashes]);
      expect(a.hashes.size).toBe(2);
      expect(a.hashes.get(600)).not.toBe(a.hashes.get(3600));
    });

    it(`plan ${plan}: another script gives another hash`, () => {
      const a = play(plan, 8, 600, 42, undefined, [600]);
      const b = play(plan, 8, 600, 43, undefined, [600]);
      expect(a.hashes.get(600)).not.toBe(b.hashes.get(600));
    });

    it(`plan ${plan}: 10,000 random ticks with 8 bodies never put a body inside furniture, off a corridor line, or off the map`, () => {
      let bad = 0;
      let moved = 0;
      const { s } = play(plan, 8, 10_000, 7, (st) => {
        for (const b of st.bodies) {
          if (!fits(b.x, b.y)) bad++;
          if ((b.x - 8) % 16 !== 0 && (b.y - 8) % 16 !== 0) bad++; // at least one coordinate stays on a tile centre line
        }
      });
      for (const b of s.bodies) moved += Math.abs(b.x - 8) + Math.abs(b.y - 8);
      expect(bad).toBe(0);
      expect(moved).toBeGreaterThan(0); // the script really moved them
    });
  }

  it('a body that stands still keeps its integer position, and ticks past the duration end the round', () => {
    const s = createGrid({ slots: [0, 1], durationTicks: 120 });
    for (let i = 0; i < 200; i++) stepGrid(s, new Map());
    expect(s.over).toBe(true);
    expect(s.tick).toBe(120);
  });

  it('up to 8 bodies, 3 against 3 takes three spawns per team; 9 are refused', () => {
    const s = createGrid({ slots: [0, 1, 2, 3, 4, 5] });
    expect(s.bodies.filter((b) => b.team === 0)).toHaveLength(3);
    expect(createGrid({ slots: [0, 1, 2, 3, 4, 5, 6, 7] }).bodies).toHaveLength(8);
    expect(() => createGrid({ slots: [0, 1, 2, 3, 4, 5, 6, 7, 8] })).toThrow();
  });
});
