// Art of 'woodOven' (W + Q), implemented by T1e, drawn by code with Phaser Graphics: flames on the oven proportional to its fuel (embers, then a frozen blue tint, when there is none), the bellows that
// squeeze while a chef blows, and a fuel bar beside each of them. `draw(scene, game, t)`: the screen calls it every frame.
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { woodCap, bellows, blowers, feedOf, fuelOf, ovens } from '../../../../sim/mech/woodOven/state';
import { C, TILE, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';

const layers = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();
const squeeze = new WeakMap<Game, Record<number, number>>(); // 0..1 per bellows: eases towards 1 while a chef blows
function layer(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  let l = layers.get(scene);
  if (!l) {
    l = scene.add.graphics().setDepth(2500);
    layers.set(scene, l);
  }
  return l;
}
const bar = (gfx: Phaser.GameObjects.Graphics, x: number, y: number, h: number, frac: number) => {
  gfx.fillStyle(hexNum(C.ink), 0.85).fillRoundedRect(x - 4, y - 4, TILE * 0.14 + 8, h + 8, 5);
  gfx.fillStyle(hexNum(frac > 0.5 ? C.fire2 : C.fire), 1).fillRoundedRect(x, y + h * (1 - frac), TILE * 0.14, Math.max(2, h * frac), 3);
};

export function drawWood(gfx: Phaser.GameObjects.Graphics, g: Game, t: number) {
  for (const w of ovens(g)) {
    const s = g.stations[w]!;
    const x = OX + s.tx * TILE,
      y = OY + s.ty * TILE;
    const fuel = fuelOf(g, w) / woodCap(g);
    // the fire bed: two logs, then flames that grow with the fuel
    gfx.fillStyle(hexNum(C.wood2), 1).fillRoundedRect(x + TILE * 0.2, y + TILE * 0.7, TILE * 0.6, TILE * 0.1, 4);
    gfx.fillStyle(hexNum(C.wood), 1).fillRoundedRect(x + TILE * 0.28, y + TILE * 0.62, TILE * 0.44, TILE * 0.1, 4);
    if (fuel <= 0) {
      gfx.fillStyle(hexNum(C.steel), 0.35).fillRoundedRect(x + TILE * 0.04, y + TILE * 0.04, TILE * 0.92, TILE * 0.92, TILE * 0.1); // frozen: nothing bakes
      gfx.fillStyle(hexNum(C.burnt2), 1).fillCircle(x + TILE * 0.5, y + TILE * 0.7, TILE * 0.05);
    } else {
      const n = 1 + Math.ceil(fuel * 3);
      for (let k = 0; k < n; k++) {
        const fx = x + TILE * (0.5 + (k - (n - 1) / 2) * 0.16);
        const hh = TILE * (0.12 + 0.3 * fuel) * (0.8 + 0.25 * Math.sin(t / 90 + k * 1.7));
        gfx
          .fillStyle(hexNum(C.fire), 0.95)
          .fillTriangle(fx - TILE * 0.08, y + TILE * 0.64, fx + TILE * 0.08, y + TILE * 0.64, fx, y + TILE * 0.64 - hh);
        gfx
          .fillStyle(hexNum(C.fire2), 0.95)
          .fillTriangle(fx - TILE * 0.04, y + TILE * 0.64, fx + TILE * 0.04, y + TILE * 0.64, fx, y + TILE * 0.64 - hh * 0.6);
      }
    }
    bar(gfx, x + TILE * 0.76, y + TILE * 0.1, TILE * 0.5, fuel);
  }
  const sq = squeeze.get(g) ?? {};
  squeeze.set(g, sq);
  for (const q of bellows(g)) {
    const s = g.stations[q]!;
    const x = OX + s.tx * TILE,
      y = OY + s.ty * TILE;
    const blowing = blowers(g)[q] !== undefined;
    sq[q] = (sq[q] ?? 0) + ((blowing ? 1 : 0) - (sq[q] ?? 0)) * 0.25;
    const k = sq[q]!; // the two boards close on each other
    const gap = TILE * (0.32 - 0.22 * k);
    gfx.fillStyle(hexNum(C.wood2), 1).fillRoundedRect(x + TILE * 0.12, y + TILE * 0.5 - gap / 2 - TILE * 0.1, TILE * 0.5, TILE * 0.1, 4);
    gfx.fillStyle(hexNum(C.wood2), 1).fillRoundedRect(x + TILE * 0.12, y + TILE * 0.5 + gap / 2, TILE * 0.5, TILE * 0.1, 4);
    gfx
      .fillStyle(hexNum(C.cocoa), 1)
      .fillTriangle(x + TILE * 0.12, y + TILE * 0.5 - gap / 2, x + TILE * 0.12, y + TILE * 0.5 + gap / 2, x + TILE * 0.62, y + TILE * 0.5); // the leather
    gfx.fillStyle(hexNum(C.steel2), 1).fillRect(x + TILE * 0.62, y + TILE * 0.47, TILE * 0.26, TILE * 0.06); // the nozzle
    if (blowing)
      gfx
        .lineStyle(3, hexNum(C.fire2), 0.8)
        .lineBetween(x + TILE * 0.9, y + TILE * 0.5, x + TILE * (0.98 + 0.1 * Math.sin(t / 60)), y + TILE * 0.5);
    const w = feedOf(g, q);
    bar(gfx, x + TILE * 0.8, y + TILE * 0.12, TILE * 0.3, w === undefined ? 0 : fuelOf(g, w) / woodCap(g));
  }
}

export const woodOvenArt: MechArt = {
  draw: (scene?: Phaser.Scene, g?: Game, t = 0) => {
    if (!scene || !g) return;
    const gfx = layer(scene);
    gfx.clear();
    drawWood(gfx, g, t);
  },
};
