// Art of 'ovenHeat' (drawn by code), implemented by T1b: a thermometer on the side of every oven (a glass tube whose mercury rises and goes from blue to orange to red with the temperature)
// and an ember glow under the oven that swells and pulses with the heat. `OvenHeatView` is self-managed like SurfaceView; the scene creates one when `game.flags.mech.ovenHeat` is on (hook requested).
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { HEAT_MAX } from '../../../../sim/mech/ovenHeat/module';
import { TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';

const DEPTH = 2.4; // above the oven drawn in the background, under the items and the chefs
const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
const mix = (c1: number, c2: number, k: number) =>
  (lerp((c1 >> 16) & 255, (c2 >> 16) & 255, k) << 16) | (lerp((c1 >> 8) & 255, (c2 >> 8) & 255, k) << 8) | lerp(c1 & 255, c2 & 255, k);
/** blue (cold) -> orange -> red (full heat) */
export const heatColor = (t: number): number => (t < 500 ? mix(0x4aa3ff, 0xff9a2e, t / 500) : mix(0xff9a2e, 0xf0302a, (t - 500) / 500));

export class OvenHeatView {
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
    for (const [k, temp] of Object.entries(this.game.mech?.heat ?? {})) {
      const s = this.game.stations[Number(k)]!;
      const x = OX + s.tx * TILE,
        y = OY + s.ty * TILE;
      const k01 = temp / HEAT_MAX;
      const col = heatColor(temp);
      // ember: a glow along the foot of the oven, pulsing faster the hotter it is
      const pulse = 0.55 + 0.45 * Math.sin(this.t / (420 - 260 * k01));
      g.fillStyle(col, 0.18 + 0.3 * k01 * pulse).fillEllipse(x + TILE / 2, y + TILE * 0.93, TILE * (0.55 + 0.4 * k01), TILE * 0.16);
      g.fillStyle(col, 0.5 + 0.4 * pulse).fillCircle(x + TILE * 0.3, y + TILE * 0.9, TILE * 0.03 * (0.6 + k01));
      g.fillStyle(col, 0.5 + 0.4 * pulse).fillCircle(x + TILE * 0.7, y + TILE * 0.9, TILE * 0.03 * (0.6 + k01));
      // thermometer: tube on the right edge of the tile, mercury up to temp, a bulb at the foot
      const tx = x + TILE * 0.86,
        top = y + TILE * 0.14,
        h = TILE * 0.62,
        w = TILE * 0.07;
      g.fillStyle(0x20242a, 0.85).fillRoundedRect(tx - w, top - w, w * 2, h + w * 2, w);
      g.fillStyle(0xe8f0f7, 0.9).fillRoundedRect(tx - w * 0.6, top, w * 1.2, h, w * 0.6);
      g.fillStyle(col, 1).fillRoundedRect(tx - w * 0.6, top + h * (1 - k01), w * 1.2, h * k01 + w, w * 0.6);
      g.fillStyle(col, 1).fillCircle(tx, top + h + w * 1.2, w * 1.5);
      g.lineStyle(1, 0x20242a, 0.9);
      for (const m of [0.25, 0.5, 0.75]) g.lineBetween(tx + w * 0.6, top + h * (1 - m), tx + w * 1.3, top + h * (1 - m)); // ticks
    }
  }
}

export const ovenHeatArt: MechArt = { draw: () => {} }; // the registry slot; the real drawing is OvenHeatView
