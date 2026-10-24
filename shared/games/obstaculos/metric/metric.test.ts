import { describe, expect, it } from 'vitest';
import { Canvas } from '../modules/dsl';
import { flatCap, toLevel } from '../generate/assemble';
import { validateState } from '../validator';
import type { EntityParam, LevelDef } from '../types';
import { BAND, bandCenter, difficultyOf, edgeUsage, spearman } from './metric';

function wrap(c: Canvas, params?: Record<string, EntityParam>, extra: Partial<LevelDef> = {}, caps = 6): LevelDef {
  return { ...toLevel([flatCap(caps, { ch: 'S', x: 2 }), { w: c.w, rows: c.rows(), params }, flatCap(caps, { ch: 'G', x: 3 })], { id: 't', name: 't', biome: 'beach', players: { min: 2, max: 8 }, tether: 'any', stars: 1, parSec: 60 }), ...extra };
}
const D = (def: LevelDef, n = 2) => { const r = validateState(def, { n, mode: 'free', diff: 'hard' }); expect(r.ok, r.errors.join()).toBe(true); return difficultyOf(r, def); };

describe('difficulty D = 100 (0.35 J + 0.20 H + 0.15 C + 0.15 T + 0.15 Lg)', () => {
  it('is exactly the weighted sum of its five terms, each in 0..1', () => {
    const b = D(wrap(new Canvas(14).pit(4, 8, '~')));
    for (const k of ['J', 'H', 'C', 'T', 'Lg'] as const) { expect(b[k]).toBeGreaterThanOrEqual(0); expect(b[k]).toBeLessThanOrEqual(1); }
    expect(b.D).toBeCloseTo(100 * (0.35 * b.J + 0.2 * b.H + 0.15 * b.C + 0.15 * b.T + 0.15 * b.Lg), 9);
  });
  it('J grows with the share of the envelope a jump uses: a 5-tile gap > a 3-tile gap > flat ground', () => {
    const j = (g: number) => D(wrap(new Canvas(g + 8).pit(4, 3 + g, '~'))).J;
    expect(j(2)).toBeGreaterThan(0);
    expect(j(5)).toBeGreaterThan(j(3));
    expect(j(3)).toBeGreaterThan(j(2));
    expect(D(wrap(new Canvas(10))).J).toBe(0);
  });
  it('H counts landings next to a hazard: water/spikes right at the landing raise it; solid ground does not', () => {
    expect(D(wrap(new Canvas(14).pit(4, 8, '~'))).H).toBeGreaterThan(0);
    expect(D(wrap(new Canvas(14).rect(4, 13, 8, 14, '#'))).H).toBe(0);
  });
  it('C counts cooperative edges and gadgets: a tower wall and a latch plate both raise it; plain jumping does not', () => {
    expect(D(wrap(new Canvas(12).rect(4, 11, 8, 14, '#'))).C).toBeGreaterThan(0);
    const gate = new Canvas(20).rect(10, 0, 10, 11, '#').rect(10, 12, 10, 14, 'A').rect(4, 14, 6, 14, 'a');
    const latched = wrap(gate, { a: { kind: 'plate', weight: 1, opens: 'A', latch: true }, A: { kind: 'gate' } });
    expect(D(latched).C).toBeGreaterThan(0);
    expect(D(wrap(new Canvas(14).pit(4, 8, '~'))).C).toBe(0);
  });
  it('T counts crumbling floors and moving hazards', () => {
    expect(D(wrap(new Canvas(14).pit(3, 10, '~').rect(3, 15, 10, 15, '!'))).T).toBeGreaterThan(0);
    const base = wrap(new Canvas(14));
    expect(D({ ...base, hazard: { kind: 'avalanche', speed: 1 } }).T).toBeGreaterThan(D(base).T);
  });
  it('Lg is (length - 60) / 140, clipped; the validator\'s length counts tall levels double per extra row', () => {
    const short = D(wrap(new Canvas(10)));
    const long = D(wrap(new Canvas(110)));
    expect(short.Lg).toBe(0);
    expect(long.Lg).toBeCloseTo((110 + 12 + 2 - 60) / 140, 6); // 2 walls + 2 caps of 6 + 110
  });
  it('edgeUsage of a jump is the smallest stick scale that still makes it, or the climb share: monotone in the gap', () => {
    const use = (g: number) => {
      const def = wrap(new Canvas(g + 8).pit(4, 3 + g, '~'));
      const r = validateState(def, { n: 2, mode: 'free', diff: 'hard' });
      return edgeUsage(r.graph!, r.path.find((e) => e.kind === 'jump')!);
    };
    expect(use(3)).toBeLessThan(use(4));
    expect(use(4)).toBeLessThan(use(5));
    expect(use(5)).toBeLessThanOrEqual(0.92);
  });
});

describe('bands and rank correlation', () => {
  it('bands are Fácil 10-35, Normal 35-60, Difícil 60-85', () => {
    expect(BAND).toEqual({ easy: [10, 35], normal: [35, 60], hard: [60, 85] });
    expect(bandCenter('hard')).toBe(72.5);
  });
  it('spearman: 1 for the same order, -1 for the reverse, ties get average ranks', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 9);
    expect(spearman([1, 1, 2, 2], [1, 2, 3, 4])).toBeGreaterThan(0.8);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});
