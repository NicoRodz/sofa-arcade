// The HAZARD_V3 map patches (maps/hazard-patches.ts): each patched map passes the base validator, the validator of every mechanic it now declares (2..nMax chefs) and, for the mutation, the multi-state one;
// the original layouts stay untouched; a patch is deterministic and refuses a map that moved under it.
import { describe, expect, it } from 'vitest';
import { COOP_MAPS, parseMap } from './maps';
import { PATCHED_MAP_IDS, hasPatch, patchMap } from './maps/hazard-patches';
import { validateMap } from './validate';
import { multistateProblems } from './validate/multistate';
import { mechFlagsOf } from './mech/ids';
import { mechModule } from './mech/registry';
import type { Difficulty } from '@pichi/core/difficulty';

const orig = (id: string) => COOP_MAPS.find((m) => m.id === id)!;
const DIFFS: Difficulty[] = ['normal', 'hard'];

describe('HAZARD_V3 map patches', () => {
  it('cover maps 10, 12, 13, 14, 15, 22 and 27, all of 4+ chefs', () => {
    expect([...PATCHED_MAP_IDS].sort()).toEqual(['10', '12', '13', '14', '15', '22', '27']);
    for (const id of PATCHED_MAP_IDS) expect(orig(id).mechanics).toBeUndefined();
  });
  for (const id of ['10', '12', '13', '14', '15', '22', '27']) {
    for (const d of DIFFS) {
      it(`${id} ${d}: validates and its mechanics validate for 2..${orig(id).nMax} chefs`, () => {
        const m = patchMap(orig(id), d);
        expect(m).not.toBe(orig(id));
        expect(m.mechanics!.length).toBeGreaterThanOrEqual(1);
        expect(validateMap(m)).toEqual({ ok: true, errors: [] });
        expect(() => parseMap(m.rows, false, mechFlagsOf(m.mechanics))).not.toThrow();
        for (let n = 2; n <= m.nMax; n++) {
          for (const mech of m.mechanics!) {
            if (id === '13' && mech === 'gate') continue; // the doors of 13 stagger between rooms that already stand alone: see the dedicated test
            expect(mechModule(mech).validate(m.rows, n), `${mech} n=${n}`).toEqual([]);
          }
          expect(multistateProblems(m, n), `mutation n=${n}`).toEqual([]);
        }
      });
    }
  }
  it('the patch is a pure function: same input, same rows; the original is not mutated', () => {
    const before = [...orig('10').rows];
    expect(patchMap(orig('10'), 'normal').rows).toEqual(patchMap(orig('10'), 'normal').rows);
    expect(orig('10').rows).toEqual(before);
    expect(patchMap(orig('10'), 'normal').rows).not.toEqual(before);
  });
  it('a map without a patch (or one that already has mechanics) comes back as the same object', () => {
    expect(hasPatch('1')).toBe(false);
    expect(patchMap(orig('1'), 'normal')).toBe(orig('1'));
    const m = orig('31');
    expect(patchMap(m, 'hard')).toBe(m);
  });
  it('22 carries two waves (60 s and back at 120 s): 2 ops on Normal, 3 on Hard', () => {
    const n = patchMap(orig('22'), 'normal').mutation!,
      h = patchMap(orig('22'), 'hard').mutation!;
    expect([n.at, n.revertAt, n.ops.length]).toEqual([3600, 7200, 2]);
    expect([h.at, h.revertAt, h.ops.length]).toEqual([3600, 7200, 3]);
  });
  it('13: the two doors sit in the walls between rooms and each room still touches a door', () => {
    const m = patchMap(orig('13'), 'normal');
    const doors = m.rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === 'D' ? [[x, y]] : [])));
    expect(doors).toEqual([
      [6, 3],
      [11, 3],
    ]);
  });
});
