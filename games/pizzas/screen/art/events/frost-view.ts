// The frost event, drawn: a pale-blue sheet over the whole kitchen that eases in and out, with a few flakes drifting down (the rules are in sim/midround.ts and
// surfaces/physics.ts: every floor tile is ice while `mid.frost` is on).
import type Phaser from 'phaser';
import { H, W } from '@pichi/screen-kit/art';

const FLAKES = 26;
export class FrostView {
  private sheet: Phaser.GameObjects.Rectangle;
  private flakes: Phaser.GameObjects.Arc[] = [];
  private k = 0; // eased 0..1
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.sheet = scene.add
      .rectangle(W / 2, 104 + (H - 104) / 2, W, H - 104, 0x9fd8f2)
      .setDepth(1840)
      .setAlpha(0)
      .setVisible(false);
    for (let i = 0; i < FLAKES; i++)
      this.flakes.push(
        scene.add
          .circle(0, 0, 3 + (i % 3), 0xffffff)
          .setDepth(1841)
          .setAlpha(0)
          .setVisible(false),
      );
  }

  update(dtMs: number, on: boolean) {
    this.t += dtMs;
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dtMs / 400);
    const show = this.k > 0.01;
    this.sheet.setVisible(show).setAlpha(0.42 * this.k);
    this.flakes.forEach((f, i) => {
      const fall = ((this.t / 1000) * (60 + (i % 5) * 18) + i * 97) % (H - 104);
      f.setVisible(show)
        .setAlpha(0.85 * this.k)
        .setPosition(((i * 211) % W) + Math.sin(this.t / 700 + i) * 18, 104 + fall);
    });
  }

  destroy() {
    this.sheet.destroy();
    for (const f of this.flakes) f.destroy();
  }
}
