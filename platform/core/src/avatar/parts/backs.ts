// Back items (bk): 1 short cape, 2 long cape, 3 scarf, 4 wings, 5 backpack. Colour = the identity colour with a lining at 70% luminance.
// Two pieces: `drawBack` (behind the body; from behind it is drawn over the body) and `drawBackFront` (scarf collar, backpack straps).
// Flutter is a first-order sway (`c.sway`), no physics. `role.backScale` shrinks the whole item (Obstaculos 0.6) so it never hides the harness.
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { ell, paint, poly, rrect, shade, shine } from './kit';

const GOLD = '#E3B341';
const scaled = (p: Painter, c: DrawCtx, f: () => void) => {
  const k = c.role.backScale;
  p.save();
  p.translate(0, -36);
  p.scale(k, k);
  p.translate(0, 36);
  f();
  p.restore();
};

function cape(p: Painter, c: DrawCtx, hem: number, long: boolean): void {
  const lining = shade(c.slotColor, 0.7);
  const sw = c.sway * 2.5;
  if (c.view === 'side') {
    poly(p, [
      [-8, -48],
      [-8, -26],
      [-17 - sw, hem],
      [-23 - sw * 1.4, hem - 3],
      [-17, -48],
    ]);
    paint(p, c.slotColor);
    return;
  }
  poly(p, [
    [-19, -49],
    [19, -49],
    [35 + sw, hem],
    [-35 + sw, hem],
  ]);
  paint(p, c.slotColor);
  if (c.view === 'front') {
    poly(p, [
      [-12, -48],
      [12, -48],
      [20 + sw, hem - 3],
      [-20 + sw, hem - 3],
    ]);
    paint(p, lining);
  }
  if (long) {
    poly(p, [
      [-33 + sw, hem - 4],
      [33 + sw, hem - 4],
      [35 + sw, hem],
      [-35 + sw, hem],
    ]);
    paint(p, GOLD);
  }
  shine(p, -9, -40, 3, 8, 0.12);
}

function wings(p: Painter, c: DrawCtx): void {
  const flap = Math.sin(c.t * 6) * 0.14;
  const wing = (x: number, rot: number) => {
    ell(p, x, -42, 7.5, 16, rot);
    paint(p, '#F4F4F0');
  };
  if (c.view === 'side') {
    wing(-10, 0.35 + flap);
    return;
  }
  wing(-29, 0.6 + flap);
  wing(29, -0.6 - flap);
  shine(p, -30, -48, 2, 5, 0.6);
}

function scarfTail(p: Painter, c: DrawCtx): void {
  const sw = c.sway * 0.12;
  p.save();
  if (c.view === 'back') {
    p.translate(5, -46);
    p.rotate(sw);
    rrect(p, -4.5, 0, 9, 28, 3);
  } else {
    p.translate(c.view === 'side' ? -9 : 15, -46);
    p.rotate((c.view === 'side' ? 1.1 : -0.5) + sw);
    rrect(p, -4.5, 0, 9, 24, 3);
  }
  paint(p, shade(c.slotColor, 0.7));
  p.restore();
}

function pack(p: Painter, c: DrawCtx): void {
  const back = c.view === 'back';
  if (c.view === 'side') rrect(p, -25, -52, 15, 30, 6);
  else if (back) rrect(p, -17, -52, 34, 32, 7);
  else rrect(p, -21, -55, 42, 32, 7);
  paint(p, back ? c.slotColor : shade(c.slotColor, 0.7));
  if (back) {
    rrect(p, -10, -35, 20, 11, 3);
    paint(p, shade(c.slotColor, 0.82));
    shine(p, -9, -46, 6, 2.2);
  }
}

export function drawBack(p: Painter, c: DrawCtx): void {
  scaled(p, c, () => {
    const bk = c.ap.bk;
    if (bk === 1) cape(p, c, -22, false);
    else if (bk === 2) cape(p, c, -9, true);
    else if (bk === 3) scarfTail(p, c);
    else if (bk === 4) wings(p, c);
    else if (bk === 5) pack(p, c);
  });
}

/** In front of the torso: the scarf's loop around the neck and the backpack straps (hidden from behind, except the scarf). */
export function drawBackFront(p: Painter, c: DrawCtx): void {
  scaled(p, c, () => {
    if (c.ap.bk === 3) {
      ell(p, c.view === 'side' ? 0 : 0, -47, c.view === 'side' ? 11 : 18, 6.5);
      paint(p, c.slotColor);
    } else if (c.ap.bk === 5 && c.view !== 'back') {
      const xs = c.view === 'side' ? [-3] : [-11, 6];
      for (const x of xs) {
        rrect(p, x, -49, 5, 29, 2);
        paint(p, shade(c.slotColor, 0.7));
      }
    }
  });
}
