// The three living elements of the map, drawn so each is known at first sight: the BRUSH is a big gold paintbrush (wooden handle, steel ferrule, bristles dipped in
// the colour of the team that last stood on its pivot) turning around a ring; the SOFA is a pink couch with back, cushions and arms that slides along a dashed
// rail; the FOUNTAIN is a stone basin with a water jet. Vector, per frame; the sim's state decides where they are (scene-living.ts).
import { A, num } from './palette';
import { type G, INK, WHITE, poly, star } from './shapes';

const STEEL = num(A.steel),
  STEEL_D = num(A.steelDark);

/** A rectangle along the unit vector (ux, uy) from `t0` to `t1` (px) of the origin, `hw` half wide. */
function bar(
  g: G,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  t0: number,
  t1: number,
  hw: number,
  fill: number,
  ink: number | null = INK,
  lw = 3,
  alpha = 1,
): void {
  const [vx, vy] = [-uy, ux];
  poly(
    g,
    [
      [ox + ux * t0 + vx * hw, oy + uy * t0 + vy * hw],
      [ox + ux * t1 + vx * hw, oy + uy * t1 + vy * hw],
      [ox + ux * t1 - vx * hw, oy + uy * t1 - vy * hw],
      [ox + ux * t0 - vx * hw, oy + uy * t0 - vy * hw],
    ],
    fill,
    ink ?? undefined,
    lw,
    alpha,
  );
}

/** One member of a brush: pivot centre (cx, cy), the way the bar points (ux, uy), tile size u, the owner of the pivot (-1: nobody), a flash (the bar just moved). */
export function drawBrush(g: G, cx: number, cy: number, ux: number, uy: number, u: number, owner: number, flash: boolean): void {
  const tip = owner >= 0 ? num([A.orange, A.blue][owner % 2]!) : STEEL_D;
  bar(g, cx + 3, cy + 5, ux, uy, 0.3 * u, 2.5 * u, 0.28 * u, 0x000000, null, 0, 0.22);
  bar(g, cx, cy, ux, uy, 0.3 * u, 1.35 * u, 0.13 * u, num(A.wood)); // handle
  bar(g, cx, cy, ux, uy, 1.3 * u, 1.72 * u, 0.24 * u, STEEL); // ferrule
  bar(g, cx, cy, ux, uy, 1.72 * u, 2.5 * u, 0.3 * u, num(A.brush), flash ? WHITE : INK, flash ? 6 : 3); // bristles
  bar(g, cx, cy, ux, uy, 2.18 * u, 2.5 * u, 0.3 * u, tip, INK, 3); // dipped tip
  for (const k of [-0.15, 0, 0.15]) {
    const [vx, vy] = [-uy, ux];
    g.lineStyle(2, INK, 0.5).lineBetween(
      cx + ux * 1.8 * u + vx * k * u,
      cy + uy * 1.8 * u + vy * k * u,
      cx + ux * 2.14 * u + vx * k * u,
      cy + uy * 2.14 * u + vy * k * u,
    );
  }
  g.fillStyle(owner >= 0 ? tip : num('#8A8A8A'), 1).fillCircle(cx, cy, u * 0.3); // the pivot
  g.lineStyle(5, num(A.brush), 1).strokeCircle(cx, cy, u * 0.38);
  g.lineStyle(2, INK, 1).strokeCircle(cx, cy, u * 0.44);
}

/** A dashed rectangle outline (the rail a sofa slides on). */
export function dashRect(g: G, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 14));
    for (let i = 0; i < n; i++)
      g.lineBetween(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, ax + ((bx - ax) * (i + 0.6)) / n, ay + ((by - ay) * (i + 0.6)) / n);
  };
  g.lineStyle(3, color, alpha);
  seg(x, y, x + w, y);
  seg(x + w, y, x + w, y + h);
  seg(x + w, y + h, x, y + h);
  seg(x, y + h, x, y);
}

