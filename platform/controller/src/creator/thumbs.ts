// Thumbnails for the option chips: each one is drawn ONCE in an offscreen canvas with the same draw function as the preview, then cached.
// The base look is fixed per gender (not the player's current one), so picking something never forces a redraw of the others.
import { Canvas2DPainter, FIELD_DEFAULT, clothesDefault, styleDefault, type Appearance, type AppearanceField } from '@pichi/core';
import { withField } from './flow';
import type { DrawAvatar } from './preview';

type Focus = 'full' | 'head' | 'back';
const cache = new Map<string, HTMLCanvasElement>();

export const baseLook = (g: number): Appearance => ({ ...FIELD_DEFAULT, v: 1, g, s: styleDefault(g), cl: clothesDefault(g) });

export function thumb(
  draw: DrawAvatar,
  field: AppearanceField,
  value: number,
  gender: number,
  px: number,
  slotColor: string,
): HTMLCanvasElement {
  const key = `${field}.${value}.${gender}.${px}.${slotColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const focus: Focus = field === 'bk' ? 'back' : field === 'hat' || field === 'gl' ? 'head' : 'full';
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(px * dpr);
  const ctx = c.getContext('2d')!;
  const k = focus === 'full' ? (c.width / 190) * 0.92 : c.width / 100; // the whole figure, or a 100-unit window on the head / back
  const feetY = focus === 'full' ? c.height - 6 * dpr : focus === 'head' ? 125 * k : 95 * k;
  ctx.setTransform(k, 0, 0, k, c.width / 2, feetY);
  draw(new Canvas2DPainter(ctx), withField(baseLook(gender), field, value), { view: focus === 'back' ? 'back' : 'front', t: 0, slotColor });
  cache.set(key, c);
  return c;
}
export const thumbCacheSize = () => cache.size;
