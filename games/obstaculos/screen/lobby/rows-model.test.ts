import { describe, expect, it } from 'vitest';
import { LEVELS, RANDOM_LEVEL } from '../../index';
import { levelCards, modePills } from './rows-model';

const color = (b: string) => `c-${b}`;

describe('Obstaculos lobby rows model', () => {
  it('mode pills: chain then free, exactly the current one selected', () => {
    expect(modePills('chain').map((p) => [p.id, p.selected])).toEqual([
      ['chain', true],
      ['free', false],
    ]);
    expect(modePills('free').map((p) => [p.id, p.selected])).toEqual([
      ['chain', false],
      ['free', true],
    ]);
    for (const p of modePills('chain')) expect(p.label && p.title).toBeTruthy();
  });
  it('level cards: one per level numbered from 1, then "Aleatorio" last with RANDOM_LEVEL', () => {
    const c = levelCards(2, 'chain', 1, color);
    expect(c).toHaveLength(LEVELS.length + 1);
    expect(c.slice(0, -1).map((x) => x.level)).toEqual(LEVELS.map((_, i) => i + 1));
    expect(c.at(-1)).toMatchObject({
      level: RANDOM_LEVEL,
      random: true,
      name: 'Aleatorio',
      ok: true,
      range: '',
      stars: '',
      biome: '',
      why: '',
    });
  });
  it('exactly one card is selected, and it is the one asked for (a level or the random card)', () => {
    expect(
      levelCards(2, 'chain', 3, color)
        .filter((x) => x.selected)
        .map((x) => x.level),
    ).toEqual([3]);
    expect(
      levelCards(2, 'chain', RANDOM_LEVEL, color)
        .filter((x) => x.selected)
        .map((x) => x.level),
    ).toEqual([RANDOM_LEVEL]);
  });
  it('a card carries its range, stars, biome colour; a blocked one carries the reason and an allowed one none', () => {
    const cards = levelCards(2, 'chain', 1, color).slice(0, -1);
    cards.forEach((x, i) => {
      const l = LEVELS[i]!;
      expect(x).toMatchObject({
        name: l.name,
        range: `${l.players.min}-${l.players.max}`,
        stars: '★'.repeat(l.stars),
        biome: color(l.biome),
      });
      expect(x.ok ? x.why : x.why.length > 0).toBe(x.ok ? '' : true);
    });
    // 8 players do not fit every level: at least one blocked card with a reason, and the group still sees the same numbers
    const eight = levelCards(8, 'chain', 1, color).slice(0, -1);
    expect(eight.some((x) => !x.ok)).toBe(true);
    expect(eight.filter((x) => !x.ok).every((x) => x.why !== '')).toBe(true);
    expect(eight.filter((x) => x.ok).every((x) => x.why === '')).toBe(true);
  });
});
