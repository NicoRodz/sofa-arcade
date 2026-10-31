// Ice inertia, drawn under the chef: an arrow along its velocity (longer = faster, so the group sees where it will keep going) and a fading streak behind. Only while the chef stands
// on ice (the same test as the skate pose: surfaces/physics.ts). Under the chefs (depth 99), over the floor.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import { surfaceAt } from '../../../sim/surfaces/physics';
import { TILE, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';

const MIN_SPEED = 0.45; // tiles/s: below it there is no drift worth drawing
const FULL_SPEED = 5; // tiles/s that draws the longest arrow
const TRAIL_MS = 380;
const SHAFT = 16;

export class IceDrift {
  readonly g: Phaser.GameObjects.Graphics;
  private trails = new Map<number, { x: number; y: number; t: number }[]>();
  private t = 0;
  constructor(
    scene: Phaser.Scene,
    private game: Game,
  ) {
    this.g = scene.add.graphics().setDepth(99);
  }

  update(dtMs: number) {
    this.t += dtMs;
    const { g, game } = this;
    g.clear();
    for (const p of game.players.values()) {
      const speed = Math.hypot(p.vx, p.vy);
      const trail = this.trails.get(p.id) ?? [];
      this.trails.set(p.id, trail);
      const on = !p.ghost && !p.assist && speed > MIN_SPEED && surfaceAt(game, p.x, p.y)?.kind === 'ice';
      const fx = OX + p.x * TILE,
        fy = OY + (p.y + 0.3) * TILE;
      if (on) trail.push({ x: fx, y: fy, t: this.t });
      while (trail.length && this.t - trail[0]!.t > TRAIL_MS) trail.shift();
      // the streak: a tapering white line through the last positions
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]!,
          b = trail[i]!,
          k = 1 - (this.t - b.t) / TRAIL_MS;
        g.lineStyle(6 + 14 * k, 0xffffff, 0.55 * k).lineBetween(a.x, a.y, b.x, b.y);
      }
      if (!on) continue;
      const ux = p.vx / speed,
        uy = p.vy / speed,
        len = TILE * (0.5 + 1.0 * Math.min(1, speed / FULL_SPEED)),
        nx = -uy,
        ny = ux,
        sx = fx + ux * TILE * 0.18,
        sy = fy + uy * TILE * 0.18,
        tx = sx + ux * len,
        ty = sy + uy * len,
        hl = SHAFT * 1.9,
        hw = SHAFT * 1.5,
        bx = tx - ux * hl,
        by = ty - uy * hl;
      const poly = (w: number, color: number, alpha: number) => {
        const pts: [number, number][] = [
          [sx + nx * w, sy + ny * w],
          [bx + nx * w, by + ny * w],
          [bx + nx * (hw + w), by + ny * (hw + w)],
          [tx + ux * w * 1.6, ty + uy * w * 1.6],
          [bx - nx * (hw + w), by - ny * (hw + w)],
          [bx - nx * w, by - ny * w],
          [sx - nx * w, sy - ny * w],
        ];
        g.fillStyle(color, alpha).beginPath().moveTo(pts[0]![0], pts[0]![1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
        g.closePath().fillPath();
      };
      poly(SHAFT / 2 + 5, 0x1d3b52, 1); // the outline: dark blue, the ice around it is pale
      poly(SHAFT / 2, hexNum('#4FB3F0'), 1);
      poly(SHAFT / 5, 0xffffff, 0.9); // a bright core
    }
    for (const id of [...this.trails.keys()]) if (!game.players.has(id)) this.trails.delete(id);
  }
}
