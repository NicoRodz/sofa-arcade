// F6: many TVs on HDMI crop their edges, so every HUD rectangle of Manchazo must sit inside the title-safe area (90 % of 1920x1080).
import { SAFE } from '@pichi/screen-kit/art';
import { describe, expect, it } from 'vitest';
import { MAP_H } from '../map';
import { FLOOR_BOTTOM, HUD, type Rect, X0, Y0 } from '../screen/match/layout';

const inside = (r: Rect) => r.x >= SAFE.x && r.y >= SAFE.y && r.x + r.w <= SAFE.x + SAFE.w && r.y + r.h <= SAFE.y + SAFE.h;

describe('Manchazo HUD inside the 90 % safe area', () => {
  it('the safe area is 96..1824 x 54..1026', () => {
    expect([SAFE.x, SAFE.y, SAFE.x + SAFE.w, SAFE.y + SAFE.h]).toEqual([96, 54, 1824, 1026]);
  });

  for (const [name, r] of Object.entries(HUD))
    it(`${name} (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}) is inside`, () => {
      expect(inside(r)).toBe(true);
    });

  it('the HUD does not run over the floor: the top elements end above it and the bottom text starts below it', () => {
    expect(FLOOR_BOTTOM).toBe(Y0 + MAP_H * 56);
    for (const k of ['pct0', 'pct1', 'clock', 'bar', 'feed0', 'feed1']) expect(HUD[k]!.y + HUD[k]!.h).toBeLessThanOrEqual(Y0);
    for (const k of ['seed', 'next']) expect(HUD[k]!.y).toBeGreaterThanOrEqual(FLOOR_BOTTOM);
  });

  it('the floor itself spans the whole safe width minus margins (it is not HUD text, but must not poke out)', () => {
    expect(X0).toBeGreaterThanOrEqual(SAFE.x);
    expect(FLOOR_BOTTOM).toBeLessThanOrEqual(SAFE.y + SAFE.h);
  });
});
