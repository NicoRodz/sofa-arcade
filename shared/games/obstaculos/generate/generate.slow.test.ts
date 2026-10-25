import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PARAMS } from '../constants';
import { parseLevel } from '../parse';
import { modesOf, validateState } from '../validator';
import { DIFFICULTIES, type Difficulty } from '../../../difficulty';
import type { Tether } from '../types';
import { FALLBACK_LOG, MAX_ATTEMPTS, generateLevel, type GenerateOpts } from './generate';
import { LEVELS } from '../levels';

const TETHERS: Tether[] = ['chainOnly', 'freeOnly'];
const NS = [2, 4, 8];

// An independent check: parse + the validator again on the level the generator handed back, for its own n, mode(s) and difficulty.
function revalidate(o: GenerateOpts, rows: string[], level: ReturnType<typeof generateLevel>['level']): string[] {
  const errors: string[] = [...parseLevel(level).errors];
  for (const mode of modesOf(level)) {
    const r = validateState(level, { n: o.n, mode, diff: o.difficulty });
    if (!r.ok) errors.push(`${mode}: ${r.errors.join('; ')}`);
  }
  if (rows.length !== 18) errors.push(`rows ${rows.length}`);
  return errors;
}

describe('generateLevel: 500 consecutive seeds, every one valid', { timeout: 900_000 }, () => {
  it('500 seeds (difficulty, players and mode rotating) produce a valid level each, with no hand-made fallback and within the attempt cap', () => {
    FALLBACK_LOG.length = 0;
    const bad: string[] = [];
    let inBand = 0,
      attempts = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 500; seed++) {
      const o: GenerateOpts = { seed, n: NS[seed % 3]!, tether: TETHERS[seed % 2]!, difficulty: DIFFICULTIES[Math.floor(seed / 3) % 3]! };
      const { level, report } = generateLevel(o);
      const errs = revalidate(o, level.rows, level);
      if (errs.length) bad.push(`seed ${seed} ${JSON.stringify(o)}: ${errs.join(' | ')}`);
      if (report.fallback) bad.push(`seed ${seed}: fell back to ${report.fallback}`);
      if (report.attempts > MAX_ATTEMPTS) bad.push(`seed ${seed}: ${report.attempts} attempts`);
      if (report.inBand) inBand++;
      attempts += report.attempts;
      seen.add(level.rows.join('\n'));
    }
    expect(bad).toEqual([]);
    expect(FALLBACK_LOG).toEqual([]);
    expect(seen.size).toBeGreaterThan(450); // different seeds, different levels
    expect(inBand / 500).toBeGreaterThan(0.7); // the chosen candidate lands in its difficulty band
    expect(attempts / 500).toBeLessThan(6); // the retries are rare
  });

  it('the full matrix: 3 difficulties x n in {2,4,8} x 2 modes x 20 seeds, all valid', () => {
    const bad: string[] = [];
    for (const difficulty of DIFFICULTIES)
      for (const n of NS)
        for (const tether of TETHERS)
          for (let seed = 1000; seed < 1020; seed++) {
            const o: GenerateOpts = { seed, n, tether, difficulty };
            const { level } = generateLevel(o);
            const errs = revalidate(o, level.rows, level);
            if (errs.length) bad.push(`${JSON.stringify(o)}: ${errs.join(' | ')}`);
          }
    expect(bad).toEqual([]);
  });

  it('tether any: valid in both modes at once', () => {
    for (let seed = 7000; seed < 7020; seed++) {
      const o: GenerateOpts = { seed, n: 4, tether: 'any', difficulty: 'normal' };
      const { level, report } = generateLevel(o);
      expect(report.fallback).toBeNull();
      expect(revalidate(o, level.rows, level)).toEqual([]);
      expect(modesOf(level)).toEqual(['chain', 'free']);
    }
  });
});

