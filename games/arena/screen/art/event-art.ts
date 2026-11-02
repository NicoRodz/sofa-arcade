// The events of the match, each with a look of its own: golden tiles that glitter, rain with clouds and drops, the vacuum robot with its brush and LED, the big
// pinata (a giant golden pot that falls onto its shadow) and the Hourglass in its dispute circle. Vector, per frame; the sim decides what is on.
import { A, TEAM_DARK, TEAM_HEX, num } from './palette';
import { drawPot, potLook } from './pot';
import { type G, INK, WHITE, poly, star } from './shapes';

const GOLD = num(A.gold);
const RAIN = num('#6EC6FF');

/** The golden zone (tile rectangle): a gold wash, a double border and sparkles that blink. */
export function drawGoldZone(g: G, x: number, y: number, w: number, h: number, tick: number): void {
  g.fillStyle(GOLD, 0.26 + 0.08 * Math.sin(tick / 8)).fillRect(x, y, w, h);
  g.lineStyle(6, num(A.goldDark), 1).strokeRect(x + 3, y + 3, w - 6, h - 6);
  g.lineStyle(3, GOLD, 1).strokeRect(x + 9, y + 9, w - 18, h - 18);
  for (let k = 0; k < 9; k++) {
    const phase = (tick / 30 + k * 0.37) % 1;
    const sx = x + 20 + ((k * 137) % Math.max(1, w - 40)),
      sy = y + 20 + ((k * 89) % Math.max(1, h - 40));
    star(g, sx, sy, 4 + 12 * Math.sin(phase * Math.PI), 2, 4, Math.PI / 4, WHITE);
  }
}

/** The rain band (3 rows from `y`): a blue wash, a bank of clouds on top and falling drops. */
export function drawRain(g: G, x: number, y: number, w: number, h: number, px: number, tick: number): void {
  g.fillStyle(RAIN, 0.22).fillRect(x, y, w, h);
  for (let k = 0; k < w / px; k++)
    g.fillStyle(num('#E8F4FF'), 0.95)
      .fillCircle(x + k * px + px / 2, y + 6, px * 0.42)
      .fillCircle(x + k * px + px * 0.15, y + 12, px * 0.28);
  for (let k = 0; k < 54; k++) {
    const dx = x + ((k * 97) % w),
      dy = y + 20 + ((k * 41 + tick * 6) % (h - 20));
    poly(
      g,
      [
        [dx, dy],
        [dx - 3, dy + 9],
        [dx + 3, dy + 9],
      ],
      RAIN,
      undefined,
    );
    g.fillStyle(RAIN, 1).fillCircle(dx, dy + 10, 3.5);
  }
}

/** The vacuum robot centred on (cx, cy): a round body with a dark bumper, a green LED that blinks, a spinning side brush and a trail of bubbles. */
export function drawRobot(g: G, cx: number, cy: number, px: number, tick: number): void {
  const u = px * 1.3; // the body is drawn a third bigger than its tile: it reads from the couch, and the white box still shows the 3 columns it washes
  g.lineStyle(3, WHITE, 0.5).strokeRect(cx - px * 1.5 + 2, cy - px / 2 + 2, px * 3 - 4, px - 4); // the 3 columns it washes
  g.fillStyle(0x000000, 0.25).fillCircle(cx + 2, cy + 4, u * 0.46);
  g.fillStyle(num('#EDEDED'), 1).fillCircle(cx, cy, u * 0.44);
  g.lineStyle(4, INK, 1).strokeCircle(cx, cy, u * 0.44);
  g.lineStyle(7, num('#4A4A55'), 1)
    .beginPath()
    .arc(cx, cy, u * 0.36, Math.PI * 0.15, Math.PI * 0.85, false)
    .strokePath(); // bumper
  g.fillStyle(num('#4A4A55'), 1).fillCircle(cx, cy - u * 0.05, u * 0.17);
  g.fillStyle(WHITE, 1).fillCircle(cx, cy - u * 0.05, u * 0.08);
  g.fillStyle(tick % 40 < 20 ? num('#3DD16A') : num('#1B7A3A'), 1).fillCircle(cx + u * 0.24, cy - u * 0.2, u * 0.05);
  for (let k = 0; k < 3; k++) {
    const a = tick / 4 + (k * Math.PI * 2) / 3;
    g.lineStyle(3, INK, 1).lineBetween(
      cx - u * 0.34,
      cy + u * 0.26,
      cx - u * 0.34 + Math.cos(a) * u * 0.14,
      cy + u * 0.26 + Math.sin(a) * u * 0.14,
    );
  }
  for (let k = 0; k < 4; k++)
    g.lineStyle(2, WHITE, 0.9).strokeCircle(cx + u * (0.5 + k * 0.18), cy + ((k * 7 + tick / 3) % 14) - 7, 3 + (k % 2) * 2);
}

