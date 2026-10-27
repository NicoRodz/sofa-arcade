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
  // the figure spans y in [-150, 20] around the feet: the whole figure, or a window centred on the head (hats, glasses), the back (cape, wings, backpack) or the torso (clothes)
  const [win, mid] = focus === 'head' ? [90, 86] : focus === 'back' ? [100, 50] : field === 'cl' ? [82, 52] : [135, 60];
  const k = c.width / win;
  const feetY = c.height / 2 + mid * k;
  ctx.setTransform(k, 0, 0, k, c.width / 2, feetY);
  draw(new Canvas2DPainter(ctx), withField(baseLook(gender), field, value), { view: focus === 'back' ? 'back' : 'front', t: 0, slotColor });
  cache.set(key, c);
  return c;
}
export const thumbCacheSize = () => cache.size;
