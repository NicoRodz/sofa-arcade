import type { Grid, Tile } from '../../../sim/maps';
import { C, rng, shade, vgrad, type Ctx } from '@pichi/screen-kit/art';
export type Kind = 'wall' | 'floor' | 'water' | 'bench' | 'oven' | 'out';

export const kindOf = (g: Grid, x: number, y: number): Kind => {
  const t: Tile | undefined = g[y]?.[x];
  if (!t) return 'out';
  if (t.kind === 'station') return t.station === 'pot' ? 'oven' : 'bench';
  return t.kind;
};

// Rounded rect with a radius per corner [tl, tr, br, bl].
export function rrc(c: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  c.beginPath();
  c.moveTo(x + r[0], y);
  c.lineTo(x + w - r[1], y);
  c.arcTo(x + w, y, x + w, y + r[1], r[1] || 0.001);
  c.lineTo(x + w, y + h - r[2]);
  c.arcTo(x + w, y + h, x + w - r[2], y + h, r[2] || 0.001);
  c.lineTo(x + r[3], y + h);
  c.arcTo(x, y + h, x, y + h - r[3], r[3] || 0.001);
  c.lineTo(x, y + r[0]);
  c.arcTo(x, y, x + r[0], y, r[0] || 0.001);
  c.closePath();
}

export function seed(tx: number, ty: number) {
  return tx * 73 + ty * 19 + 3;
}

export function benchTop(c: Ctx, g: Grid, tx: number, ty: number) {
  const x0 = tx * 120,
    y0 = ty * 120;
  const below = kindOf(g, tx, ty + 1) === 'bench';
  const topH = below ? 120 : 102;
  c.fillStyle = vgrad(c, y0, y0 + topH, '#D9A064', C.wood);
  c.fillRect(x0, y0, 120, topH);
  if (kindOf(g, tx, ty - 1) !== 'bench') {
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(x0, y0, 120, 4);
  }
  const rnd = rng(seed(tx, ty));
  c.strokeStyle = 'rgba(90,50,20,0.15)';
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const y = y0 + 16 + i * 28 + rnd() * 8,
      x = x0 + 6 + rnd() * 30;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 30, y - 5, x + 60, y + 1);
    c.quadraticCurveTo(x + 75, y + 4, x + 100 - rnd() * 20, y);
    c.stroke();
  }
  if (!below) {
    c.fillStyle = vgrad(c, y0 + 102, y0 + 120, C.wood2, shade(C.wood2, -0.25));
    c.fillRect(x0, y0 + 102, 120, 18);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(x0, y0 + 100, 120, 3);
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 2;
    for (let x = 30; x < 120; x += 30) {
      c.beginPath();
      c.moveTo(x0 + x, y0 + 104);
      c.lineTo(x0 + x, y0 + 120);
      c.stroke();
    }
  }
}

export function wallTop(c: Ctx, g: Grid, tx: number, ty: number) {
  const x0 = tx * 120,
    y0 = ty * 120;
  const below = kindOf(g, tx, ty + 1) === 'wall';
  const topH = below ? 120 : 96;
  c.fillStyle = vgrad(c, y0, y0 + topH, '#6B4E44', C.wallTop);
  c.fillRect(x0, y0, 120, topH);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 2;
  for (let r = 0; r * 24 < topH; r++) {
    c.beginPath();
    c.moveTo(x0, y0 + r * 24);
    c.lineTo(x0 + 120, y0 + r * 24);
    c.stroke();
    for (let x = (r % 2) * 30; x < 120; x += 60) {
      c.beginPath();
      c.moveTo(x0 + x, y0 + r * 24);
      c.lineTo(x0 + x, y0 + r * 24 + 24);
      c.stroke();
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(x0, y0, 120, 4);
  if (!below) {
    c.fillStyle = vgrad(c, y0 + 96, y0 + 120, C.cocoa, '#2A1D18');
    c.fillRect(x0, y0 + 96, 120, 24);
  }
}
