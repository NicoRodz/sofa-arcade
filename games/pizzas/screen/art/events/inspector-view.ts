// The inspector's verdict, drawn: the stamp at the window (APROBADO / RECHAZADO) with the points or the dirty-plates note. Its pill (the dirty plates count) is in view.ts.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import { C, H, TILE, W } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { makeText } from '@pichi/screen-kit/art/fx';
import type { Game } from '../../../sim/overcooked';

export class InspectorView {
  private off: (() => void)[] = [];
  private stamps: Phaser.GameObjects.Text[] = [];

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    const winTile = (team?: number) => {
      const s = game.stations.find((x) => x.kind === 'window' && (team === undefined || x.owner === team));
      return s ? { x: OX + (s.tx + 0.5) * TILE, y: OY + (s.ty + 0.5) * TILE } : { x: W / 2, y: H / 2 };
    };
    this.off.push(
      bus.on('event:inspector', (e) => {
        const p = winTile(e.team);
        const label = makeText(this.scene, p.x, p.y + TILE * 1.5, e.passed ? '¡APROBADO!' : '¡RECHAZADO!', {
          size: 46,
          color: e.passed ? C.basil : C.danger,
          stroke: 8,
          depth: 2450,
        })
          .setAngle(-8)
          .setScale(2.2)
          .setAlpha(0);
        this.stamps.push(label);
        this.scene.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 200, ease: 'back.out' });
        this.scene.tweens.add({
          targets: label,
          alpha: 0,
          y: label.y - 40,
          delay: 1500,
          duration: 500,
          onComplete: () => {
            label.destroy();
            this.stamps = this.stamps.filter((x) => x !== label);
          },
        });
        if (e.passed) {
          this.fx.float(p.x, p.y + TILE * 0.6, `+${e.points}`, C.cheese, 52);
          this.fx.confettiBurst(p.x, p.y);
          this.fx.starBurst(p.x, p.y - TILE * 0.3, 6);
        } else {
          this.fx.float(p.x, p.y + TILE * 0.6, 'Platos sucios', '#FF8D8D', 34);
          this.fx.shake(120, 0.004);
        }
      }),
    );
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    for (const s of this.stamps) s.destroy();
    this.stamps = [];
  }
}
