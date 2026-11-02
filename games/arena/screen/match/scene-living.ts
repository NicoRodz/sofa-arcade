// Manchazo's scene, living-map layer (F5): the brushes, the sofas and the fountain (their art is in ../art/living-art.ts). Every change is announced 1 s before:
// the tiles about to shut blink in white outline and the part shows a stripe. No logic: it reads the sim's state.
import { closedTiles, mirrorTile, pivotsOf, statesOf } from '../../map';
import { FOUNTAIN_RADIUS, WARN_TICKS, nextChange, type ManchazoState } from '../../sim';
import { A, num } from '../art/palette';
import { dashRect, drawBrush, drawFountain, drawSofa } from '../art/living-art';
import type { Frame } from './scene-frame';
import { TEAM_COLOR } from './scene-body';

const FLASH_TICKS = 24; // a part that just moved, or a splash, shows it this long
const WATER = num(A.water);

export function drawLiving(f: Frame, s: ManchazoState) {
  const live = s.match.live;
  if (!live) return;
  const { g, x0, y0, px } = f;
  const t = s.grid.tick;
  const tile = (x: number, y: number) => [x0 + x * px, y0 + y * px] as const;
  for (const p of live.pairs) {
    const info = nextChange(p, t, WARN_TICKS);
    const blink = Math.floor(t / 8) % 2 === 0;
    const flash = p.movedAt >= 0 && t - p.movedAt < FLASH_TICKS;
    const closed = closedTiles(p.spec, p.state); // [left, left, right, right]
    if (p.spec.kind === 'sofa') {
      const vertical = p.spec.variant === 1;
      for (const m of [0, 1]) {
        const rail = [0, 1, 2].map((i): readonly [number, number] => {
          const r: readonly [number, number] = vertical ? [p.spec.x, p.spec.y + i] : [p.spec.x + i, p.spec.y];
          return m ? mirrorTile(r) : r;
        });
        const [rx, ry] = tile(Math.min(...rail.map((r) => r[0])), Math.min(...rail.map((r) => r[1])));
        dashRect(g, rx + 5, ry + 5, (vertical ? 1 : 3) * px - 10, (vertical ? 3 : 1) * px - 10, num(A.sofaDark), 0.55); // the rail
        const [a, b] = [closed[2 * m]!, closed[2 * m + 1]!];
        const [sx, sy] = tile(Math.min(a[0], b[0]), Math.min(a[1], b[1]));
        drawSofa(g, sx, sy, (vertical ? 1 : 2) * px, (vertical ? 2 : 1) * px, vertical, flash);
      }
    } else if (p.spec.kind === 'brush') {
      pivotsOf(p.spec).forEach(([x, y], m) => {
        const first = closed[2 * m]!;
        drawBrush(g, x0 + x * px + px / 2, y0 + y * px + px / 2, first[0] - x, first[1] - y, px, p.owner[m]!, flash);
      });
    }
    if (info.warning) {
      for (const [x, y] of closed) {
        if (!blink) continue;
        const [tx, ty] = tile(x, y);
        g.lineStyle(5, 0xffffff, 0.9).lineBetween(tx + 6, ty + 6, tx + px - 6, ty + px - 6); // stripe: about to move
      }
      const next = (p.state + 1) % statesOf(p.spec.kind);
      const was = new Set(closed.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of closedTiles(p.spec, next)) {
        if (was.has(`${x},${y}`)) continue;
        const [tx, ty] = tile(x, y);
        g.lineStyle(5, 0xffffff, blink ? 1 : 0.35).strokeRect(tx + 6, ty + 6, px - 12, px - 12); // where it will land
        g.fillStyle(0xffffff, blink ? 0.22 : 0.08).fillRect(tx + 6, ty + 6, px - 12, px - 12);
      }
    }
  }
  const fo = live.fountain;
  if (fo) {
    const [tx, ty] = tile(fo.x, fo.y);
    const [cx, cy] = [tx + px / 2, ty + px / 2];
    const left = fo.period - ((t + fo.offset) % fo.period);
    const warn = left <= WARN_TICKS;
    const R = (FOUNTAIN_RADIUS + 0.5) * px;
    g.lineStyle(warn ? 5 : 3, WATER, warn ? 0.95 : 0.4)
      .beginPath()
      .moveTo(cx, cy - R)
      .lineTo(cx + R, cy)
      .lineTo(cx, cy + R)
      .lineTo(cx - R, cy)
      .closePath()
      .strokePath(); // the splash diamond: within 2 tiles
    if (warn) g.fillStyle(WATER, 0.12 + 0.1 * Math.sin(t / 4)).fillCircle(cx, cy, R * 0.8);
    drawFountain(g, cx, cy, px, warn, t);
    if (fo.last && t - fo.last.tick < FLASH_TICKS) {
      const k = (t - fo.last.tick) / FLASH_TICKS;
      g.lineStyle(8, fo.last.team >= 0 ? TEAM_COLOR[fo.last.team]! : 0xffffff, 1 - k).strokeCircle(cx, cy, px * (0.5 + 2.2 * k));
    }
  }
}
