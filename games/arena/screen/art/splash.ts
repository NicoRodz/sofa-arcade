// The burst of a pinata: when a pot goes off, the diamond it paints flashes in its team colour with a ring of droplets flying out and a star of paint at the
// centre, for half a second. The scene only reads the sim's state, so this follows the pinatas frame to frame: one that was about to go off (fuse <= WENT_OFF)
// and is gone now has exploded (a round that ends clears the list instead). Pure tracking + a Graphics draw.
import type { TileMap } from '../../map';
import { blastTiles, type ManchazoState } from '../../sim';
import { A, TEAM_HEX, num } from './palette';
import { type G, star, WHITE } from './shapes';

export const SPLASH_TICKS = 30;
const WENT_OFF = 3; // a pot whose fuse was this low or less and vanished went off
const DROPS = 14;

type Pot = ManchazoState['match']['pinatas'][number];
export interface Splash {
  x: number; // tile
  y: number;
  team: number;
  radius: number;
  tiles: [number, number][];
  at: number; // tick
}

export class Splashes {
  private prev = new Map<number, Pot>();
  list: Splash[] = [];

  /** Call once per frame with the state: starts the splash of every pot that went off since the last call. */
  track(s: ManchazoState, map: TileMap): void {
    const tick = s.grid.tick;
    this.list = this.list.filter((p) => tick >= p.at && tick - p.at < SPLASH_TICKS);
    const now = new Map(s.match.pinatas.map((p) => [p.id, p]));
    for (const [id, p] of this.prev)
      if (!now.has(id) && p.fuse <= WENT_OFF)
        this.list.push({ x: p.x, y: p.y, team: p.team, radius: p.radius, tiles: blastTiles(p.x, p.y, p.radius, map), at: tick });
    this.prev = new Map([...now].map(([id, p]) => [id, { ...p }]));
  }

  draw(g: G, s: ManchazoState, x0: number, y0: number, px: number): void {
    for (const sp of this.list) {
      const k = (s.grid.tick - sp.at) / SPLASH_TICKS; // 0..1
      const col = num(TEAM_HEX[sp.team % 2]!);
      for (const [x, y] of sp.tiles) g.fillStyle(col, 0.55 * (1 - k)).fillRect(x0 + x * px, y0 + y * px, px, px);
      const [cx, cy] = [x0 + sp.x * px + px / 2, y0 + sp.y * px + px / 2];
      const reach = (sp.radius + 0.6) * px;
      for (let d = 0; d < DROPS; d++) {
        const a = (d / DROPS) * Math.PI * 2 + (d % 2) * 0.12;
        const r = reach * (0.25 + 0.75 * Math.sqrt(k)) * (d % 3 === 0 ? 0.8 : 1);
        g.fillStyle(d % 4 === 0 ? WHITE : col, 1 - k).fillCircle(
          cx + Math.cos(a) * r,
          cy + Math.sin(a) * r,
          px * (0.14 - 0.08 * k) * (d % 2 ? 1 : 1.3),
        );
      }
      star(g, cx, cy, px * (0.35 + 0.8 * k), px * (0.18 + 0.35 * k), 8, 0.4, col, num(A.ink), 3);
    }
  }
}
