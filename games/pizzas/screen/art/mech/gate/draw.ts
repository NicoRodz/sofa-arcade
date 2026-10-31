// Art of 'gate' (drawn by code), implemented by T1b: the pressure plate Z sinks and lights green under a chef, a dotted cable runs from it to each door D, and the door is a pair of leaves with a lamp:
// shut = hazard-striped bars and a red lamp, open = leaves slid into the jambs and a green lamp; in timer mode the lamp blinks the last second before it shuts.
// `GateView` is self-managed like SurfaceView (it listens to the scene's update and goes with the scene's children); the scene must create one when `game.flags.mech.gate` (hook requested).
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { GATE_BLINK_TICKS, GATE_OPEN_TICKS, gateMap, standingOn } from '../../../../sim/mech/gate/state';
import { TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';

const C = {
  plate: 0xb9c0c9,
  plateDown: 0x6f7782,
  rim: 0x3a3f47,
  green: 0x39d98a,
  red: 0xf0443e,
  bar: 0x2f353d,
  stripe: 0xf2b632,
  cable: 0xf7e7a3,
  jamb: 0x4b525c,
};
const DEPTH = 1.6; // over the floor, under stations, items and chefs

export class GateView {
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

  private at = (i: number) => ({ x: OX + (i % 16) * TILE, y: OY + Math.floor(i / 16) * TILE });

  private update(dtMs: number) {
    this.t += dtMs;
    const g = this.gfx;
    g.clear();
    const gs = this.game.mech?.gate;
    if (!gs) return;
    const m = gateMap(this.game);
    const blink = m.timer && gs.open && gs.phase >= GATE_OPEN_TICKS - GATE_BLINK_TICKS && Math.floor(this.t / 120) % 2 === 0;
    for (const z of m.plates) for (const d of m.doors) this.cable(g, z, d);
    for (const z of m.plates) this.plate(g, z, !!standingOn(this.game, [z]));
    for (const d of m.doors) this.door(g, d, gs.open, blink);
  }

  // dotted L-shaped cable: along the row of the plate, then down the column of the door
  private cable(g: Phaser.GameObjects.Graphics, z: number, d: number) {
    const a = this.at(z),
      b = this.at(d);
    const pts: [number, number][] = [
      [a.x + TILE / 2, a.y + TILE / 2],
      [b.x + TILE / 2, a.y + TILE / 2],
      [b.x + TILE / 2, b.y + TILE / 2],
    ];
    g.fillStyle(C.cable, 0.85);
    for (let s = 0; s < 2; s++) {
      const [x0, y0] = pts[s]!,
        [x1, y1] = pts[s + 1]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let k = TILE * 0.3; k < len - TILE * 0.3; k += TILE * 0.16)
        g.fillCircle(x0 + ((x1 - x0) * k) / (len || 1), y0 + ((y1 - y0) * k) / (len || 1), TILE * 0.025);
    }
  }

  private plate(g: Phaser.GameObjects.Graphics, i: number, pressed: boolean) {
    const { x, y } = this.at(i);
    const pad = TILE * 0.14;
    g.fillStyle(C.rim, 1).fillRoundedRect(x + pad * 0.6, y + pad * 0.6, TILE - pad * 1.2, TILE - pad * 1.2, TILE * 0.08);
    g.fillStyle(pressed ? C.plateDown : C.plate, 1).fillRoundedRect(
      x + pad,
      y + pad + (pressed ? TILE * 0.03 : 0),
      TILE - pad * 2,
      TILE - pad * 2 - (pressed ? TILE * 0.03 : 0.0),
      TILE * 0.06,
    );
    if (!pressed) g.fillStyle(0xffffff, 0.35).fillRect(x + pad * 1.4, y + pad * 1.2, TILE - pad * 2.8, TILE * 0.05); // the bright top edge of a raised plate
    g.fillStyle(pressed ? C.green : C.red, 1).fillCircle(x + TILE / 2, y + TILE / 2, TILE * 0.09); // the lamp
  }

  private door(g: Phaser.GameObjects.Graphics, i: number, open: boolean, blink: boolean) {
    const { x, y } = this.at(i);
    const leaf = TILE * 0.42;
    g.fillStyle(C.jamb, 1)
      .fillRect(x, y, TILE * 0.12, TILE)
      .fillRect(x + TILE * 0.88, y, TILE * 0.12, TILE);
    if (open) {
      g.fillStyle(C.bar, 0.9)
        .fillRect(x + TILE * 0.12, y + TILE * 0.3, TILE * 0.06, TILE * 0.4)
        .fillRect(x + TILE * 0.82, y + TILE * 0.3, TILE * 0.06, TILE * 0.4);
    } else {
      for (const lx of [x + TILE * 0.12, x + TILE * 0.88 - leaf]) {
        g.fillStyle(C.bar, 1).fillRect(lx, y + TILE * 0.08, leaf, TILE * 0.84);
        g.fillStyle(C.stripe, 0.95); // hazard stripes: a closed door reads as "do not enter" from across the room
        for (let k = 0; k < 4; k++)
          g.fillTriangle(lx, y + TILE * (0.12 + k * 0.2), lx + leaf, y + TILE * (0.02 + k * 0.2), lx + leaf, y + TILE * (0.12 + k * 0.2));
      }
    }
    g.fillStyle(blink ? C.red : open ? C.green : C.red, 1).fillCircle(x + TILE / 2, y + TILE * 0.12, TILE * 0.07);
  }
}

export const gateArt: MechArt = { draw: () => {} }; // the registry slot; the real drawing is GateView
