// The Calzone, drawn by code: a folded half-moon of dough with a crimped edge, raw (pale, a streak of sauce) and baked (golden, slits, flour), and the fold glyph of the ticket.
import { C } from '@pichi/screen-kit/art/tokens';
import { circle, contactShadow, drawOutlined, rng, shine, vgrad, type Ctx } from '@pichi/screen-kit/art/gfx';

// The half-moon: flat edge down, dome up. Spans x -30..30 and y -22..14.
const moon = (c: Ctx) => () => {
  c.beginPath();
  c.moveTo(-30, 14);
  c.bezierCurveTo(-32, -26, 32, -26, 30, 14);
  c.closePath();
};

/** The crimped seam along the flat edge: a row of small outlined bumps. */
function crimp(c: Ctx, fill: string) {
  for (let i = 0; i < 9; i++) drawOutlined(c, circle(c, -26 + i * 6.5, 14, 3.6), fill, { lw: 1.8 });
}

export function calzoneRaw(c: Ctx, shadow = true) {
  if (shadow) contactShadow(c, 0, 22, 32, 6);
  drawOutlined(c, moon(c), vgrad(c, -22, 14, '#FFF1D0', C.dough2), { lw: 2.8 });
  crimp(c, '#F7E3B8');
  c.strokeStyle = 'rgba(160,110,50,0.35)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-22, 5);
  c.bezierCurveTo(-20, -16, 20, -16, 22, 5);
  c.stroke();
  c.fillStyle = '#D7362A';
  c.globalAlpha = 0.85;
  c.beginPath();
  c.ellipse(24, 10, 6, 3.4, -0.3, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1; // sauce that came out at the seam
  const rnd = rng(61);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(-18 + rnd() * 36, -8 + rnd() * 14, 1.2 + rnd(), 0, Math.PI * 2);
    c.fill();
  }
  shine(c, 0, 0, 22, 0.5, 2.5);
}

export function calzoneDone(c: Ctx, shadow = true) {
  if (shadow) contactShadow(c, 0, 22, 32, 6);
  drawOutlined(c, moon(c), vgrad(c, -22, 14, '#F1B65A', '#C27A2B'), { lw: 2.8 });
  crimp(c, '#D9963F');
  c.fillStyle = 'rgba(122,60,20,0.35)';
  for (const [x, y, rx, ry] of [
    [-14, -6, 6, 3.4],
    [10, -9, 7, 3.6],
    [18, 0, 4, 3],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = '#7A3C14';
  c.lineWidth = 2.4; // the slits that let the steam out
  for (const [x, y] of [
    [-8, -10],
    [2, -13],
    [12, -10],
  ] as const) {
    c.beginPath();
    c.moveTo(x - 2, y + 4);
    c.lineTo(x + 2, y - 3);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,240,200,0.55)';
  c.beginPath();
  c.ellipse(-12, -12, 9, 3, -0.5, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 0, 22, 0.45, 2.5);
}

// The fold glyph of the ticket: an arrow that goes up and over and comes down (the dough folding onto itself).
export function foldGlyph(c: Ctx) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const path = () => {
    c.beginPath();
    c.moveTo(-22, 16);
    c.bezierCurveTo(-26, -26, 26, -26, 22, 4);
  };
  path();
  c.strokeStyle = C.ink;
  c.lineWidth = 13;
  c.stroke();
  c.beginPath();
  c.moveTo(10, 4);
  c.lineTo(22, 20);
  c.lineTo(34, 4);
  c.strokeStyle = C.ink;
  c.lineWidth = 13;
  c.stroke();
  path();
  c.strokeStyle = C.cheese;
  c.lineWidth = 7;
  c.stroke();
  c.beginPath();
  c.moveTo(10, 4);
  c.lineTo(22, 20);
  c.lineTo(34, 4);
  c.strokeStyle = C.cheese;
  c.lineWidth = 7;
  c.stroke();
}
