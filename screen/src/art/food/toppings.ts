// The two new toppings of the Carta del día, drawn by code: pepperoni (a sausage stick raw, a leaning stack of slices cut) and mushroom (a whole mushroom raw, cap-and-stem
// slices cut), and how they sit on a pizza. The forms differ on purpose, not only the colours: a stick, a row of coins, a T-shaped mushroom, against the round tomato slices.
import { C } from '../tokens';
import { circle, contactShadow, drawOutlined, ellipse, rng, shade, shine, vgrad, type Ctx } from '../gfx';

export const PEPPERONI = '#B8322A', PEPPERONI_DARK = '#7E1D17', PEPPERONI_LIGHT = '#DE5642';
export const MUSHROOM = '#EBDCC3', MUSHROOM_DARK = '#C9A97D';

// --- pepperoni ----------------------------------------------------------------------------------------------------------------------------------
// One slice seen from above: red disc, darker rim, fat flecks.
export function pepperoniSlice(c: Ctx, x: number, y: number, r: number, rot: number, seed: number) {
  c.save(); c.translate(x, y); c.rotate(rot);
  drawOutlined(c, circle(c, 0, 0, r), PEPPERONI_DARK, { lw: Math.max(1.4, r * 0.2) });
  c.fillStyle = PEPPERONI; c.beginPath(); c.arc(0, 0, r * 0.84, 0, Math.PI * 2); c.fill();
  c.fillStyle = PEPPERONI_LIGHT; c.beginPath(); c.arc(-r * 0.2, -r * 0.25, r * 0.4, 0, Math.PI * 2); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
  const rnd = rng(seed);
  c.fillStyle = '#F6C9A8';
  for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, d = rnd() * r * 0.55; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.9, r * 0.13), 0, Math.PI * 2); c.fill(); }
  c.restore();
}

// Raw: the sausage stick, lying down, with the cut face at the near end and a string knot at the far one.
export function pepperoniRaw(c: Ctx) {
  contactShadow(c, 0, 22, 30, 5);
  c.save(); c.rotate(-0.22);
  drawOutlined(c, () => { c.beginPath(); c.roundRect(-30, -11, 58, 24, 11); }, vgrad(c, -11, 13, PEPPERONI_LIGHT, PEPPERONI_DARK), { lw: 2.8 });
  c.fillStyle = PEPPERONI; c.beginPath(); c.roundRect(-27, -4, 52, 14, 7); c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
  const rnd = rng(23);
  c.fillStyle = '#F6C9A8';
  for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(-22 + i * 5.4 + rnd() * 2, -3 + rnd() * 12, 1.2 + rnd() * 0.8, 0, Math.PI * 2); c.fill(); }
  drawOutlined(c, ellipse(c, 26, 1, 6, 12), '#E58A6A', { lw: 2.4 }); // the cut face
  c.fillStyle = PEPPERONI_DARK; for (const [x, y] of [[25, -2], [27, 4], [24, 6]] as const) { c.beginPath(); c.arc(x, y, 1.4, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = C.ink; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-30, 1); c.quadraticCurveTo(-38, -6, -34, -14); c.stroke(); // the string
  c.strokeStyle = C.cream; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-30, 1); c.quadraticCurveTo(-38, -6, -34, -14); c.stroke();
  shine(c, -4, 1, 18, 0.4, 2.2);
  c.restore();
}

// Cut: slices leaning on each other like a row of coins, the front one facing us. Not a fan of discs: a silhouette that reads as "slices of sausage".
export function pepperoniCut(c: Ctx) {
  contactShadow(c, 0, 24, 30, 5);
  for (let i = 3; i >= 0; i--) {
    const x = -20 + i * 13;
    c.save(); c.translate(x, 4); c.rotate(-0.12);
    drawOutlined(c, ellipse(c, 0, 0, 8.5 + (3 - i) * 0.6, 21), i === 0 ? PEPPERONI : shade(PEPPERONI, -0.12 * i), { lw: 2.4 });
    if (i === 0) {
      c.fillStyle = PEPPERONI_LIGHT; c.beginPath(); c.ellipse(-2, -6, 3.4, 8, 0, 0, Math.PI * 2); c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#F6C9A8';
      for (const [fx, fy, fr] of [[-1, 4, 1.6], [2, -9, 1.3], [-2, 11, 1.2], [1, -1, 1.1]] as const) { c.beginPath(); c.arc(fx, fy, fr, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
  }
}

// --- mushroom -----------------------------------------------------------------------------------------------------------------------------------
// A mushroom in profile: dome cap over a short stem. Always the same T-like outline, whole or sliced.
export function mushroomShape(c: Ctx, x: number, y: number, k: number, rot: number, fill: string, lw: number, gills = true) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k);
  drawOutlined(c, () => { c.beginPath(); c.moveTo(-6, 4); c.quadraticCurveTo(-8, 16, -10, 20); c.lineTo(10, 20); c.quadraticCurveTo(8, 16, 6, 4); c.closePath(); }, fill, { lw: lw / k }); // stem
  drawOutlined(c, () => { c.beginPath(); c.moveTo(-24, 6); c.bezierCurveTo(-26, -20, 26, -20, 24, 6); c.quadraticCurveTo(0, 12, -24, 6); c.closePath(); }, fill, { lw: lw / k }); // cap
  if (gills) { c.strokeStyle = MUSHROOM_DARK; c.lineWidth = 1.6 / k; c.beginPath(); c.moveTo(-18, 7); c.quadraticCurveTo(0, 12, 18, 7); c.stroke(); }
  c.restore();
}

export function mushroomRaw(c: Ctx) {
  contactShadow(c, 0, 24, 26, 5);
  mushroomShape(c, 0, -2, 1, 0, '#F4EAD6', 2.6);
  c.fillStyle = MUSHROOM_DARK; c.globalAlpha = 0.6;
  for (const [x, y, r] of [[-9, -8, 2.4], [6, -11, 2], [12, -3, 1.8], [-14, -2, 1.5]] as const) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  shine(c, -2, -6, 17, 0.45, 2.5);
}

export function mushroomCut(c: Ctx) {
  contactShadow(c, 0, 22, 28, 5);
  for (const [x, y, k, rot] of [[-17, 6, 0.62, -0.5], [15, 8, 0.62, 0.5], [0, -2, 0.78, 0]] as const) mushroomShape(c, x, y, k, rot, '#F7EDDA', 2.4);
}

// --- on the pizza ---------------------------------------------------------------------------------------------------------------------------------
const SPOTS: readonly (readonly [number, number, number])[] = [[-12, -7, 0.3], [8, -13, -0.4], [14, 3, 0.8], [-3, 8, 0.1], [-15, 8, -0.6], [1, -3, 1.2], [7, 14, 0.5]];
/** The topping scattered over a pizza drawn at the origin (radius ~25): `3` pepperoni slices, `4` mushroom slices. */
export function toppingOverlay(c: Ctx, topping: 3 | 4, size = 1) {
  SPOTS.forEach(([x, y, rot], i) => {
    if (topping === 3) pepperoniSlice(c, x * size, y * size, 6.2 * size, rot, 40 + i);
    else mushroomShape(c, x * size, y * size, 0.3 * size, rot, '#F7EDDA', 1.5);
  });
}
