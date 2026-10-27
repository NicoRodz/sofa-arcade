// Hats (plan §2), anchored to the head: they follow its centre `hx`. Head top is y = -90, brow line y = -76: no brim or band goes below -76.
// Also the two role heads (chef hat, helmet) that REPLACE the player's own hat. One highlight per hat.
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { ell, paint, poly, rrect, shade, shine, star } from './kit';

const dome = (p: Painter, x: number, baseY: number, rx: number, top: number) => {
  p.beginPath();
  p.moveTo(x - rx, baseY);
  p.bezierCurveTo(x - rx, top - (baseY - top) * 0.33, x + rx, top - (baseY - top) * 0.33, x + rx, baseY);
  p.closePath();
};

function jockey(p: Painter, c: DrawCtx, col: string): void {
  const { hx, view } = c;
  dome(p, hx, -78, 24, -99);
  paint(p, col);
  p.beginPath();
  p.arc(hx, -98, 3, 0, Math.PI * 2);
  paint(p, shade(col, 1.25));
  if (view === 'side') rrect(p, hx + 8, -85, 26, 7, 3.5);
  else if (view === 'front') ell(p, hx, -80, 21, 5.5);
  else rrect(p, hx - 12, -80, 24, 3, 1.5);
  paint(p, shade(col, 0.8));
  shine(p, hx - 9, -92, 5, 2, -0.4);
}

function wool(p: Painter, c: DrawCtx, col: string): void {
  const { hx } = c;
  dome(p, hx, -84, 25, -104);
  paint(p, col);
  rrect(p, hx - 26, -86, 52, 10, 4.5);
  paint(p, shade(col, 0.82));
  ell(p, hx, -106, 7.5, 7);
  paint(p, '#EFE6D2');
  shine(p, hx - 11, -97, 5, 2, -0.4);
}

function straw(p: Painter, c: DrawCtx, col: string): void {
  const { hx } = c;
  ell(p, hx, -85, 37, 7.5);
  paint(p, shade(col, 0.92));
  dome(p, hx, -84, 18, -106);
  paint(p, col);
  rrect(p, hx - 18, -92, 36, 7, 0);
  paint(p, '#9E3B32');
  shine(p, hx - 8, -100, 5, 2, -0.4);
}

function bandana(p: Painter, c: DrawCtx, col: string): void {
  const { hx, view } = c;
  p.beginPath();
  p.moveTo(hx - 23.5, -71);
  p.bezierCurveTo(hx - 29, -101, hx + 29, -101, hx + 23.5, -71);
  p.quadraticCurveTo(hx, view === 'back' ? -73 : -84, hx - 23.5, -71);
  p.closePath();
  paint(p, col);
  if (view !== 'back')
    for (const [x, y] of [
      [-12, -83],
      [0, -88],
      [12, -83],
    ] as const) {
      p.beginPath();
      p.arc(hx + x, y, 2.4, 0, Math.PI * 2);
      p.fillStyle = '#F4F4F0';
      p.fill();
    }
  if (view !== 'front') {
    const kx = view === 'side' ? hx - 24 : hx;
    poly(p, [
      [kx, -76],
      [kx - 9, -66],
      [kx - 3, -64],
      [kx, -70],
      [kx + 3, -64],
      [kx + 9, -66],
    ]);
    paint(p, shade(col, 0.88));
  }
}

function crown(p: Painter, c: DrawCtx, col: string): void {
  const { hx } = c;
  const w = c.view === 'side' ? 11 : 16;
  poly(p, [
    [hx - w, -83],
    [hx - w, -99],
    [hx - w / 2, -92],
    [hx, -104],
    [hx + w / 2, -92],
    [hx + w, -99],
    [hx + w, -83],
  ]);
  paint(p, col);
  if (c.view !== 'back')
    for (const x of c.view === 'side' ? [0] : [-9, 0, 9]) {
      p.beginPath();
      p.moveTo(...star(hx + x, -88, 3.3, 1.5, 4)[0]!);
      for (const [sx, sy] of star(hx + x, -88, 3.3, 1.5, 4)) p.lineTo(sx, sy);
      p.closePath();
      p.fillStyle = '#4FB3BF';
      p.fill();
    }
  shine(p, hx - w + 5, -91, 2.5, 1.5, 0.5);
}

function chef(p: Painter, c: DrawCtx, col: string): void {
  const { hx } = c;
  for (const [x, y, r] of [
    [-14, -103, 11],
    [14, -103, 11],
    [0, -111, 13],
  ] as const) {
    p.beginPath();
    p.arc(hx + x, y, r, 0, Math.PI * 2);
    paint(p, col);
  }
  rrect(p, hx - 21, -93, 42, 14, 3);
  paint(p, col);
  shine(p, hx - 9, -113, 5, 2.2, -0.4);
}

function helmet(p: Painter, c: DrawCtx, col: string): void {
  const { hx, view } = c;
  dome(p, hx, -78, 25, -102);
  paint(p, col);
  rrect(p, hx - 4, -102, 8, 22, 3);
  paint(p, shade(col, 0.8));
  if (view === 'side') rrect(p, hx + 12, -82, 18, 5, 2.5);
  else if (view === 'front') rrect(p, hx - 20, -81, 40, 5, 2.5);
  else return;
  paint(p, shade(col, 0.8));
  shine(p, hx - 12, -92, 5, 2, -0.4);
}

const DRAW: Readonly<Record<string, (p: Painter, c: DrawCtx, col: string) => void>> = { jockey, wool, straw, bandana, crown, chef, helmet };
export function drawHat(p: Painter, c: DrawCtx): void {
  if (c.hat) DRAW[c.hat.id]?.(p, c, c.hat.color);
}
