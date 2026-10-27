// Body parts: identity ring, legs, torso, arms, head and face. The body is the same rig for everyone (no gender-specific shapes).
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { decorateTorso, drawLegwear } from './clothes';
import { INK, OUT, TAU, ell, limb, paint, rrect, shade } from './kit';

const SHOE = '#F4F4F0';

/** Shadow plus the identity ring under the feet: slot colour, alpha 0.9, ink outline. Identity is this and the name tag, never the clothes. */
export function drawRing(p: Painter, c: DrawCtx): void {
  p.globalAlpha = 0.25;
  ell(p, 0, 2, 36, 12);
  p.fillStyle = INK;
  p.fill();
  p.globalAlpha = 0.9;
  ell(p, 0, 0, 30, 9.5);
  paint(p, c.slotColor);
  p.globalAlpha = 1;
}

/** Legs, shoes and whatever the clothes put on them (trousers, shorts, skirt). */
export function drawLegs(p: Painter, c: DrawCtx): void {
  const side = c.view === 'side';
  const swing = side ? Math.sin(c.t * 2.4) * 1.5 : 0;
  const legs: [number, number, number][] = side
    ? [
        [-3 - swing, -5 - swing, 1],
        [3 + swing, 5 + swing, 1],
      ]
    : [
        [-8, -10, 0],
        [8, 10, 0],
      ];
  for (const [hx, fx] of legs) {
    limb(p, hx, -19, fx, -6, 10, c.skin);
    drawLegwear(p, c, hx, fx);
  }
  for (const [, fx] of legs) {
    ell(p, side ? fx + 3 : fx, -3, side ? 11 : 9, 5.5);
    paint(p, SHOE);
  }
  if (c.clothes.legs === 'skirt' || c.clothes.legs === 'dress') {
    const half = c.view === 'side' ? 13 : 17;
    p.beginPath();
    p.moveTo(-half + 3, -24);
    p.lineTo(half - 3, -24);
    p.lineTo(half + 4, -11);
    p.quadraticCurveTo(0, -8, -half - 4, -11);
    p.closePath();
    paint(p, c.clothes.bottom);
  }
}

export function drawTorso(p: Painter, c: DrawCtx): void {
  const w = c.view === 'side' ? 11.5 : 17;
  rrect(p, -w, -51, w * 2, 38, 8);
  paint(p, c.clothes.top);
  decorateTorso(p, c, w);
}

/** One arm. `s` = -1 left / +1 right in front and back views; in the profile both arms hang near the body centre. */
export function drawArm(p: Painter, c: DrawCtx, s: -1 | 1, back: boolean): void {
  const side = c.view === 'side';
  const swing = Math.sin(c.t * 2.4 + (s > 0 ? 0 : Math.PI)) * (side ? 3 : 1);
  const x0 = side ? 1 * s : 21 * s,
    y0 = -43;
  const x1 = side ? (back ? -2 : 4) + swing : 27 * s + swing * 0.4,
    y1 = -24;
  const body = side && back ? shade(c.clothes.top, 0.88) : c.clothes.top;
  limb(p, x0, y0, x1, y1, 9, c.skin);
  const sl = c.clothes.sleeves;
  if (sl !== 'none') {
    const k = sl === 'long' ? 0.82 : 0.42;
    limb(p, x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 10, body);
  }
  p.beginPath();
  p.arc(x1, y1 + 1, 5.2, 0, TAU);
  paint(p, c.skin);
}

export function drawHead(p: Painter, c: DrawCtx): void {
  const { hx } = c;
  if (c.view !== 'side') {
    for (const s of [-1, 1]) {
      ell(p, hx + 21.5 * s, -66, 5, 6);
      paint(p, c.skin);
    }
  } else {
    ell(p, hx - 3, -66, 5, 6);
    paint(p, shade(c.skin, 0.92));
  }
  p.beginPath();
  p.arc(hx, -68, 22, 0, TAU);
  paint(p, c.skin);
}

/** Eyes and mouth (never drawn from behind). The eyes are at the rig's anchors, ANCHORS.eyeX / eyeY. */
export function drawFace(p: Painter, c: DrawCtx): void {
  const eyes = c.view === 'side' ? [c.hx + 9] : [-7, 7];
  for (const x of eyes) {
    ell(p, x, -70, 3.1, 4.2);
    p.fillStyle = INK;
    p.fill();
    ell(p, x + 0.9, -71.5, 1.1, 1.1);
    p.fillStyle = '#FFFFFF';
    p.fill();
  }
  const mx = c.view === 'side' ? c.hx + 9 : 0;
  p.beginPath();
  p.arc(mx, -56, c.view === 'side' ? 4 : 5.5, 0.2 * Math.PI, 0.8 * Math.PI);
  p.lineCap = 'round';
  p.lineWidth = OUT - 0.5;
  p.strokeStyle = INK;
  p.stroke();
}
