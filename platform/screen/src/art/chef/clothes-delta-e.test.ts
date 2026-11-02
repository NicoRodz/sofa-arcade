// Plan creador-personajes §3: clothes never use an identity colour. Every main clothes colour keeps a CIE76 distance (delta E) of at least 20
// from each of the 8 slot colours (identity is the ring and the tag, never the clothes).
import { describe, expect, it } from 'vitest';
import { CLOTHES } from '@pichi/core/avatar/parts/data';
import { CHEFS } from '../tokens';

import { deltaE } from './color-delta';

describe('clothes vs slot colours', () => {
  it('deltaE of identical colours is 0 and of black/white about 100', () => {
    expect(deltaE('#112233', '#112233')).toBe(0);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
  });
  it('every top and bottom is at least 20 from every slot colour (only the KNOWN exception)', () => {
    const bad: string[] = [];
    CLOTHES.forEach((c, id) => {
      for (const [part, col] of [
        ['top', c.top],
        ['bottom', c.bottom],
      ] as const)
        for (const ch of CHEFS) {
          const d = deltaE(col, ch.color);
          if (d < 20) bad.push(`cl ${id} ${part} ${col} vs ${ch.name} ${ch.color}: ${d.toFixed(1)}`);
        }
    });
    expect(bad).toEqual([]);
  });
});
