import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PARAMS, DT, GRAVITY_UP, JUMP_PEAK_PX, JUMP_V0, ROPE_LEN, TILE, adaptiveCoyote } from './constants';
import { LEVELS, LEVEL_01, LEVEL_04, LEVEL_08 } from './levels';
import { T } from './legend';
import { kindAt, parseLevel, parseLevelStrict } from './parse';
import type { LevelDef } from './types';

const mini = (rows: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 't',
  name: 't',
  biome: 'beach',
  players: { min: 2, max: 4 },
  tether: 'any',
  stars: 1,
  parSec: 30,
  rows,
  ...extra,
});
const ok = ['#####', '#S.G#', '#####'];
const cell = (n: number, w: number) => ({ x: n % w, y: Math.floor(n / w) });

describe('parseLevel: the three grids of the plan (§11)', () => {
  it('A: 60x14, markers where the Geometria line says', () => {
    const p = parseLevelStrict(LEVEL_01);
    expect([p.w, p.h]).toEqual([60, 14]);
    expect(p.markers.spawn).toEqual([{ x: 3, y: 11 }]);
    expect(p.markers.checkpoint).toEqual([{ x: 35, y: 8 }]);
    expect(p.markers.goal).toEqual([{ x: 56, y: 7 }]);
    expect(p.markers.star).toEqual(
      [
        { x: 38, y: 4 },
        { x: 18, y: 8 },
        { x: 45, y: 10 },
      ].sort((a, b) => a.y - b.y || a.x - b.x),
    );
    // water cols 13-14 row 13, spikes cols 31-33 row 12, one-way cols 36-39 row 6
    expect([13, 14].map((x) => kindAt(p, x, 13))).toEqual([T.Liquid, T.Liquid]);
    expect([31, 32, 33].map((x) => kindAt(p, x, 12))).toEqual([T.Spikes, T.Spikes, T.Spikes]);
    expect([35, 36, 39, 40].map((x) => kindAt(p, x, 6))).toEqual([T.Empty, T.OneWay, T.OneWay, T.Empty]);
    expect(kindAt(p, 0, 5)).toBe(T.Solid); // wall col 0
    expect(kindAt(p, 59, 5)).toBe(T.Solid);
  });
  it('B: 56x16, rings, free-mode rocks and the cliff', () => {
    const p = parseLevelStrict(LEVEL_04);
    expect([p.w, p.h]).toEqual([56, 16]);
    expect(p.markers.ring).toEqual([
      { x: 44, y: 7 },
      { x: 14, y: 9 },
    ]);
    expect([17, 47].map((x, i) => kindAt(p, x, [12, 8][i]!))).toEqual([T.FreeSolid, T.FreeSolid]);
    expect(p.markers.goal).toEqual([{ x: 52, y: 7 }]);
    expect(kindAt(p, 34, 8)).toBe(T.FreeSolid); // cliff top at row 8: '%', 4 tiles in Libres and 3 in Encadenados (the rope cannot hold a tower of 2 higher)
    expect(kindAt(p, 34, 9)).toBe(T.Solid);
    expect(kindAt(p, 34, 7)).toBe(T.Empty);
  });
  it('C: 64x18, one object per letter with its params and bounds', () => {
    const p = parseLevelStrict(LEVEL_08);
    expect([p.w, p.h]).toEqual([64, 18]);
    expect(Object.keys(p.objects).sort()).toEqual(['A', 'D', 'E', 'F', 'a', 'b', 'c']);
    expect(p.objects.D!.bounds).toEqual({ x: 27, y: 13, w: 3, h: 1 });
    expect(p.objects.E!.bounds).toEqual({ x: 32, y: 13, w: 3, h: 1 });
    expect(p.objects.A!.bounds).toEqual({ x: 21, y: 13, w: 1, h: 3 }); // gate rows 13-15
    expect(p.objects.F!.bounds).toEqual({ x: 36, y: 8, w: 1, h: 9 }); // ladder rows 8-16
    expect(p.objects.a!.bounds).toEqual({ x: 16, y: 15, w: 3, h: 1 });
    expect(p.objects.c!.bounds).toEqual({ x: 39, y: 7, w: 2, h: 1 });
    expect(p.objects.a!.param).toMatchObject({ kind: 'plate', weight: 'half-up', opens: 'A' });
    expect(p.objects.F!.param).toEqual({ kind: 'ladder' });
    expect(kindAt(p, 16, 15)).toBe(T.Object);
    expect(p.markers.spawn).toEqual([{ x: 3, y: 15 }]);
    expect(p.markers.goal).toEqual([{ x: 60, y: 7 }]);
  });
  it('every shipped level parses with no errors and every marker is a distinct cell', () => {
    for (const d of LEVELS) {
      const p = parseLevel(d);
      expect(p.errors, d.id).toEqual([]);
      const all = Object.values(p.markers)
        .flat()
        .map((c) => `${c.x},${c.y}`);
      expect(new Set(all).size, d.id).toBe(all.length);
    }
  });
});

