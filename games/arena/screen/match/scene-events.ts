// Manchazo's scene, events layer (F4): the golden zone, the rain band, the vacuum robot, the big pinata with its landing shadow and the disputed Hourglass
// (circle, charge bar, time left). Their art is in ../art/event-art.ts; each reads without colour (shapes and bars). No logic: it reads the sim's state.
import { blastTiles, BIG_RADIUS, CLOCK_FULL, CLOCK_LIVE_TICKS, CLOCK_X, BIG_WARN_TICKS, type ManchazoState } from '../../sim';
import { A, num } from '../art/palette';
import { drawBigPinata, drawGoldZone, drawHourglass, drawRain, drawRobot } from '../art/event-art';
import { TEAM_COLOR } from './scene-body';
import type { Frame } from './scene-sabotage';

const GOLD = num(A.gold);

export function drawEvents(f: Frame, s: ManchazoState) {
  const ev = s.match.ev;
  if (!ev) return;
  const { g, x0, y0, px } = f;
  const t = s.grid.tick;
  const z = s.match.zone;
  if (z) drawGoldZone(g, x0 + z.x0 * px, y0 + z.y0 * px, (z.x1 - z.x0 + 1) * px, (z.y1 - z.y0 + 1) * px, t);
  if (ev.rain && ev.active) drawRain(g, x0, y0 + ev.program[ev.next - 1]!.row * px, 27 * px, 3 * px, px, t);
  if (ev.vac) drawRobot(g, x0 + ev.vac.x * px + px / 2, y0 + ev.vac.y * px + px / 2, px, t);
  if (ev.big) drawBig(f, s, ev.big);
  drawClock(f, s);
}

function drawBig(f: Frame, s: ManchazoState, big: { x: number; y: number; landAt: number }) {
  const { g, x0, y0, px } = f;
  const [cx, cy] = [x0 + big.x * px + px / 2, y0 + big.y * px + px / 2];
  const left = big.landAt - s.grid.tick;
  if (left <= 0)
    for (const [x, y] of blastTiles(big.x, big.y, BIG_RADIUS, s.grid.map))
      g.lineStyle(2, GOLD, 0.45).strokeRect(x0 + x * px + 5, y0 + y * px + 5, px - 10, px - 10);
  drawBigPinata(g, cx, cy, px, Math.max(0, left) / BIG_WARN_TICKS, s.grid.tick);
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
  drawHourglass(g, cx0 + 1.5 * px, cy0 + 1.5 * px, falling ? 1 : 1 - c.charge / CLOCK_FULL, c.team);
  if (falling) return;
  g.fillStyle(0x222222, 1).fillRect(cx0, cy0 + 3 * px + 8, 3 * px, 18); // charge bar under the circle
  g.fillStyle(color, 1).fillRect(cx0, cy0 + 3 * px + 8, (3 * px * c.charge) / CLOCK_FULL, 18);
  g.lineStyle(3, 0xffffff, 1).strokeRect(cx0, cy0 + 3 * px + 8, 3 * px, 18);
  const left = Math.max(0, c.endsAt - t) / CLOCK_LIVE_TICKS; // the 12 s of dispute
  g.fillStyle(0xffffff, 1).fillRect(cx0, cy0 - 16, 3 * px * left, 8);
}
