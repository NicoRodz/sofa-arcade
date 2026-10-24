import { describe, expect, it } from 'vitest';
import { BIOMES, T, buildGrid, parseLevelStrict, type Biome } from '@party/shared/obstaculos';
import { LEVEL_01 } from '../../../../../shared/games/obstaculos/levels';
import { PALETTES, ROPE_COLORS, tagColor, lerpColor } from './biome';
import { E_, N_, S_, W_, cellRand, terrainMask } from './tiledraw';
import { clockText, medalFor } from './hudlogic';

describe('palettes', () => {
  it('every biome has its palette with the plan colours', () => {
    expect(Object.keys(PALETTES).sort()).toEqual([...BIOMES].sort());
    expect(PALETTES.beach.body.toLowerCase()).toBe('#f2d49b'); // arena
    expect(PALETTES.beach.liquid.toLowerCase()).toBe('#3ba7c9'); // mar
    expect(PALETTES.forest.top.toLowerCase()).toBe('#6fa445'); // musgo, lit
    expect(PALETTES.forest.topDark.toLowerCase()).toBe('#4e7d3a'); // musgo
    expect(PALETTES.forest.body.toLowerCase()).toBe('#5b3a29'); // corteza
    expect(PALETTES.mine.topDark.toLowerCase()).toBe('#b87333'); // cobre
    expect(PALETTES.glacier.topDark.toLowerCase()).toBe('#bfe8f5'); // hielo
    expect(PALETTES.glacier.bodyDark.toLowerCase()).toBe('#5e6b78'); // granito
    expect(PALETTES.volcano.body.toLowerCase()).toBe('#2e2a2b'); // basalto
    expect(PALETTES.volcano.liquid.toLowerCase()).toBe('#ff5a1f'); // lava
  });
  it('plates and gates of a pair share a colour; different pairs differ', () => {
    expect(tagColor('a')).toBe(tagColor('A'));
    expect(tagColor('b')).toBe(tagColor('B'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(tagColor)).size).toBe(6);
  });
  it('rope colours are four distinct, none of them the strain red', () => {
    expect(new Set(ROPE_COLORS).size).toBe(4);
    expect(ROPE_COLORS).not.toContain('#E63B2E');
  });
  it('lerpColor mixes in rgb', () => { expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)'); });
});

describe('autotile mask', () => {
  const g = buildGrid(parseLevelStrict(LEVEL_01), 'chain');
  it('a ground cell with open sky above misses N; a deep one has all four', () => {
    // row 12, col 5 is floor (rows 12-13 are solid); row 11 above is empty
    expect(terrainMask(g, 5, 12) & N_).toBe(0);
    expect(terrainMask(g, 5, 12) & (E_ | W_ | S_)).toBe(E_ | W_ | S_);
    expect(terrainMask(g, 5, 13)).toBe(N_ | E_ | S_ | W_);
  });
  it('the wall column, an edge of the world, counts as closed to the outside', () => {
    expect(terrainMask(g, 0, 5) & W_).toBe(W_);
  });
  it('the corner of a block is open on two sides', () => {
    // tile (27, 9) is the top-left of the second block (cols 27-30, rows 9-11)
    expect(g.cells[9 * g.w + 27]).toBe(T.Solid);
    const m = terrainMask(g, 27, 9);
    expect(m & N_).toBe(0); expect(m & W_).toBe(0); expect(m & E_).toBe(E_);
  });
});

describe('cellRand', () => {
  it('is deterministic per cell and varies between cells', () => {
    expect(cellRand(3, 4, 1)).toBe(cellRand(3, 4, 1));
    const v = new Set<number>();
    for (let x = 0; x < 20; x++) v.add(cellRand(x, 7, 2));
    expect(v.size).toBeGreaterThan(18);
    for (const x of v) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe('hud helpers', () => {
  it('clock text and medal thresholds follow the par (gold <= par, silver <= 1.5 par)', () => {
    expect(clockText(75)).toBe('1:15'); expect(clockText(0)).toBe('0:00'); expect(clockText(-3)).toBe('0:00');
    expect(medalFor(75, 75)).toBe('gold'); expect(medalFor(75.5, 75)).toBe('silver');
    expect(medalFor(112.5, 75)).toBe('silver'); expect(medalFor(113, 75)).toBe('bronze');
  });
  it('type check: Biome list', () => { const b: Biome = 'glacier'; expect(BIOMES).toContain(b); });
});
