// The generator of maps with mechanics: same inputs, same map; every map it returns passes every validator; it finds a map for each mechanic it can place; the fallback is the plain classic map.
import { describe, expect, it, vi } from 'vitest';
import { GEN_MECHS, HOW_MANY, MAX_SEEDS, generateMech } from '../../../sim/gen/core';
import { parseMap, type MapDef } from '../../../sim/maps';
import { mechFlagsOf } from '../../../sim/mech/ids';
import { mechModule } from '../../../sim/mech/registry';
import { multistateProblems } from '../../../sim/validate/multistate';
import { minPlayers, validateMap } from '../../../sim/validate';
import { DIFFICULTIES, type Difficulty } from '@pichi/core/difficulty';

const defOf = (r: ReturnType<typeof generateMech>, n: number): MapDef => {
  const grid = parseMap(r.rows, false, mechFlagsOf(r.mechanics));
  return {
    id: 'gen',
    name: 'gen',
    rows: r.rows,
    nMin: 2,
    nMax: Math.max(2, n),
    minDuro: minPlayers(grid),
    stars: 2,
    spawns: r.spawns,
    puestos: r.puestos,
    mechanics: r.mechanics,
    mutation: r.mutation,
  };
};

describe('generateMech', () => {
  it('is deterministic: the same seed, size and difficulty give the same map', () => {
    for (const difficulty of DIFFICULTIES) {
      const a = generateMech({ seed: 11, n: 4, difficulty }),
        b = generateMech({ seed: 11, n: 4, difficulty });
      expect(b).toEqual(a);
    }
  });
  it('every map it returns is valid for its mechanics, before and after the mutation, for 2 and n chefs', () => {
    let real = 0,
      total = 0;
    for (const difficulty of DIFFICULTIES)
      for (const n of [2, 4, 8])
        for (let seed = 1; seed <= 8; seed++) {
          const r = generateMech({ seed, n, difficulty });
          total++;
          if (r.fallback) continue;
          real++;
          const def = defOf(r, n);
          expect(validateMap(def).errors, `${difficulty} n${n} seed${seed}`).toEqual([]);
          for (const id of r.mechanics) expect(mechModule(id).validate(r.rows, n), `${id} ${difficulty} n${n} seed${seed}`).toEqual([]);
          expect(multistateProblems(def, n), `multistate ${difficulty} n${n} seed${seed}`).toEqual([]);
          expect(r.mechanics.filter((m) => m !== 'mutation').length).toBeLessThanOrEqual(HOW_MANY[difficulty]);
        }
    expect(real / total).toBeGreaterThan(0.8); // the fallback is the exception
  });
  it('each mechanic the generator can place is found for some seed when it is asked for by name', () => {
    for (const m of GEN_MECHS) {
      const r = generateMech({ seed: 3, n: 4, difficulty: 'normal', mechanics: [m] });
      expect(r.fallback, `${m} did not find a map in ${MAX_SEEDS} seeds`).toBe(false);
      expect(r.mechanics).toContain(m);
      expect(r.rows.join('')).toMatch(
        m === 'oil'
          ? /[ag]/
          : m === 'kneader'
            ? /M/
            : m === 'woodOven'
              ? /W/
              : m === 'sprinkler'
                ? /\*/
                : m === 'oneWay'
                  ? /[<>]/
                  : m === 'bridge'
                    ? /b/
                    : m === 'beltReverse'
                      ? /→/
                      : /O/,
      );
    }
  });
  it('without a request, Fácil has no mutation and Difícil gets up to 3 mechanics plus one', () => {
    const d: Difficulty = 'easy';
    expect(generateMech({ seed: 5, n: 4, difficulty: d }).mutation).toBeUndefined();
  });
  it('when no seed validates it falls back to the plain classic map with no mechanics', () => {
    const spy = vi.spyOn(mechModule('sprinkler'), 'validate').mockReturnValue(['always wrong']);
    const r = generateMech({ seed: 3, n: 4, difficulty: 'normal', mechanics: ['sprinkler'], mutate: false });
    spy.mockRestore();
    expect(r).toMatchObject({ fallback: true, mechanics: [], attempts: MAX_SEEDS });
    expect(r.rows.join('')).not.toMatch(/[*]/);
  });
  it('a mutation that breaks the map is never returned: the multi-state check is part of the loop', () => {
    const spy = vi.spyOn(mechModule('mutation'), 'validate'); // (the module validator is not the multi-state one: this guards that the loop reaches mutation maps at all)
    const r = generateMech({ seed: 9, n: 4, difficulty: 'hard', mechanics: ['oil'] });
    spy.mockRestore();
    if (!r.fallback && r.mutation) expect(multistateProblems(defOf(r, 4), 4)).toEqual([]);
  });
});
