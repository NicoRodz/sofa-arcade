import { describe, expect, it } from 'vitest';
import { RecordingPainter } from '@pichi/core/avatar/recording-painter';
import { drawArm, drawBody, drawShoe } from './body';
import { drawHead } from './head';
import { drawHat } from './hats';
import { drawChefStatic } from './static';

const rec = (f: (p: RecordingPainter) => void) => {
  const p = new RecordingPainter();
  f(p);
  return p.log;
};

describe('chefdraw through a Painter', () => {
  it('draws the shoe with a stable call order and coordinates', () => {
    const log = rec((p) => drawShoe(p));
    expect(log.slice(0, 6)).toEqual([
      'beginPath()',
      'ellipse(0,0,8,5,0,0,6.283)',
      'fillStyle=#3B2A22',
      'fill()',
      'lineWidth=2.5',
      'strokeStyle=#2B1B17',
    ]);
    expect(log).toEqual(rec((p) => drawShoe(p)));
  });
  it('is deterministic for every slot and part, and slots differ', () => {
    const whole = (slot: number) => rec((p) => drawChefStatic(p, slot)).join('|');
    for (let s = 0; s < 8; s++) expect(whole(s)).toBe(whole(s));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(whole)).size).toBe(8);
    for (const f of [drawBody, drawHead, drawHat]) expect(rec((p) => f(p, 3)).length).toBeGreaterThan(5);
    expect(rec((p) => drawArm(p, '#F6D3B3')).filter((l) => l === 'fill()').length).toBeGreaterThan(2);
  });
});
