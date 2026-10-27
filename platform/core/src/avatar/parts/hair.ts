// Hair in two layers (plan §2): back (side lobes of the long cut, the ponytail) and front (crown + 3-spike fringe).
// Styles: 0 short, 1 ponytail, 2 long. A hat's `cap`/`fringe` flags decide how much of the crown stays visible; lobes and the tail always show.
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { ell, paint, shine } from './kit';

function tail(p: Painter, c: DrawCtx, x: number, y: number, dir: number): void {
  const sw = c.sway * 2.5 * dir;
  ell(p, x + sw * 0.5, y, 8, 8);
  paint(p, c.hair);
  ell(p, x + dir * 5 + sw * 1.4, y + 13, 6.5, 8.5, dir * 0.25);
  paint(p, c.hair);
}

export function drawHairBack(p: Painter, c: DrawCtx): void {
  const { hx } = c;
  if (c.view === 'side') {
    if (c.ap.s === 1) tail(p, c, hx - 26, -74, -1);
    else {
      ell(p, hx - 14, -56, 12, 21, 0.12);
      paint(p, c.hair);
    }
    return;
  }
  if (c.ap.s === 1) tail(p, c, 25, -74, 1);
  else
    for (const s of [-1, 1]) {
      ell(p, 20 * s, -59, 8.5, 18, 0.08 * s);
      paint(p, c.hair);
    }
}

export function drawHairFront(p: Painter, c: DrawCtx): void {
  const { hx } = c;
  const cap = c.hat === null || c.hat.cap;
  const fringe = c.hat === null || c.hat.fringe;
  if (c.view === 'back') {
    drawHairBackView(p, c);
    return;
  }
  if (c.view === 'side') {
    if (!cap && !fringe) return;
    p.beginPath();
    p.moveTo(hx - 23, -50);
    p.bezierCurveTo(hx - 34, -102, hx + 28, -102, hx + 22, -72);
    if (fringe) {
      p.lineTo(hx + 13, -78);
      p.lineTo(hx + 7, -74);
    } else p.lineTo(hx + 8, -80);
    p.lineTo(hx - 3, -76);
    p.lineTo(hx - 8, -64);
    p.lineTo(hx - 8, -50);
    p.closePath();
    paint(p, c.hair);
    if (cap) shine(p, hx - 4, -91, 6, 2.4, -0.3);
    return;
  }
  if (cap) {
    p.beginPath();
    p.moveTo(-23.5, -70);
    p.bezierCurveTo(-29, -100, 29, -100, 23.5, -70);
    if (fringe) {
      for (const [x, y] of [
        [15, -77],
        [8, -81],
        [0, -76],
        [-8, -81],
        [-15, -77],
      ] as const)
        p.lineTo(x, y);
    } else p.lineTo(0, -80);
    p.closePath();
    paint(p, c.hair);
    shine(p, -9, -90, 6, 2.4, -0.35);
  } else if (fringe) {
    p.beginPath();
    p.moveTo(-23, -72);
    for (const [x, y] of [
      [-15, -77],
      [-8, -81],
      [0, -76],
      [8, -81],
      [15, -77],
      [23, -72],
    ] as const)
      p.lineTo(x, y);
    p.lineTo(23, -84);
    p.lineTo(-23, -84);
    p.closePath();
    paint(p, c.hair);
  }
}

/** From behind the hair covers the whole head; the long cut hangs over the shoulders and the ponytail falls down the back. */
function drawHairBackView(p: Painter, c: DrawCtx): void {
  const long = c.ap.s === 2;
  ell(p, 0, long ? -63 : -69, 24, long ? 27 : 22);
  paint(p, c.hair);
  if (c.ap.s === 1) {
    const sw = c.sway * 2.5;
    ell(p, sw * 0.4, -56, 8, 8);
    paint(p, c.hair);
    ell(p, sw * 1.2, -42, 6.5, 9, 0.1);
    paint(p, c.hair);
  }
  shine(p, -8, -84, 6, 2.4, -0.35);
}