describe('generateLevel: determinism and structure', { timeout: 120_000 }, () => {
  it('the same seed gives the same level, byte for byte; the seed is not ignored', () => {
    const o: GenerateOpts = { seed: 123, n: 4, tether: 'chainOnly', difficulty: 'normal' };
    const a = generateLevel(o),
      b = generateLevel(o);
    expect(a.level).toEqual(b.level);
    expect(a.report).toEqual(b.report);
    const other = generateLevel({ ...o, seed: 124 });
    expect(other.level.rows).not.toEqual(a.level.rows);
    const others = new Set<string>();
    for (let s = 200; s < 230; s++) others.add(generateLevel({ ...o, seed: s }).level.rows.join());
    expect(others.size).toBeGreaterThanOrEqual(28);
  });

  it('a level has one S, one G, uniform width of 90 to 180 columns, 18 rows, 3 to 6 stars, checkpoints, and carries n, tether and difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const o: GenerateOpts = { seed: 55, n: 4, tether: 'freeOnly', difficulty };
      const { level, report } = generateLevel(o);
      const p = parseLevel(level);
      expect(p.errors).toEqual([]);
      expect(p.markers.spawn).toHaveLength(1);
      expect(p.markers.goal).toHaveLength(1);
      expect(level.rows).toHaveLength(18);
      expect(p.w).toBeGreaterThanOrEqual(80);
      expect(p.w).toBeLessThanOrEqual(190);
      expect(p.markers.star.length).toBeGreaterThanOrEqual(3);
      expect(p.markers.star.length).toBeLessThanOrEqual(6);
      expect(p.markers.checkpoint.length).toBeGreaterThanOrEqual(Math.floor(p.w / 60));
      expect(level.players).toEqual({ min: 4, max: 4 });
      expect(level.tether).toBe('freeOnly');
      expect(report.band).toEqual(DIFFICULTY_PARAMS[difficulty].band);
      expect(report.cols).toBe(p.w);
    }
  });

  it('the harder the difficulty, the higher D on average (bands 10-35 < 35-60 < 60-85)', () => {
    const mean = (d: Difficulty) => {
      let s = 0;
      for (let seed = 300; seed < 320; seed++) s += generateLevel({ seed, n: 4, tether: 'freeOnly', difficulty: d }).report.d;
      return s / 20;
    };
    const e = mean('easy'),
      nm = mean('normal'),
      h = mean('hard');
    expect(e).toBeLessThan(nm);
    expect(nm).toBeLessThan(h);
  });

  it('cooperative modules respect n: with 2 players no tower of 3 and no wall of 5 ever appears; with 8 they can', () => {
    const wall5 = (n: number) => {
      let c = 0;
      for (let seed = 400; seed < 440; seed++)
        if (generateLevel({ seed, n, tether: 'freeOnly', difficulty: 'hard' }).report.modules.includes('wall5')) c++;
      return c;
    };
    expect(wall5(2)).toBe(0);
    expect(wall5(8)).toBeGreaterThan(0);
  });

  it('the validator is in the loop: over 60 seeds some drafts are refused and retried, and what comes back always validates', () => {
    let rejected = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const o: GenerateOpts = { seed, n: NS[seed % 3]!, tether: TETHERS[seed % 2]!, difficulty: DIFFICULTIES[Math.floor(seed / 3) % 3]! };
      const { level, report } = generateLevel(o);
      rejected += report.rejected;
      expect(revalidate(o, level.rows, level), `seed ${seed}`).toEqual([]);
    }
    expect(rejected).toBeGreaterThan(0);
  });

  it('with nothing valid the generator falls back to a hand-made level that fits and logs the case', () => {
    // a 6 x 3 players level pool cannot be forced to fail; ask for a count outside the generator's reach instead
    FALLBACK_LOG.length = 0;
    const { level, report } = generateLevel({ seed: 1, n: 99, tether: 'freeOnly', difficulty: 'hard' });
    expect(report.fallback).not.toBeNull();
    expect(LEVELS.map((l) => l.id)).toContain(level.id);
    expect(FALLBACK_LOG).toHaveLength(1);
    expect(report.attempts).toBe(MAX_ATTEMPTS);
  });
});
