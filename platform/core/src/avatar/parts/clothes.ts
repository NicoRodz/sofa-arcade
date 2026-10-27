// Clothes decoration (the 11 outfits, plan §2). The torso rectangle and the sleeves come from body.ts; this adds prints, bibs and trousers.
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { INK, OUT, TAU, limb, paint, poly, rrect, shade } from './kit';

const dot = (p: Painter, x: number, y: number, r: number, color: string) => {
  p.beginPath();
  p.arc(x, y, r, 0, TAU);
  p.fillStyle = color;
  p.fill();
};
const line = (p: Painter, x0: number, y0: number, x1: number, y1: number, w: number, color: string) => {
  p.beginPath();
  p.moveTo(x0, y0);
  p.lineTo(x1, y1);
  p.lineCap = 'round';
  p.lineWidth = w;
  p.strokeStyle = color;
  p.stroke();
};

/** Trousers or shorts over one leg: the leg capsule again in the garment colour, shorter for shorts. Skirts and dresses are drawn by drawLegs. */
export function drawLegwear(p: Painter, c: DrawCtx, hipX: number, footX: number): void {
  const { legs, bottom } = c.clothes;
  if (legs === 'skirt' || legs === 'dress') return;
  const k = legs === 'short' ? 0.42 : 0.92;
  limb(p, hipX, -19, hipX + (footX - hipX) * k, -19 + 13 * k, 11, bottom);
}

/** Prints and details on top of the torso base. `w` is its half width. Front-only details (bib, pocket, lapels) are skipped from behind. */
export function decorateTorso(p: Painter, c: DrawCtx, w: number): void {
  const { deco, accent, top } = c.clothes;
  const front = c.view !== 'back';
  const inner = w - 4;
  switch (deco) {
    case 'stripes':
      for (const y of [-46, -37, -28, -19]) line(p, -inner, y, inner, y, 4, accent);
      break;
    case 'plaid':
      for (const x of [-9, 0, 9]) line(p, x * (w / 17), -47, x * (w / 17), -17, 2.2, accent);
      for (const y of [-40, -28]) line(p, -inner, y, inner, y, 2.2, accent);
      break;
    case 'flowers':
      for (const [x, y] of [
        [-8, -42],
        [7, -37],
        [-3, -26],
        [9, -20],
        [-10, -17],
      ] as const) {
        dot(p, x * (w / 17), y, 3.2, accent);
        dot(p, x * (w / 17), y, 1.1, '#D2A84A');
      }
      break;
    case 'dots':
      for (const [x, y] of [
        [-9, -42],
        [3, -44],
        [9, -33],
        [-4, -31],
        [-10, -22],
        [6, -20],
      ] as const)
        dot(p, x * (w / 17), y, 2.4, accent);
      break;
    case 'overall':
      if (c.view === 'side') break;
      rrect(p, -9, -36, 18, 23, 3);
      paint(p, c.clothes.bottom);
      line(p, -9, -36, -12, -49, 4, c.clothes.bottom);
      line(p, 9, -36, 12, -49, 4, c.clothes.bottom);
      dot(p, -7, -33, 1.8, '#D2A84A');
      dot(p, 7, -33, 1.8, '#D2A84A');
      break;
    case 'jacket':
      if (front) {
        poly(p, [
          [-5, -50],
          [0, -42],
          [5, -50],
          [0, -46],
        ]);
        paint(p, accent);
        line(p, 0, -42, 0, -14, 2.4, INK);
        line(p, -w + 5, -26, -w + 10, -26, 2.4, shade(top, 0.7));
      } else line(p, -inner, -22, inner, -22, 2.6, shade(top, 0.7));
      break;
    case 'hoodie':
      line(p, -inner, -16, inner, -16, 3, shade(top, 0.8));
      if (front) {
        rrect(p, -8, -33, 16, 11, 3);
        p.lineWidth = OUT - 1;
        p.strokeStyle = shade(top, 0.62);
        p.stroke();
        line(p, -4, -49, -4, -38, 2, accent);
        line(p, 4, -49, 4, -38, 2, accent);
      }
      break;
    case 'sweater':
      p.beginPath();
      p.moveTo(-inner, -45);
      p.quadraticCurveTo(0, -38, inner, -45);
      p.lineWidth = 3;
      p.strokeStyle = accent;
      p.stroke();
      line(p, -inner, -16, inner, -16, 5, accent);
      break;
    case 'surf':
      line(p, -inner, -44, inner, -22, 5, accent);
      break;
    default:
      break;
  }
}
