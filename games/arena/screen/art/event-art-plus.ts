// The F8b events' art, in the style of F7b (flat vector, ink outlines, the Okabe-Ito teams, a shape for everything colour says): the blackout's dark with a light
// around each player, the contagion's marks on the tiles about to turn, Hora feliz's party frame and confetti, Mudanza's arrows between the old and the new spot,
// and the balloons with their landing shadow. Per frame; the sim decides what is on. No logic.
import { A, num } from './palette';
import { type G, INK, WHITE, poly, star } from './shapes';

const MAGENTA = num(A.sofa);
const GOLD = num(A.gold);
const CELL = 2; // the blackout is drawn in blocks of 1/CELL tile

/** Hash for the confetti: cosmetic, never the sim's RNG. */
const hash = (a: number, b: number): number => (Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;

/** The blackout: the floor goes dark except a circle of `radius` tiles around each light (px centres). `clear` is a rectangle that stays lit (the announcement banner). */
export function drawBlackout(
  g: G,
  x0: number,
  y0: number,
  px: number,
  w: number,
  h: number,
  lights: readonly (readonly [number, number])[],
  radius: number,
  fade: number,
  clear?: readonly [number, number, number, number],
): void {
  const step = px / CELL;
  for (let j = 0; j < h * CELL; j++)
    for (let i = 0; i < w * CELL; i++) {
      const [cx, cy] = [x0 + (i + 0.5) * step, y0 + (j + 0.5) * step];
      if (clear && cx > clear[0] && cx < clear[2] && cy > clear[1] && cy < clear[3]) continue;
      let d = Infinity;
      for (const [lx, ly] of lights) d = Math.min(d, Math.hypot(cx - lx, cy - ly) / px);
      const a = d <= radius - 0.5 ? 0 : d >= radius ? 0.93 : 0.93 * (d - (radius - 0.5)) * 2; // a soft rim of half a tile
      if (a > 0) g.fillStyle(0x0b0a14, a * fade).fillRect(x0 + i * step, y0 + j * step, step + 0.5, step + 0.5);
    }
  for (const [lx, ly] of lights) g.lineStyle(4, 0xffffff, 0.55 * fade).strokeCircle(lx, ly, (radius - 0.25) * px); // the ring tells where the light ends
}

/** A tile that will turn: a pulsing white X over the colour it has now, and a small arrow-less "swap" mark (two half circles) so it reads without colour. */
export function drawInfectMark(g: G, x: number, y: number, px: number, tick: number, k: number): void {
  const pulse = 0.55 + 0.45 * Math.sin(tick / 4 + k);
  g.lineStyle(5, WHITE, pulse).strokeRect(x + 5, y + 5, px - 10, px - 10);
  g.lineStyle(7, INK, 0.7 * pulse)
    .lineBetween(x + 14, y + 14, x + px - 14, y + px - 14)
    .lineBetween(x + px - 14, y + 14, x + 14, y + px - 14);
  g.lineStyle(4, WHITE, pulse)
    .lineBetween(x + 14, y + 14, x + px - 14, y + px - 14)
    .lineBetween(x + px - 14, y + 14, x + 14, y + px - 14);
}

/** The contagion's pass: the whole floor flashes white and a ring runs out from the middle line. */
export function drawInfectPass(g: G, x: number, y: number, w: number, h: number, k: number): void {
  g.fillStyle(WHITE, 0.4 * (1 - k)).fillRect(x, y, w, h);
  g.lineStyle(10, INK, 1 - k).strokeCircle(x + w / 2, y + h / 2, (w / 2) * k);
}

/** Hora feliz: a party frame round the floor (alternating gold and magenta bunting) and confetti that falls. */
export function drawHappyHour(g: G, x: number, y: number, w: number, h: number, tick: number): void {
  const n = 30;
  for (let k = 0; k < n; k++) {
    const c = k % 2 ? GOLD : MAGENTA;
    const [tx, ty] = [x + (w * k) / n, y];
    poly(
      g,
      [
        [tx, ty],
        [tx + w / n, ty],
        [tx + w / (2 * n), ty + 26 + 4 * Math.sin(tick / 6 + k)],
      ],
      c,
      INK,
      3,
    );
  }
  g.lineStyle(8, MAGENTA, 0.7 + 0.3 * Math.sin(tick / 6)).strokeRect(x + 4, y + 4, w - 8, h - 8);
  for (let k = 0; k < 40; k++) {
    const hh = hash(k, 7);
    const cx = x + (hh % Math.round(w));
    const cy = y + ((hh >>> 12) % 60) + ((tick * (2 + (k % 3)) + k * 53) % Math.round(h));
    star(g, cx, cy, 7, 3, 4, (tick + k * 11) / 12, k % 3 === 0 ? GOLD : k % 3 === 1 ? MAGENTA : WHITE);
  }
}

/** Mudanza: the piece about to leave (dashed white box with a cross) and the spot it will take (pulsing box with a corner mark), joined by an arrow. */
export function drawMoveWarn(g: G, from: readonly [number, number], to: readonly [number, number], px: number, tick: number): void {
  const [fx, fy] = from;
  const [tx, ty] = to;
  const blink = Math.floor(tick / 8) % 2 === 0;
  g.lineStyle(5, WHITE, blink ? 1 : 0.4)
    .strokeRect(fx + 4, fy + 4, px - 8, px - 8)
    .lineBetween(fx + 8, fy + 8, fx + px - 8, fy + px - 8);
  g.lineStyle(5, GOLD, blink ? 1 : 0.4).strokeRect(tx + 4, ty + 4, px - 8, px - 8);
  g.fillStyle(GOLD, blink ? 0.3 : 0.1).fillRect(tx + 4, ty + 4, px - 8, px - 8);
  const [ax, ay, bx, by] = [fx + px / 2, fy + px / 2, tx + px / 2, ty + px / 2];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
  g.lineStyle(6, INK, 0.5).lineBetween(ax + ux * px * 0.5, ay + uy * px * 0.5, bx - ux * px * 0.5, by - uy * px * 0.5);
  poly(
    g,
    [
      [bx - ux * px * 0.5, by - uy * px * 0.5],
      [bx - ux * px * 0.9 - uy * 12, by - uy * px * 0.9 + ux * 12],
      [bx - ux * px * 0.9 + uy * 12, by - uy * px * 0.9 - ux * 12],
    ],
    GOLD,
    INK,
    3,
  );
}

/** Mudanza, the landing: a ring that grows out of the new spot. */
export function drawMoveLand(g: G, to: readonly [number, number], px: number, k: number): void {
  g.lineStyle(8, GOLD, 1 - k).strokeCircle(to[0] + px / 2, to[1] + px / 2, px * (0.5 + 1.4 * k));
}

/** A balloon (px centre) hanging `lift` tiles above its shadow: the shadow grows as it comes down, the 3x3 it will paint is outlined. `owner`: -2 still falling. */
export function drawBalloon(g: G, cx: number, cy: number, px: number, lift: number, tick: number): void {
  g.fillStyle(0x000000, 0.18 + 0.2 * (1 - Math.min(1, lift / 4))).fillEllipse(
    cx,
    cy + px * 0.25,
    px * (0.5 + 0.8 * (1 - Math.min(1, lift / 4))),
    px * 0.28,
  );
  g.lineStyle(4, WHITE, 0.55 + 0.35 * Math.sin(tick / 5)).strokeRect(cx - 1.5 * px + 5, cy - 1.5 * px + 5, 3 * px - 10, 3 * px - 10);
  const by = cy - px * (0.4 + lift);
  g.lineStyle(3, INK, 1).lineBetween(cx, by + px * 0.38, cx + Math.sin(tick / 9) * 5, cy - px * 0.1);
  g.fillStyle(MAGENTA, 1)
    .fillEllipse(cx, by, px * 0.62, px * 0.78)
    .lineStyle(4, INK, 1)
    .strokeEllipse(cx, by, px * 0.62, px * 0.78);
  g.fillStyle(WHITE, 0.7).fillEllipse(cx - px * 0.12, by - px * 0.16, px * 0.12, px * 0.2);
  poly(
    g,
    [
      [cx, by + px * 0.38],
      [cx - 6, by + px * 0.5],
      [cx + 6, by + px * 0.5],
    ],
    MAGENTA,
    INK,
    3,
  );
}

/** A balloon that landed: a splash ring in its owner's colour (a grey ring with an "=" when it landed neutral). */
export function drawBalloonSplash(g: G, cx: number, cy: number, px: number, color: number, neutral: boolean, k: number): void {
  g.lineStyle(10, color, 1 - k).strokeCircle(cx, cy, px * (0.6 + 1.8 * k));
  if (neutral)
    g.lineStyle(7, INK, 1 - k)
      .lineBetween(cx - 14, cy - 6, cx + 14, cy - 6)
      .lineBetween(cx - 14, cy + 8, cx + 14, cy + 8);
}
