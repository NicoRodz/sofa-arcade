// Manchazo's scene, living-map layer (F5): the brushes (yellow bars, the pivot ring in the colour of the team that last stood on it), the sofas (purple, with
// a stitched edge), the fountain with its splash diamond. Every change is announced 1 s before: the tiles about to shut blink in white outline and the part
// shows a stripe. Shapes differ as well as colours (bar with a ring, sofa with cushions, fountain with a basin). No logic: it reads the sim's state.
import { closedTiles, pivotsOf, statesOf } from '../../map';
import { FOUNTAIN_RADIUS, WARN_TICKS, nextChange, type ManchazoState } from '../../sim';
import { TEAM_COLOR } from './scene-body';
import type { Frame } from './scene-sabotage';

const BRUSH = 0xf0e442;
const SOFA = 0xcc79a7;
const WATER = 0x9ad0f5;
const FLASH_TICKS = 24; // a part that just moved, or a splash, shows it this long

export function drawLiving(f: Frame, s: ManchazoState) {
  const live = s.match.live;
  if (!live) return;
  const { g, x0, y0, px } = f;
  const t = s.grid.tick;
  const tile = (x: number, y: number) => [x0 + x * px, y0 + y * px] as const;
  for (const p of live.pairs) {
    const color = p.spec.kind === 'brush' ? BRUSH : SOFA;
    const info = nextChange(p, t, WARN_TICKS);
    const blink = Math.floor(t / 8) % 2 === 0;
    const flash = p.movedAt >= 0 && t - p.movedAt < FLASH_TICKS;
    for (const [x, y] of closedTiles(p.spec, p.state)) {
      const [tx, ty] = tile(x, y);
      g.fillStyle(color, 1).fillRoundedRect(tx + 3, ty + 3, px - 6, px - 6, 8);
      g.lineStyle(flash ? 6 : 3, flash ? 0xffffff : 0x1c1c1c, 1).strokeRoundedRect(tx + 3, ty + 3, px - 6, px - 6, 8);
      if (p.spec.kind === 'sofa')
        g.fillStyle(0x7a3e62, 1).fillRoundedRect(tx + 10, ty + 10, px - 20, px - 20, 6); // the cushion
      else g.fillStyle(0x1c1c1c, 0.55).fillRect(tx + 6, ty + px / 2 - 3, px - 12, 6); // the brush's bristles line
      if (info.warning && blink) g.lineStyle(5, 0xffffff, 0.9).lineBetween(tx + 6, ty + 6, tx + px - 6, ty + px - 6); // stripe: about to move
    }
    if (info.warning) {
      const next = (p.state + 1) % statesOf(p.spec.kind);
      const was = new Set(closedTiles(p.spec, p.state).map(([x, y]) => `${x},${y}`));
      for (const [x, y] of closedTiles(p.spec, next)) {
        if (was.has(`${x},${y}`)) continue;
        const [tx, ty] = tile(x, y);
        g.lineStyle(5, 0xffffff, blink ? 1 : 0.35).strokeRect(tx + 6, ty + 6, px - 12, px - 12); // where it will land
        g.fillStyle(0xffffff, blink ? 0.22 : 0.08).fillRect(tx + 6, ty + 6, px - 12, px - 12);
      }
    }
    if (p.spec.kind === 'brush')
      pivotsOf(p.spec).forEach(([x, y], side) => {
        const [tx, ty] = tile(x, y);
        const owner = p.owner[side]!;
        g.fillStyle(owner >= 0 ? TEAM_COLOR[owner]! : 0x8a8a8a, 1).fillCircle(tx + px / 2, ty + px / 2, px * 0.3);
        g.lineStyle(5, BRUSH, 1).strokeCircle(tx + px / 2, ty + px / 2, px * 0.38);
      });
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
    g.fillStyle(WATER, 1).fillCircle(cx, cy, px * 0.4);
    g.lineStyle(5, 0xffffff, 1).strokeCircle(cx, cy, px * 0.4);
    g.fillStyle(0xffffff, 0.9).fillCircle(cx, cy - 3, px * 0.12);
    if (fo.last && t - fo.last.tick < FLASH_TICKS) {
      const k = (t - fo.last.tick) / FLASH_TICKS;
      g.lineStyle(8, fo.last.team >= 0 ? TEAM_COLOR[fo.last.team]! : 0xffffff, 1 - k).strokeCircle(cx, cy, px * (0.5 + 2.2 * k));
    }
  }
}
