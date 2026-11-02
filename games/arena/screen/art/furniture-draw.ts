// The furniture of the floor, drawn once into the baked floor texture (canvas 2D, logical px): armchair sofas with cushions and arms, round tables and poufs, all in
// café with a darker outline and a soft shadow on the floor. Top-down with a touch of front, like the Sofa pop menu art.
import { rr, type Ctx } from '@pichi/screen-kit/art';
import { A } from './palette';
import type { Piece } from './furniture-plan';

const TONES = [
  { base: A.wood, light: A.woodLight, dark: A.woodDark },
  { base: '#7D5C43', light: '#9A7456', dark: '#53392A' },
  { base: '#94705A', light: '#B08B72', dark: '#5E4532' },
];

function shadow(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.save();
  c.fillStyle = 'rgba(43,27,23,0.26)';
  rr(c, x + 3, y + 6, w, h, r);
  c.fill();
  c.restore();
}

/** A sofa lying along x: the backrest on top, one seat cushion per tile, an arm at each end. `len` tiles long. */
function sofa(c: Ctx, len: number, px: number, t: (typeof TONES)[number]) {
  const w = len * px - 8,
    h = px - 8;
  shadow(c, 0, 0, w, h, 12);
  c.lineWidth = 3;
  c.strokeStyle = t.dark;
  c.fillStyle = t.base;
  rr(c, 0, 0, w, h, 12);
  c.fill();
  c.stroke();
  c.fillStyle = t.dark; // the backrest
  rr(c, 4, 3, w - 8, h * 0.3, 8);
  c.fill();
  c.fillStyle = t.light; // seat cushions
  for (let k = 0; k < len; k++) {
    const x = 10 + (k * (w - 20)) / len;
    rr(c, x + 2, h * 0.36, (w - 20) / len - 4, h * 0.52, 7);
    c.fill();
    c.strokeStyle = t.dark;
    c.lineWidth = 2;
    c.stroke();
  }
  c.fillStyle = t.base; // arms
  for (const ax of [0, w - 9]) {
    rr(c, ax, 2, 9, h - 4, 4);
    c.fill();
    c.strokeStyle = t.dark;
    c.lineWidth = 2;
    c.stroke();
  }
}

function table(c: Ctx, px: number, t: (typeof TONES)[number]) {
  const r = px / 2 - 5;
  c.fillStyle = 'rgba(43,27,23,0.26)';
  c.beginPath();
  c.ellipse(r + 3, r + 6, r, r, 0, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = t.dark;
  c.fillStyle = t.base;
  c.beginPath();
  c.arc(r, r, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = t.light;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(r, r, r * 0.68, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.28)'; // the shine on the top
  c.beginPath();
  c.ellipse(r - r * 0.3, r - r * 0.35, r * 0.28, r * 0.14, -0.6, 0, Math.PI * 2);
  c.fill();
}

function pouf(c: Ctx, px: number, t: (typeof TONES)[number]) {
  const s = px - 10;
  shadow(c, 0, 0, s, s, 14);
  c.lineWidth = 3;
  c.strokeStyle = t.dark;
  c.fillStyle = t.light;
  rr(c, 0, 0, s, s, 14);
  c.fill();
  c.stroke();
  c.fillStyle = t.base;
  rr(c, 7, 7, s - 14, s - 14, 9);
  c.fill();
  c.fillStyle = t.dark; // the button
  c.beginPath();
  c.arc(s / 2, s / 2, 3.5, 0, Math.PI * 2);
  c.fill();
}

/** Draws one piece with its top-left tile at (x0 + p.x * px, y0 + p.y * px). */
export function drawPiece(c: Ctx, p: Piece, x0: number, y0: number, px: number) {
  const t = TONES[p.tone]!;
  c.save();
  c.translate(x0 + p.x * px + 4, y0 + p.y * px + 4);
  if (p.kind === 'sofa') sofa(c, p.w, px, t);
  else if (p.kind === 'sofa-side') {
    c.translate(px - 8, 0); // lying along y: turn it a quarter, the backrest on the right
    c.rotate(Math.PI / 2);
    sofa(c, p.h, px, t);
  } else if (p.kind === 'table') table(c, px, t);
  else pouf(c, px, t);
  c.restore();
}
