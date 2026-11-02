// Manchazo's scene, events layer (F4): the golden zone, the rain band, the vacuum robot, the big pinata with its landing shadow and the disputed Hourglass
// (circle, charge bar, time left). Each reads without colour (shapes and bars). No logic: it reads the sim's state.
import { blastTiles, BIG_RADIUS, CLOCK_FULL, CLOCK_LIVE_TICKS, CLOCK_X, BIG_WARN_TICKS, type ManchazoState } from '../../sim';
import { TEAM_COLOR } from './scene-body';
import type { Frame } from './scene-sabotage';

const GOLD = 0xffd23f;
const RAIN = 0x6ec6ff;

export function drawEvents(f: Frame, s: ManchazoState) {
  const ev = s.match.ev;
  if (!ev) return;
  const { g, x0, y0, px } = f;
  const t = s.grid.tick;
  const z = s.match.zone;
  if (z) {
    const [zx, zy, zw, zh] = [x0 + z.x0 * px, y0 + z.y0 * px, (z.x1 - z.x0 + 1) * px, (z.y1 - z.y0 + 1) * px];
    g.fillStyle(GOLD, 0.22 + 0.08 * Math.sin(t / 8)).fillRect(zx, zy, zw, zh);
    g.lineStyle(5, GOLD, 1).strokeRect(zx + 2, zy + 2, zw - 4, zh - 4);
  }
  if (ev.rain && ev.active) {
    const row = ev.program[ev.next - 1]!.row;
    g.fillStyle(RAIN, 0.2).fillRect(x0, y0 + row * px, 27 * px, 3 * px);
    for (let k = 0; k < 54; k++) {
      const x = x0 + ((k * 97) % (27 * px));
      const y = y0 + row * px + ((k * 41 + t * 6) % (3 * px));
      g.lineStyle(3, RAIN, 0.9).lineBetween(x, y, x - 4, y + 14);
    }
  }
  if (ev.vac) {
    const [cx, cy] = [x0 + ev.vac.x * px + px / 2, y0 + ev.vac.y * px + px / 2];
    g.lineStyle(3, 0xffffff, 0.5).strokeRect(cx - px * 1.5 + 2, cy - px / 2 + 2, px * 3 - 4, px - 4); // the 3 columns it washes
    g.fillStyle(0xdedede, 1).fillRoundedRect(cx - px * 0.45, cy - px * 0.45, px * 0.9, px * 0.9, 12);
    g.lineStyle(4, 0x222222, 1).strokeRoundedRect(cx - px * 0.45, cy - px * 0.45, px * 0.9, px * 0.9, 12);
    g.fillStyle(0x222222, 1)
      .fillCircle(cx - 8, cy - 4, 5)
      .fillCircle(cx + 8, cy - 4, 5);
    g.fillStyle(0xff3b30, 1).fillCircle(cx, cy + 12, 5 + 2 * Math.sin(t / 5));
  }
  if (ev.big) drawBig(f, s, ev.big);
  drawClock(f, s);
}

function drawBig(f: Frame, s: ManchazoState, big: { x: number; y: number; landAt: number }) {
  const { g, x0, y0, px } = f;
  const [cx, cy] = [x0 + big.x * px + px / 2, y0 + big.y * px + px / 2];
  const left = big.landAt - s.grid.tick;
  if (left > 0) {
    const k = 1 - left / BIG_WARN_TICKS; // the shadow grows as it falls
    g.fillStyle(0x000000, 0.35).fillCircle(cx, cy, px * (0.15 + 0.45 * k));
    g.lineStyle(5, 0xffffff, 0.6 + 0.4 * Math.sin(s.grid.tick / 4)).strokeCircle(cx, cy, px * 0.6);
    return;
  }
  for (const [x, y] of blastTiles(big.x, big.y, BIG_RADIUS, s.grid.map))
    g.lineStyle(2, GOLD, 0.45).strokeRect(x0 + x * px + 5, y0 + y * px + 5, px - 10, px - 10);
  g.fillStyle(GOLD, 1).fillCircle(cx, cy, px * 0.55);
  g.lineStyle(6, 0xffffff, 1).strokeCircle(cx, cy, px * 0.55);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + s.grid.tick / 30;
    g.lineStyle(5, 0xff5fa2, 1).lineBetween(
      cx + Math.cos(a) * px * 0.6,
      cy + Math.sin(a) * px * 0.6,
      cx + Math.cos(a) * px * 0.85,
      cy + Math.sin(a) * px * 0.85,
    );
  }
}

function drawClock(f: Frame, s: ManchazoState) {
  const c = s.match.ev!.clock;
  if (c.phase !== 'warn' && c.phase !== 'live') return;
  const { g, x0, y0, px } = f;
  const [cx0, cy0] = [x0 + (CLOCK_X - 1) * px, y0 + (c.row - 1) * px];
  const t = s.grid.tick;
  const color = TEAM_COLOR[c.team]!;
  const falling = c.phase === 'warn';
  g.fillStyle(color, falling ? 0.15 : 0.1).fillRect(cx0, cy0, 3 * px, 3 * px);
  g.lineStyle(falling ? 4 : 7, color, falling ? 0.5 + 0.5 * Math.sin(t / 4) : 1).strokeRect(cx0 + 2, cy0 + 2, 3 * px - 4, 3 * px - 4);
  g.lineStyle(3, 0xffffff, 1).strokeRect(cx0 - 3, cy0 - 3, 3 * px + 6, 3 * px + 6);
  const [mx, my] = [cx0 + 1.5 * px, cy0 + 1.5 * px];
  const sand = falling ? 1 : 1 - c.charge / CLOCK_FULL;
  g.fillStyle(0xffffff, 0.9)
    .fillTriangle(mx - 22, my - 30, mx + 22, my - 30, mx, my)
    .fillTriangle(mx - 22, my + 30, mx + 22, my + 30, mx, my);
  g.fillStyle(GOLD, 1).fillTriangle(mx - 16 * sand, my - 24 + 12 * (1 - sand), mx + 16 * sand, my - 24 + 12 * (1 - sand), mx, my - 2);
  if (falling) return;
  g.fillStyle(0x222222, 1).fillRect(cx0, cy0 + 3 * px + 8, 3 * px, 18); // charge bar under the circle
  g.fillStyle(color, 1).fillRect(cx0, cy0 + 3 * px + 8, (3 * px * c.charge) / CLOCK_FULL, 18);
  g.lineStyle(3, 0xffffff, 1).strokeRect(cx0, cy0 + 3 * px + 8, 3 * px, 18);
  const left = Math.max(0, c.endsAt - t) / CLOCK_LIVE_TICKS; // the 12 s of dispute
  g.fillStyle(0xffffff, 1).fillRect(cx0, cy0 - 16, 3 * px * left, 8);
}
