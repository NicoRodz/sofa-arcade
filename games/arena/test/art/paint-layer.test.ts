import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { BAKE } from '../../screen/art/floor-bake';
import { bakePaintTextures, changedTiles } from '../../screen/art/paint-layer';
import { recorder } from './recorder';

describe('changedTiles: the only tiles the paint layer touches', () => {
  it('lists exactly the indices whose paint differs from what is shown', () => {
    expect(changedTiles([-1, -1, 0, 1, 1], [-1, 0, 0, 0, -1])).toEqual([1, 3, 4]);
  });
  it('nothing changed: nothing to touch', () => {
    expect(changedTiles([0, 1, -1], [0, 1, -1])).toEqual([]);
  });
  it('a tile erased (back to -1) counts as changed; the first sync (all -1 shown) lists every painted tile', () => {
    expect(changedTiles([0, 1], [-1, 1])).toEqual([0]);
    expect(changedTiles(new Int8Array(4).fill(-1), Int8Array.from([0, -1, 1, -1]))).toEqual([0, 2]);
  });
  it('follows the length of the paint array', () => {
    expect(changedTiles([], [])).toEqual([]);
    expect(changedTiles([0, 0, 0], [0, 0])).toEqual([]);
  });
});

// The two teams must differ without colour: orange is dotted (arcs), blue is striped (diagonal lines).
function bakeCalls(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const scene = {
    textures: {
      exists: () => false,
      createCanvas: (key: string) => {
        const r = recorder();
        out[key] = r.calls;
        return { getContext: () => r.proxy, refresh: () => {} };
      },
    },
  } as unknown as Phaser.Scene;
  bakePaintTextures(scene, 48);
  return out;
}

describe('paint tiles: dots for orange, stripes for blue', () => {
  const baked = bakeCalls();
  const orange = baked.mz_paint_0!;
  const blue = baked.mz_paint_1!;
  const count = (calls: string[], name: string) => calls.filter((c) => c.startsWith(`${name}(`)).length;

  it('bakes two textures at BAKE x', () => {
    expect(Object.keys(baked)).toEqual(['mz_paint_0', 'mz_paint_1']);
    expect(orange).toContain(`scale(${BAKE.toFixed(3)},${BAKE.toFixed(3)})`);
  });
  it('orange is a grid of 16 dots and has no stripes', () => {
    expect(count(orange, 'arc')).toBe(16);
    expect(count(orange, 'lineTo')).toBe(0);
  });
  it('blue has diagonal stripes and no dots', () => {
    expect(count(blue, 'arc')).toBe(0);
    expect(count(blue, 'lineTo')).toBeGreaterThanOrEqual(6);
  });
  it('the two glyph traces are different', () => {
    expect(orange).not.toEqual(blue);
  });
});