/** The big pinata: while it falls, its shadow grows and the pot comes down over it; on the floor it is a golden pot twice the size with a star on it. */
export function drawBigPinata(g: G, cx: number, cy: number, px: number, falling: number, tick: number): void {
  // falling: 1 at the start of the warning .. 0 once landed
  if (falling > 0) {
    const k = 1 - falling;
    g.fillStyle(0x000000, 0.35).fillCircle(cx, cy, px * (0.15 + 0.5 * k));
    g.lineStyle(5, WHITE, 0.6 + 0.4 * Math.sin(tick / 4)).strokeCircle(cx, cy, px * 0.7);
    g.lineStyle(3, GOLD, 0.9).strokeCircle(cx, cy, px * 0.92);
    drawPot(g, cx, cy - falling * falling * px * 3.5, px * 1.6, potLook(-1), 1, tick);
    return;
  }
  drawPot(g, cx, cy - px * 0.12, px * 1.8, potLook(-1), 1, tick);
}

/** The Hourglass: a wooden frame with two glass bulbs and gold sand (`sand` 1 = all on top), inside the team ring that disputes it. */
export function drawHourglass(g: G, mx: number, my: number, sand: number, team: number): void {
  const wood = num(A.wood);
  g.fillStyle(0x000000, 0.2).fillEllipse(mx + 2, my + 38, 64, 14);
  poly(
    g,
    [
      [mx - 26, my - 36],
      [mx + 26, my - 36],
      [mx + 24, my - 30],
      [mx + 5, my - 2],
      [mx + 24, my + 30],
      [mx + 26, my + 36],
      [mx - 26, my + 36],
      [mx - 24, my + 30],
      [mx - 5, my - 2],
      [mx - 24, my - 30],
    ],
    num('#E8F6FF'),
    INK,
    3,
    0.95,
  );
  const top = Math.max(0, Math.min(1, sand)) * 22,
    bot = (1 - Math.max(0, Math.min(1, sand))) * 22;
  if (top > 1)
    poly(
      g,
      [
        [mx - 18 * (top / 22) - 2, my - 30 + (22 - top)],
        [mx + 18 * (top / 22) + 2, my - 30 + (22 - top)],
        [mx + 3, my - 4],
        [mx - 3, my - 4],
      ],
      GOLD,
    );
  if (bot > 1)
    poly(
      g,
      [
        [mx - 20 * (bot / 22) - 2, my + 30],
        [mx + 20 * (bot / 22) + 2, my + 30],
        [mx + 4, my + 30 - bot],
        [mx - 4, my + 30 - bot],
      ],
      GOLD,
    );
  g.lineStyle(2, GOLD, 1).lineBetween(mx, my - 4, mx, my + 26); // the stream
  g.fillStyle(wood, 1)
    .fillRoundedRect(mx - 32, my - 44, 64, 10, 4)
    .fillRoundedRect(mx - 32, my + 34, 64, 10, 4);
  g.lineStyle(3, INK, 1)
    .strokeRoundedRect(mx - 32, my - 44, 64, 10, 4)
    .strokeRoundedRect(mx - 32, my + 34, 64, 10, 4);
  g.fillStyle(num(TEAM_HEX[team % 2]!), 1)
    .fillCircle(mx, my + 56, 5)
    .lineStyle(2, num(TEAM_DARK[team % 2]!), 1)
    .strokeCircle(mx, my + 56, 5);
}
