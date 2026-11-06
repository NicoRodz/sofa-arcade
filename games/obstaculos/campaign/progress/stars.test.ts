import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, emptyProgress, fullMask, mergeProgress, starsOf, type Assists, type LevelOutcome, type LevelProgress } from '../index';
import type { CatalogLevel } from '../index';

const level = (collectibles: number): CatalogLevel => ({ collectibles }) as CatalogLevel;
const run = (o: Partial<LevelOutcome> = {}): LevelOutcome => ({
  levelId: '1-1',
  cleared: true,
  timeMs: 1,
  collectiblesMask: 0,
  deaths: 5,
  ...o,
});
const withHearts: Assists = { ...NO_ASSISTS, infiniteHearts: true };
const prog = (stars: [boolean, boolean, boolean], o: Partial<LevelProgress> = {}): LevelProgress => ({ ...emptyProgress(), stars, ...o });

describe('starsOf: the three-star rule', () => {
  it('star 3 needs exactly zero deaths: 0 earns it, 1 does not', () => {
    expect(starsOf(run({ deaths: 0 }), level(3), NO_ASSISTS, 0)[2]).toBe(true);
    expect(starsOf(run({ deaths: 1 }), level(3), NO_ASSISTS, 0)[2]).toBe(false);
    expect(starsOf(run({ deaths: 2 }), level(3), NO_ASSISTS, 0)[2]).toBe(false);
  });
  it('zero deaths with the infinite-hearts assist does not earn star 3, any other assist does not matter', () => {
    expect(starsOf(run({ deaths: 0 }), level(3), withHearts, 0)[2]).toBe(false);
    const others: Assists = { infiniteHearts: false, slowMotion: true, instantBubble: true, permanentSilhouette: true };
    expect(starsOf(run({ deaths: 0 }), level(3), others, 0)[2]).toBe(true);
  });
  it('star 1 is the clear; a failed run gives no star even with zero deaths and every collectible', () => {
    expect(starsOf(run(), level(3), NO_ASSISTS, 0)[0]).toBe(true);
    expect(starsOf(run({ cleared: false, deaths: 0, collectiblesMask: fullMask(3) }), level(3), NO_ASSISTS, fullMask(3))).toEqual([
      false,
      false,
      false,
    ]);
  });
  it('star 2 needs every collectible, counting the mask of earlier runs', () => {
    expect(starsOf(run({ collectiblesMask: 0b111 }), level(3), NO_ASSISTS, 0)[1]).toBe(true);
    expect(starsOf(run({ collectiblesMask: 0b011 }), level(3), NO_ASSISTS, 0)[1]).toBe(false);
    expect(starsOf(run({ collectiblesMask: 0b100 }), level(3), NO_ASSISTS, 0b011)[1]).toBe(true);
    expect(starsOf(run({ collectiblesMask: 0b100 }), level(3), NO_ASSISTS, 0b001)[1]).toBe(false);
  });
  it('a level without collectibles never gives star 2', () => {
    expect(starsOf(run({ deaths: 0 }), level(0), NO_ASSISTS, 0)).toEqual([true, false, true]);
  });
});

describe('mergeProgress: monotone', () => {
  it('a worse run after a better one keeps every star, in both argument orders', () => {
    const best = prog([true, true, true], { done: true, bestTimeMs: 40_000, timeMedal: true, collectiblesMask: 0b111 });
    const worse = prog([true, false, false], { done: true, bestTimeMs: 99_000, collectiblesMask: 0b001 });
    for (const m of [mergeProgress(best, worse), mergeProgress(worse, best)])
      expect(m).toMatchObject({ stars: [true, true, true], bestTimeMs: 40_000, timeMedal: true, collectiblesMask: 0b111, done: true });
  });
  it('merges stars one by one: each side contributes the ones the other lacks', () => {
    expect(mergeProgress(prog([true, false, true]), prog([true, true, false])).stars).toEqual([true, true, true]);
  });
  it('merging with an empty progress changes nothing', () => {
    const p = prog([true, false, true], { done: true, bestTimeMs: 7, collectiblesMask: 0b10 });
    expect(mergeProgress(p, emptyProgress())).toEqual(p);
    expect(mergeProgress(emptyProgress(), p)).toEqual(p);
  });
});
