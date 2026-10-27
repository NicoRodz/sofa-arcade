// The basil of the Margarita fresca, drawn by code: a bunch of leaves in the crate, and three leaves laid on a pizza. Green, pointed, with a pale vein.
import { contactShadow, drawOutlined, vgrad, type Ctx } from '@pichi/screen-kit/art/gfx';

export const BASIL = '#4FA84A',
  BASIL_DARK = '#2D6B2E',
  BASIL_LIGHT = '#8FD67A';

// One leaf pointing up from the origin: a pointed oval with a vein.
export function basilLeaf(c: Ctx, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(0, -s * 1.5);
      c.bezierCurveTo(s * 1.1, -s * 0.8, s * 0.9, s * 0.9, 0, s);
      c.bezierCurveTo(-s * 0.9, s * 0.9, -s * 1.1, -s * 0.8, 0, -s * 1.5);
      c.closePath();
    },
    vgrad(c, -s * 1.5, s, BASIL_LIGHT, BASIL),
    { lw: Math.max(1.2, s * 0.2) },
  );
  c.strokeStyle = BASIL_DARK;
  c.lineWidth = Math.max(0.8, s * 0.12);
  c.beginPath();
  c.moveTo(0, -s * 1.2);
  c.lineTo(0, s * 0.8);
  c.stroke();
  c.restore();
}

// In the crate: five leaves in a bunch.
export function basilRaw(c: Ctx) {
  contactShadow(c, 0, 22, 26, 5);
  for (const [x, y, s, rot] of [
    [-14, 6, 11, -0.7],
    [14, 6, 11, 0.7],
    [-5, 2, 13, -0.25],
    [6, 2, 13, 0.25],
    [0, -2, 14, 0],
  ] as const)
    basilLeaf(c, x, y, s, rot);
}

/** Three leaves laid on a pizza drawn at the origin (radius ~25). */
export function basilOverlay(c: Ctx, size = 1) {
  for (const [x, y, rot] of [
    [-9, -4, -0.8],
    [8, -7, 0.7],
    [1, 9, 3.3],
  ] as const)
    basilLeaf(c, x * size, y * size, 6.5 * size, rot);
}
