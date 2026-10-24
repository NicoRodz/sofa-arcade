import { describe, expect, it } from 'vitest';
import { difficultyOf, spearman } from '../metric';
import { parseLevel } from '../parse';
import { validateLevel, validateState } from '../validator';
import type { LevelDef } from '../types';
import { LEVELS } from './index';

// Plan §10: name, players, mode, stars.
const TABLE: { id: string; name: string; min: number; max: number; tether: LevelDef['tether']; stars: number; biome: string }[] = [
  { id: 'l01', name: 'Primeros pasos', min: 2, max: 8, tether: 'any', stars: 1, biome: 'beach' },
  { id: 'l02', name: 'El muelle flojo', min: 2, max: 8, tether: 'any', stars: 1, biome: 'beach' },
  { id: 'l03', name: 'Marea alta', min: 2, max: 8, tether: 'any', stars: 2, biome: 'beach' },
  { id: 'l04', name: 'Argollas del alerce', min: 2, max: 6, tether: 'any', stars: 2, biome: 'forest' },
  { id: 'l05', name: 'Troncos del río', min: 2, max: 8, tether: 'any', stars: 3, biome: 'forest' },
  { id: 'l06', name: 'La copa del coigüe', min: 3, max: 8, tether: 'any', stars: 3, biome: 'forest' },
  { id: 'l07', name: 'Vagonetas', min: 2, max: 8, tether: 'any', stars: 3, biome: 'mine' },
  { id: 'l08', name: 'Balanza de cobre', min: 4, max: 8, tether: 'freeOnly', stars: 3, biome: 'mine' },
  { id: 'l09', name: 'La veta oscura', min: 2, max: 4, tether: 'any', stars: 4, biome: 'mine' },
  { id: 'l10', name: 'Hielo resbaloso', min: 2, max: 8, tether: 'any', stars: 3, biome: 'glacier' },
  { id: 'l11', name: 'Grietas', min: 3, max: 8, tether: 'any', stars: 4, biome: 'glacier' },
  { id: 'l12', name: 'Avalancha', min: 2, max: 8, tether: 'any', stars: 4, biome: 'glacier' },
  { id: 'l13', name: 'Lluvia de ceniza', min: 2, max: 8, tether: 'any', stars: 4, biome: 'volcano' },
  { id: 'l14', name: 'Lava ascendente', min: 2, max: 8, tether: 'chainOnly', stars: 5, biome: 'volcano' },
  { id: 'l15', name: 'El cráter', min: 4, max: 8, tether: 'any', stars: 5, biome: 'volcano' },
];

