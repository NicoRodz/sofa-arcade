import { describe, expect, it } from 'vitest';
import { KINDS } from '../../sim';
import { CARD_COLOR, CARD_HEX, drawIcon } from '../../screen/art/glyphs';
import { recorder } from './recorder';

// Geometry only (no fillStyle / lineStyle): what is left is the silhouette, so two icons that differ only by colour would trace the same.
const silhouette = (kind: (typeof KINDS)[number]): string => {
  const r = recorder();
  drawIcon(r.proxy as never, kind, 100, 100, 40, 0);
  return r.calls.filter((c) => !c.startsWith('fillStyle(') && !c.startsWith('lineStyle(')).join('|');
};

describe('sabotage icons read without colour', () => {
  it('there are 5 sabotages and each has a card colour', () => {
    expect(KINDS).toHaveLength(5);
    for (const k of KINDS) expect(CARD_HEX[k]).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('the 5 colours are different', () => {
    expect(new Set(KINDS.map((k) => CARD_COLOR[k])).size).toBe(5);
  });
  it('the 5 silhouettes are different from each other', () => {
    const shapes = KINDS.map(silhouette);
    expect(new Set(shapes).size).toBe(5);
  });
  it('the fan turns: another spin, another trace; the others ignore it', () => {
    const spun = (k: (typeof KINDS)[number], spin: number) => {
      const r = recorder();
      drawIcon(r.proxy as never, k, 100, 100, 40, spin);
      return r.calls.join('|');
    };
    expect(spun('fan', 0)).not.toBe(spun('fan', 1));
    expect(spun('glue', 0)).toBe(spun('glue', 1));
  });
});
