// Art of 'beltReverse' (drawn by code), implemented by T1b: it repaints each floor belt lane over the plain surface (so the chevrons follow the LIVE direction of the tile and turn round with it) and,
// in the 180 ticks before a flip, the rails and the arrows blink violet. `BeltReverseView` is self-managed like SurfaceView; the scene creates one when `game.flags.mech.beltReverse` is on (hook requested).
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { BELT_SPEED } from '../../../../sim/surfaces/config';
import { BELT_WARN } from '../../../../sim/mech/beltReverse/module';
import { OX, OY, TILE } from '@pichi/screen-kit/art/tokens';

const C = { base: 0x3a3f47, rail: 0xf2b632, chevron: 0xffd966, dark: 0x262a30, warn: 0xb18cff };
const DEPTH = 1.6; // over SurfaceView (1.5): it covers the lane it drew with the old direction

export class BeltReverseView {
  private gfx: Phaser.GameObjects.Graphics;
  private t = 0;
  constructor(
    scene: Phaser.Scene,
    private game: Game,
  ) {
    this.gfx = scene.add.graphics().setDepth(DEPTH);
    const tick = (_time: number, dtMs: number) => this.update(dtMs);
    scene.events.on('update', tick);
    this.gfx.once('destroy', () => scene.events.off('update', tick));
  }

  private update(dtMs: number) {
    this.t += dtMs;
    const g = this.gfx;
    g.clear();
    const belt = this.game.mech?.belt;
    if (!belt) return;
    const warn = belt.next <= BELT_WARN;
    const flash = warn && Math.floor(this.t / 150) % 2 === 0;
    const phase = ((this.t / 1000) * BELT_SPEED) % 1;
    this.game.grid.forEach((row, ty) =>
      row.forEach((tile, tx) => {
        if (tile.kind !== 'floor' || tile.surface?.kind !== 'belt') return;
        const { dx, dy } = tile.surface;
        const x = OX + tx * TILE,
          y = OY + ty * TILE,
          rail = TILE * 0.09;
        g.fillStyle(C.base, 1).fillRect(x, y, TILE, TILE);
        g.fillStyle(flash ? C.warn : C.rail, 1);
        if (dx !== 0) g.fillRect(x, y, TILE, rail).fillRect(x, y + TILE - rail, TILE, rail);
        else g.fillRect(x, y, rail, TILE).fillRect(x + TILE - rail, y, rail, TILE);
        g.lineStyle(1, C.dark, 0.6).strokeRect(x, y, TILE, TILE);
        for (const o of [0, 0.5]) {
          const s = ((phase + o) % 1) - 0.5;
          g.lineStyle(Math.max(3, TILE * 0.07), flash ? C.warn : C.chevron, Math.max(0.15, 1 - Math.abs(s) * 1.4));
          this.chevron(g, x + TILE / 2 + dx * s * TILE, y + TILE / 2 + dy * s * TILE, dx, dy);
        }
      }),
    );
  }
  private chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, dx: number, dy: number) {
    const a = TILE * 0.16,
      d = TILE * 0.12;
    g.beginPath();
    g.moveTo(x - dx * d - dy * a, y - dy * d + dx * a);
    g.lineTo(x + dx * d, y + dy * d);
    g.lineTo(x - dx * d + dy * a, y - dy * d - dx * a);
    g.strokePath();
  }
}

export const beltReverseArt: MechArt = { draw: () => {} }; // the registry slot; the real drawing is BeltReverseView