/** A sofa over the rectangle (x, y, w, h) of its two tiles; `vertical` when it slides along a column (the back then on the left). */
export function drawSofa(g: G, x: number, y: number, w: number, h: number, vertical: boolean, flash: boolean): void {
  const [ix, iy, iw, ih] = [x + 4, y + 4, w - 8, h - 8];
  const body = num(A.sofa),
    dark = num(A.sofaDark),
    light = num(A.sofaLight);
  g.fillStyle(0x000000, 0.22).fillRoundedRect(ix + 3, iy + 5, iw, ih, 12);
  g.fillStyle(body, 1).fillRoundedRect(ix, iy, iw, ih, 12);
  g.lineStyle(flash ? 6 : 3, flash ? WHITE : INK, 1).strokeRoundedRect(ix, iy, iw, ih, 12);
  if (!vertical) {
    g.fillStyle(dark, 1).fillRoundedRect(ix + 4, iy + 3, iw - 8, ih * 0.3, 8); // back
    g.fillStyle(light, 1)
      .fillRoundedRect(ix + 12, iy + ih * 0.36, iw / 2 - 14, ih * 0.52, 7)
      .fillRoundedRect(ix + iw / 2 + 2, iy + ih * 0.36, iw / 2 - 14, ih * 0.52, 7);
    g.fillStyle(dark, 1)
      .fillRoundedRect(ix, iy + 2, 10, ih - 4, 4)
      .fillRoundedRect(ix + iw - 10, iy + 2, 10, ih - 4, 4); // arms
  } else {
    g.fillStyle(dark, 1).fillRoundedRect(ix + 3, iy + 4, iw * 0.3, ih - 8, 8);
    g.fillStyle(light, 1)
      .fillRoundedRect(ix + iw * 0.36, iy + 12, iw * 0.52, ih / 2 - 14, 7)
      .fillRoundedRect(ix + iw * 0.36, iy + ih / 2 + 2, iw * 0.52, ih / 2 - 14, 7);
    g.fillStyle(dark, 1)
      .fillRoundedRect(ix + 2, iy, iw - 4, 10, 4)
      .fillRoundedRect(ix + 2, iy + ih - 10, iw - 4, 10, 4);
  }
}

/** The fountain at (cx, cy): a stone basin with water and a jet of drops; `warn` raises the jet, `tick` moves it. */
export function drawFountain(g: G, cx: number, cy: number, u: number, warn: boolean, tick: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++)
    pts.push([cx + Math.cos((i * Math.PI) / 4 + Math.PI / 8) * u * 0.5, cy + Math.sin((i * Math.PI) / 4 + Math.PI / 8) * u * 0.5]);
  g.fillStyle(0x000000, 0.22).fillCircle(cx + 3, cy + 5, u * 0.5);
  poly(g, pts, STEEL, INK, 4);
  g.fillStyle(num(A.water), 1).fillCircle(cx, cy, u * 0.36);
  g.lineStyle(3, num(A.waterDark), 1).strokeCircle(cx, cy, u * 0.36);
  const ripple = (tick % 40) / 40;
  g.lineStyle(2, WHITE, 1 - ripple).strokeCircle(cx, cy, u * (0.12 + 0.24 * ripple));
  const up = warn ? 0.55 : 0.34; // the jet
  g.fillStyle(WHITE, 1).fillRoundedRect(cx - u * 0.06, cy - u * up, u * 0.12, u * up, 4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + tick / 20;
    const r = u * (0.16 + 0.1 * Math.abs(Math.sin(tick / 12 + k)));
    g.fillStyle(k % 2 ? WHITE : num(A.water), 1).fillCircle(cx + Math.cos(a) * r, cy - u * up * 0.8 + Math.sin(a) * r * 0.5, u * 0.05);
  }
  star(g, cx, cy - u * up, u * 0.12, u * 0.05, 5, tick / 15, WHITE, num(A.waterDark), 2);
}