describe('the 15 levels (plan §10)', () => {
  it('are 15, in order, with the table\'s name, biome, players, mode and stars', () => {
    expect(LEVELS).toHaveLength(15);
    LEVELS.forEach((l, i) => {
      const t = TABLE[i]!;
      expect({ id: l.id, name: l.name, biome: l.biome, min: l.players.min, max: l.players.max, tether: l.tether, stars: l.stars }).toEqual({ id: t.id, name: t.name, biome: t.biome, min: t.min, max: t.max, tether: t.tether, stars: t.stars });
    });
  });

  for (const l of LEVELS) {
    it(`${l.id} ${l.name}: parses clean and is solvable in every mode, with the fewest, a middle and the most players (Hard physics)`, { timeout: 60_000 }, () => {
      expect(parseLevel(l).errors).toEqual([]);
      const v = validateLevel(l, 'hard');
      expect(v.errors).toEqual([]);
      expect(v.ok).toBe(true);
      const modes = new Set(v.reports.map((r) => r.env.mode));
      expect(modes.size).toBe(l.tether === 'any' ? 2 : 1);
      expect(Math.min(...v.reports.map((r) => r.env.n))).toBe(l.players.min);
      expect(Math.max(...v.reports.map((r) => r.env.n))).toBe(l.players.max);
      expect(v.reports.every((r) => r.path.length > 0 || r.pathSeconds > 0)).toBe(true);
    });
  }

  it('an easier physics (Easy, Normal) never invalidates what Hard accepts', { timeout: 120_000 }, () => {
    for (const l of LEVELS) for (const diff of ['easy', 'normal'] as const) {
      const v = validateLevel(l, diff, [l.players.min, l.players.max]);
      expect(v.errors, `${l.id} ${diff}`).toEqual([]);
    }
  });

  it('calibration: Spearman >= 0.7 between the plan\'s stars and the measured difficulty D', { timeout: 120_000 }, () => {
    const stars: number[] = [], ds: number[] = [];
    for (const l of LEVELS) {
      const v = validateLevel(l, 'hard');
      ds.push(v.reports.reduce((s, r) => s + difficultyOf(r, l).D, 0) / v.reports.length);
      stars.push(l.stars);
    }
    expect(spearman(stars, ds)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('the signature mechanic of each level is load-bearing (take it away and the validator says no)', () => {
  const by = (id: string) => LEVELS.find((l) => l.id === id)!;
  const strip = (l: LevelDef, from: string, to: string): LevelDef => ({ ...l, rows: l.rows.map((r) => r.split(from).join(to)) });
  const solvable = (l: LevelDef, n: number, mode: 'chain' | 'free' = 'free') => validateState(l, { n, mode, diff: 'hard' }).ok;

  it('l05 Troncos: without the logs the river is 40 tiles of water', () => {
    const l = by('l05');
    const noLogs = { ...l, params: {}, rows: l.rows.map((r) => r.replace(/[ABC]/g, '.')) };
    expect(solvable(noLogs, 2)).toBe(false);
  });
  it('l07 Vagonetas: the elevator is useless without its second lever (the holder would be stranded)', () => {
    const l = by('l07');
    const { b: _b, ...params } = l.params!;
    expect(solvable({ ...l, params, rows: l.rows.map((r) => r.replace('b', '.')) }, 2)).toBe(false);
  });
  it('l09 La veta: a level whose key is gone is a lint error (door without key)', () => {
    expect(validateLevel(strip(by('l09'), 'k', '.'), 'hard').ok).toBe(false);
  });
  it('l11 Grietas: without the bridge (plate a and mover A) the crevasse stays open', () => {
    const l = by('l11');
    const { a: _a, A: _A, ...params } = l.params!;
    expect(solvable({ ...l, params, rows: l.rows.map((r) => r.replace(/[aA]/g, '.')) }, 3)).toBe(false);
    expect(solvable(l, 3)).toBe(true);
  });
  it('l15 El cráter: without the ladder the 6-tile wall strands the followers (Hard hand zone is 2 tiles)', () => {
    const l = by('l15');
    expect(solvable({ ...l, rows: l.rows.map((r) => r.replace(/F/g, '#')) }, 4)).toBe(false);
  });
  it('l06 La copa: with 2 players there is no tower of 2, so a 5-tile wall stops them', () => {
    expect(solvable({ ...by('l06'), players: { min: 2, max: 8 } }, 2)).toBe(false);
  });
  it('l04 Argollas: tied, the 7-wide abyss needs the ring (no ring, no crossing); free, the stones are enough', () => {
    const l = by('l04');
    expect(solvable(l, 2, 'chain')).toBe(true);
    expect(solvable({ ...l, rows: l.rows.map((r) => r.replace(/o/g, '.')) }, 2, 'chain')).toBe(false);
    expect(solvable({ ...l, rows: l.rows.map((r) => r.replace(/o/g, '.')) }, 2, 'free')).toBe(true);
  });
  it('l08 Balanza: walling the ladder F off (the heavy group\'s way up) leaves the level unsolvable; with 3 players the balance does not move', () => {
    const l = by('l08');
    expect(solvable(l, 4)).toBe(true);
    expect(solvable({ ...l, rows: l.rows.map((r) => r.replace(/F/g, '#')) }, 4)).toBe(false);
    expect(solvable({ ...l, players: { min: 3, max: 8 } }, 3)).toBe(true); // 2 + 1 still unbalances it
    expect(solvable({ ...l, players: { min: 2, max: 8 } }, 2)).toBe(false); // 1 + 1 never moves it, and half-up / half-down need 1 + 1 each
  });
});