describe('parseLevel: errors', () => {
  it('a clean mini level has no errors and reading order markers', () => {
    const p = parseLevel(mini(ok));
    expect(p.errors).toEqual([]);
    expect(cell(1 * 5 + 1, 5)).toEqual(p.markers.spawn[0]);
  });
  it('ragged rows', () => {
    expect(parseLevel(mini(['#####', '#S.G#', '####'])).errors).toContain('row 2: width 4, expected 5');
  });
  it('unknown chars', () => {
    expect(parseLevel(mini(['#####', '#S?G#', '#####'])).errors).toContain("row 1 col 2: unknown char '?'");
  });
  it('S and G counts', () => {
    expect(parseLevel(mini(['#####', '#..G#', '#####'])).errors).toContain('want exactly one S, found 0');
    expect(parseLevel(mini(['#####', '#SSG#', '#####'])).errors).toContain('want exactly one S, found 2');
    expect(parseLevel(mini(['#####', '#S..#', '#####'])).errors).toContain('want exactly one G, found 0');
    expect(parseLevel(mini(['#####', '#SGG#', '#####'])).errors).toContain('want exactly one G, found 2');
  });
  it('letters need params and params need letters', () => {
    expect(parseLevel(mini(['#####', '#SaG#', '#####'])).errors).toContain("letter 'a' has no params entry");
    const e = parseLevel(mini(ok, { params: { b: { kind: 'plate', weight: 1, opens: 'A', latch: false } } })).errors;
    expect(e).toContain("params entry 'b' has no cells in the grid");
  });
  it('kinds match letter case; opens and partner resolve', () => {
    const p = { a: { kind: 'gate' } as const };
    expect(parseLevel(mini(['#####', '#SaG#', '#####'], { params: p })).errors.join()).toMatch(/activator/);
    const q = parseLevel(
      mini(['#####', '#SaG#', '#####'], { params: { a: { kind: 'plate', weight: 1, opens: 'A', latch: false } } }),
    ).errors;
    expect(q).toContain("'a' opens 'A', which is not in the grid");
    const r = parseLevel(
      mini(['#####', '#SDG#', '#####'], { params: { D: { kind: 'balance', partner: 'E', travel: 1, speed: 1 } } }),
    ).errors;
    expect(r.join()).toMatch(/partner/);
    // both balances exist but E points at somebody else
    const twoD = mini(['######', '#SDEG#', '######'], {
      params: { D: { kind: 'balance', partner: 'E', travel: 1, speed: 1 }, E: { kind: 'balance', partner: 'D', travel: 1, speed: 1 } },
    });
    expect(parseLevel(twoD).errors).toEqual([]);
    const bad = mini(['######', '#SDEG#', '######'], {
      params: { D: { kind: 'balance', partner: 'E', travel: 1, speed: 1 }, E: { kind: 'balance', partner: 'E', travel: 1, speed: 1 } },
    });
    expect(parseLevel(bad).errors.join()).toMatch(/'D' balance partner 'E'/);
  });
  it('players, par and zones', () => {
    expect(parseLevel(mini(ok, { players: { min: 1, max: 9 } })).errors.join()).toMatch(/players/);
    expect(parseLevel(mini(ok, { parSec: 0 })).errors).toContain('parSec must be > 0');
    expect(parseLevel(mini(ok, { cameraZones: [{ x: 0, y: 0, w: 6, h: 3 }] })).errors).toContain('cameraZones[0] outside the grid');
    expect(parseLevel(mini(ok, { hints: [{ x: 9, y: 0, text: 'x' }] })).errors).toContain('hints[0] outside the grid');
  });
  it('strict throws with the level id', () => {
    expect(() => parseLevelStrict(mini(['#####', '#..G#', '#####']))).toThrow(/level t: want exactly one S/);
  });
});

describe('constants', () => {
  it('derived numbers of the plan hold', () => {
    expect(ROPE_LEN).toBe(168);
    expect(TILE * 3.5).toBe(ROPE_LEN);
    expect(DT).toBeCloseTo(1 / 60, 12);
    expect(JUMP_V0 ** 2 / (2 * GRAVITY_UP)).toBeCloseTo(JUMP_PEAK_PX, 0); // analytic peak without hang: 173.2
  });
  it('adaptive coyote: base + ceil(p90 / 16.7), capped per difficulty', () => {
    expect(adaptiveCoyote('normal', 0)).toBe(7);
    expect(adaptiveCoyote('normal', 45)).toBe(10); // ceil(2.69) = 3
    expect(adaptiveCoyote('normal', 370)).toBe(12);
    expect(adaptiveCoyote('hard', 370)).toBe(DIFFICULTY_PARAMS.hard.coyoteCap);
    expect(adaptiveCoyote('easy', 370)).toBe(14);
  });
});
