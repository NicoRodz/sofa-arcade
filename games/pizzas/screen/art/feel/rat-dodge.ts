// The rat of HAZARD_V2 that dodges a dash (sim/feel/rat-v2.ts), drawn so that a group that never played reads it: the jump is a hop with a white streak and ghost copies behind it and a
// "¡FIU!"; then it PANTS for `pantMs`: sweat drops fly off its head, it heaves, a target ring closes in on it and "¡AHORA!" blinks over it, which is the window for a second chef.
// Reads `game.mid.rat` (dodgeMs / dodgeFrom / pantMs); the hop and the heave are applied to the sprite by events/view.ts through `ratLift`.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import { ratParams } from '../../../sim/feel/rat-v2';
import { C, TILE, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';

/** Pixels the rat sprite rises now: an arc while it jumps aside, a small fast heave while it pants. */
export function ratLift(g: Game): number {
  const r = g.mid?.rat;
  if (!r || !g.hz) return 0;
  const jump = ratParams(g).dodgeMs;
  if ((r.dodgeMs ?? 0) > 0 && jump > 0) return Math.sin(Math.PI * (1 - r.dodgeMs! / jump)) * TILE * 0.6;
  return (r.pantMs ?? 0) > 0 ? Math.abs(Math.sin(g.time / 55)) * 6 : 0;
}

export class RatDodge {
  readonly g: Phaser.GameObjects.Graphics;
  private now: Phaser.GameObjects.Text;
  private ghost = 0; // ms to the next ghost copy
  private sweat = 0; // ms to the next sweat drop
  private t = 0;
  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.g = scene.add.graphics().setDepth(2150);
    this.now = makeText(scene, 0, 0, '¡AHORA!', { size: 54, color: C.cheese, stroke: 9, depth: 2160 }).setVisible(false);
    const off = bus.on('rat:dodge', () => {
      const r = game.mid?.rat;
      if (!r) return;
      const x = OX + r.x * TILE,
        y = OY + r.y * TILE;
      this.fx.float(x, y - TILE * 0.95, '¡FIU!', '#FFFFFF', 64);
      this.fx.ring(x, y + TILE * 0.2, 0xffffff, 0.3, 1.5);
    });
    this.g.once('destroy', () => {
      off();
      this.now.destroy();
    });
  }

  update(dtMs: number) {
    this.t += dtMs;
    const { g, game } = this;
    g.clear();
    const r = game.mid?.rat;
    if (!r || r.scared || game.over || !game.hz) return this.now.setVisible(false);
    const x = OX + r.x * TILE,
      y = OY + r.y * TILE + TILE * 0.34;
    if ((r.dodgeMs ?? 0) > 0 && r.dodgeFrom) {
      const fx0 = OX + r.dodgeFrom[0] * TILE,
        fy0 = OY + r.dodgeFrom[1] * TILE + TILE * 0.34;
      for (const [w, a] of [
        [22, 0.35],
        [10, 0.9],
      ] as const)
        g.lineStyle(w, 0xffffff, a).lineBetween(fx0, fy0 - TILE * 0.1, x, y - TILE * 0.1); // the streak from where it was
      this.ghost -= dtMs;
      if (this.ghost <= 0) {
        this.ghost = 28;
        const img = this.scene.add
          .image(x, y, 'rat')
          .setTint(0xbfe8f5)
          .setAlpha(0.6)
          .setDepth(2149)
          .setScale(0.92 * (TILE / 120));
        img.setFlipX(x < fx0);
        this.scene.tweens.add({ targets: img, alpha: 0, duration: 240, onComplete: () => img.destroy() });
      }
    }
    const pant = r.pantMs ?? 0;
    if (pant <= 0) return this.now.setVisible(false);
    // the window: a ring that closes on the rat, sweat drops, and the word
    const total = ratParams(game).pantMs || 600,
      k = Math.max(0, Math.min(1, pant / total)),
      pulse = 0.5 + 0.5 * Math.sin(this.t / 60);
    g.lineStyle(8, hexNum(C.cheese), 0.6 + 0.4 * pulse).strokeCircle(x, y - TILE * 0.15, TILE * (0.42 + 0.5 * k));
    g.lineStyle(4, 0x2b1b17, 0.8).strokeCircle(x, y - TILE * 0.15, TILE * (0.42 + 0.5 * k) + 6);
    this.now
      .setVisible(true)
      .setPosition(x, y - TILE * 1.45)
      .setScale(1 + 0.12 * pulse)
      .setColor(pulse > 0.5 ? C.cheese : '#FFFFFF');
    this.sweat -= dtMs;
    if (this.sweat <= 0) {
      this.sweat = 85;
      const side = Math.random() < 0.5 ? -1 : 1;
      const d = this.scene.add
        .image(x + side * TILE * 0.12, y - TILE * 0.5, 'fx_dot')
        .setTint(0x7fd0f2)
        .setScale(1.6)
        .setDepth(2152);
      this.scene.tweens.add({
        targets: d,
        x: d.x + side * (TILE * 0.3 + Math.random() * TILE * 0.2),
        y: d.y + TILE * 0.35,
        alpha: 0,
        duration: 480,
        ease: 'quad.in',
        onComplete: () => d.destroy(),
      });
    }
  }
}
