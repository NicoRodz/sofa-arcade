// The ham of the Carta larga, drawn by code: a pink slab raw, a little stack of squares cut, and the squares on a pizza. Square and pink on purpose (the pepperoni is a red disc).
import { contactShadow, drawOutlined, vgrad, type Ctx } from '@pichi/screen-kit/art';

export const HAM = '#F0A0A8',
  HAM_DARK = '#B8626C',
  HAM_LIGHT = '#F8C8CC';

// One square of ham seen from above: rounded, with a darker edge and a light streak.
export function hamSquare(c: Ctx, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  drawOutlined(c, () => c.roundRect(-s, -s, s * 2, s * 2, s * 0.35), vgrad(c, -s, s, HAM_LIGHT, HAM), { lw: Math.max(1.2, s * 0.2) });
  c.strokeStyle = HAM_DARK;
  c.lineWidth = Math.max(0.8, s * 0.12);
  c.beginPath();
  c.moveTo(-s * 0.5, -s * 0.1);
  c.lineTo(s * 0.5, s * 0.15);
  c.stroke();
  c.restore();
}

// Raw: a thick slab with a fat edge.
export function hamRaw(c: Ctx) {
  contactShadow(c, 0, 22, 30, 5);
  c.save();
  c.rotate(-0.15);
  drawOutlined(c, () => c.roundRect(-30, -14, 60, 28, 9), vgrad(c, -14, 14, HAM_LIGHT, HAM), { lw: 2.8 });
  c.fillStyle = HAM_DARK;
  c.globalAlpha = 0.5;
  c.beginPath();
  c.roundRect(-30, 6, 60, 8, [0, 0, 8, 8]);
  c.fill();
  c.globalAlpha = 1;
  c.restore();
}

// Cut: three squares leaning on each other.
export function hamCut(c: Ctx) {
  contactShadow(c, 0, 22, 28, 5);
  for (const [x, y, s, rot] of [
    [-16, 6, 11, -0.4],
    [15, 8, 11, 0.45],
    [0, -3, 13, 0.05],
  ] as const)
    hamSquare(c, x, y, s, rot);
}

const SPOTS: readonly (readonly [number, number, number])[] = [
  [-12, -7, 0.3],
  [9, -12, -0.4],
  [14, 4, 0.8],
  [-3, 9, 0.1],
  [-15, 9, -0.6],
  [2, -2, 0.9],
];
/** The ham scattered over a pizza drawn at the origin (radius ~25). */
export function hamOverlay(c: Ctx, size = 1) {
  for (const [x, y, rot] of SPOTS) hamSquare(c, x * size, y * size, 5.2 * size, rot);
}
