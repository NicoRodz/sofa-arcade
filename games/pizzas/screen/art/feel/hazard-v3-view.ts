// HAZARD_V3 on the TV, the parts that are not a mechanic's own layer: the two caves of the rat (map 15) and the floating texts of what just happened ("¡Se cayó la pizza!" when a Bandeja plate is lost on oil,
// "¡Puente reparado!" when a chef finishes mending). Self-managed like the other feel views: `update` is called by addHazardFeel and `g` goes away with the round's children.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { TILE } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';

export class HazardV3View {
  readonly g: Phaser.GameObjects.Graphics;
  private off: (() => void)[] = [];
  private t = 0;
  constructor(
    scene: Phaser.Scene,
    private game: Game,
    fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.g = scene.add.graphics().setDepth(1.56); // over the floor, under the stations, the rat and the chefs
    this.off.push(
      bus.on('mech:trayLoss', (e) => {
        const p = game.players.get(e.player);
        if (p) fx.float(OX + p.x * TILE, OY + p.y * TILE - TILE * 1.1, '¡Se cayó la pizza!', '#FF6B4A', 52);
      }),
      bus.on('mech:bridgeMend', (e) =>
        fx.float(OX + ((e.tile % 16) + 0.5) * TILE, OY + Math.floor(e.tile / 16) * TILE - TILE * 0.75, '¡Puente reparado!', '#8DF08D', 44),
      ),
    );
    this.g.once('destroy', () => {
      for (const f of this.off) f();
      this.off = [];
    });
  }

  update(dtMs: number) {
    const { g, game } = this;
    this.t += dtMs;
    g.clear();
    if (!game.caves) return;
    for (const [i, [cx, cy]] of [...game.caves.at].sort((a, b) => a[1] - b[1] || a[0] - b[0]).entries()) {
      const x = OX + (cx + 0.5) * TILE,
        y = OY + (cy + 0.5) * TILE,
        pulse = 0.5 + 0.5 * Math.sin(this.t / 400 + i * 2);
      g.fillStyle(0x2b1b17, 0.9).fillEllipse(x, y + TILE * 0.08, TILE * 0.96, TILE * 0.62); // the rim
      g.fillStyle(0x0d0806, 1).fillEllipse(x, y + TILE * 0.12, TILE * 0.78, TILE * 0.46); // the hole
      g.lineStyle(4, 0xd7263d, 0.35 + 0.35 * pulse).strokeEllipse(x, y + TILE * 0.08, TILE * 0.96, TILE * 0.62);
      g.fillStyle(0xfff1d6, 0.9)
        .fillCircle(x - TILE * 0.12, y + TILE * 0.1, TILE * 0.035)
        .fillCircle(x + TILE * 0.12, y + TILE * 0.1, TILE * 0.035); // eyes in the dark
    }
  }
}
