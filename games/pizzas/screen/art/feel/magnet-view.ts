// Magnetism on screen (feel/magnet.ts): a bracket in the chef's colour around the station its next Tomar / Picar will act on, so you see what the magnet picked before you press.
// Exists only in a round with the magnet on. One Graphics, redrawn every frame (a handful of rectangles).
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import { targetStation } from '../../../sim/overcooked';
import { TILE, chefOf, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';

export class MagnetView {
  private g: Phaser.GameObjects.Graphics;
  private t = 0;
  constructor(
    scene: Phaser.Scene,
    private game: Game,
  ) {
    this.g = scene.add.graphics().setDepth(2000);
  }

  update(dtMs: number) {
    const { g, game } = this;
    this.t += dtMs;
    g.clear();
    if (!game.magnet || game.over || game.countdown > 0) return;
    const pulse = 0.65 + 0.35 * Math.sin(this.t / 140);
    let k = 0;
    for (const p of game.players.values()) {
      if (p.ghost) continue;
      const s = targetStation(game, p);
      if (!s) continue;
      const inset = 3 + (k++ % 3) * 4; // two chefs on one station get nested brackets
      const x = OX + s.tx * TILE + inset,
        y = OY + s.ty * TILE + inset,
        w = TILE - 2 * inset,
        c = TILE * 0.28;
      g.lineStyle(7, 0x2b1b17, 0.55 * pulse);
      this.corners(x, y, w, c);
      g.lineStyle(4, hexNum(chefOf(p.slot).color), 0.95 * pulse);
      this.corners(x, y, w, c);
    }
  }
  private corners(x: number, y: number, w: number, c: number) {
    const g = this.g,
      r = x + w,
      b = y + w;
    for (const [px, py, dx, dy] of [
      [x, y, 1, 1],
      [r, y, -1, 1],
      [x, b, 1, -1],
      [r, b, -1, -1],
    ] as const)
      g.beginPath()
        .moveTo(px, py + dy * c)
        .lineTo(px, py)
        .lineTo(px + dx * c, py)
        .strokePath();
  }
  destroy() {
    this.g.destroy();
  }
}
