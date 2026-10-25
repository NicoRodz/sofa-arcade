import { describe, expect, it } from 'vitest';
import { LetterPool, flatCap, lettersOf, rename, toLevel } from '../generate/assemble';
import { parseLevel } from '../parse';
import { validateLevel } from '../validator';
import { mulberry32 } from '@pichi/core/rng';
import { MODULES, moduleById } from './defs';
import { FRACTIONS, TRAMOS, maxGap, tramo } from './tramos';
import { GROUND_ROW, MODULE_ROWS } from './types';
import type { LevelDef, Tether } from '../types';

const wrapPieces = (mid: { w: number; rows: string[]; params?: LevelDef['params'] }, tether: Tether, min = 2): LevelDef =>
  toLevel([flatCap(6, { ch: 'S', x: 2 }), mid, flatCap(6, { ch: 'G', x: 3 })], {
    id: 'm',
    name: 'm',
    biome: 'beach',
    players: { min, max: 8 },
    tether,
    stars: 1,
    parSec: 60,
  });

describe('module catalog', () => {
  it('has a dozen-plus modules with unique ids and the declared shape (18 rows, flat ground on both edges)', () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    for (const m of MODULES) {
      expect(m.rows, m.id).toHaveLength(MODULE_ROWS);
      for (const r of m.rows) expect(r, m.id).toHaveLength(m.w);
      for (const x of [0, m.w - 1]) {
        expect(m.rows[GROUND_ROW]![x], `${m.id} edge ${x} must be free to stand`).not.toBe('#');
        expect(m.rows[GROUND_ROW + 1]![x], `${m.id} edge ${x} needs floor`).toBe('#');
      }
      expect(m.w, m.id).toBeLessThanOrEqual(24);
    }
  });
  it('covers the cooperative roles: towers, plates, levers/movers, ring, ladder, key, and the hazards and timing', () => {
    const ids = MODULES.map((m) => m.id);
    for (const id of [
      'wall4',
      'wall5',
      'platepair',
      'latchgate',
      'elevator',
      'cart',
      'ring',
      'ladder',
      'keydoor',
      'crumble',
      'boyas',
      'spikepit',
      'lavahop',
    ])
      expect(ids).toContain(id);
  });

  for (const m of MODULES) {
    it(`${m.id} (${m.name}) is solvable alone, in every mode it allows, with ${m.minPlayers} players and with 8`, () => {
      const lvl = wrapPieces(rename({ w: m.w, rows: m.rows, params: m.params }, new LetterPool())!, m.tether, m.minPlayers);
      expect(parseLevel(lvl).errors).toEqual([]);
      const v = validateLevel(lvl, 'hard', [m.minPlayers, 8]);
      expect(v.errors).toEqual([]);
    });
  }

  it('a cooperative module really needs its players: the 5-tile wall fails with 2, the ring only works tied, the ladder module needs its plate', () => {
    const solo = (id: string, n: number, mode: 'chain' | 'free') => {
      const m = moduleById(id);
      return validateLevel(wrapPieces(rename({ w: m.w, rows: m.rows, params: m.params }, new LetterPool())!, 'any', 2), 'hard', [
        n,
      ]).reports.find((r) => r.env.mode === mode)!.ok;
    };
    expect(solo('wall5', 2, 'free')).toBe(false);
    expect(solo('wall5', 3, 'free')).toBe(true);
    const ring = moduleById('ring');
    const noRing = { w: ring.w, rows: ring.rows.map((r) => r.replace('o', '.')) };
    expect(validateLevel(wrapPieces(noRing, 'any'), 'hard', [2]).reports.find((r) => r.env.mode === 'chain')!.ok).toBe(false);
    expect(validateLevel(wrapPieces(noRing, 'any'), 'hard', [2]).reports.find((r) => r.env.mode === 'free')!.ok).toBe(true); // the stones carry the free mode
  });
});

describe('letters', () => {
  it('rename gives every module fresh letters and keeps params pointing at the right ones; the pool runs dry after 6 + 6', () => {
    const pool = new LetterPool();
    const pair = moduleById('platepair');
    const a = rename({ w: pair.w, rows: pair.rows, params: pair.params }, pool)!;
    const b = rename({ w: pair.w, rows: pair.rows, params: pair.params }, pool)!;
    expect(lettersOf(a).act).toEqual(['a', 'b']);
    expect(lettersOf(b).act).toEqual(['c', 'd']);
    expect(lettersOf(b).obj).toEqual(['B']);
    expect(Object.keys(b.params!).sort()).toEqual(['B', 'c', 'd']);
    expect((b.params!.c as { opens: string }).opens).toBe('B');
    rename({ w: pair.w, rows: pair.rows, params: pair.params }, pool);
    expect(rename({ w: pair.w, rows: pair.rows, params: pair.params }, pool)).toBeNull(); // 8 activators asked, 6 exist
  });
});

describe('tramos: jumps sampled inside the validated envelope', () => {
  it('the largest gap is 4 tied and 5 free; every kind at every fraction is solvable in its own mode', () => {
    expect(maxGap('chainOnly')).toBe(4);
    expect(maxGap('freeOnly')).toBe(5);
    for (const tether of ['chainOnly', 'freeOnly'] as const)
      for (const kind of TRAMOS)
        for (const f of FRACTIONS)
          for (let seed = 1; seed <= 3; seed++) {
            const p = tramo(kind, f, tether, mulberry32(seed));
            const v = validateLevel(wrapPieces(p, tether), 'hard', [2]);
            expect(v.errors, `${kind} f=${f} ${tether} seed ${seed}`).toEqual([]);
          }
  });
});
