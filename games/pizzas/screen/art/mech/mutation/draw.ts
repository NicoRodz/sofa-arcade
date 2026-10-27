// Art of 'mutation' v2 (drawn by code): from `warn` ticks before, every op shows a ghost at its destination (a dashed hazard outline), and a dashed arrow runs from where the station is to where it will be; a pulse Implemented by T1a.
// makes the tiles that will change impossible to miss. The banner and the flash are the MutateView's (the same event names as the v1 mutation).
import type { MechArt } from '../../../../sim/mech/types';
import { liveOf } from '../../../../sim/mech/mutation/module';
import { OX, OY, TILE } from '@pichi/screen-kit/art/tokens';
import { layer, type Draw } from '../layer';

const WARN = 0xffd23f;
function dashed(gfx: import('phaser').GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, t: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1,
    ux = (x1 - x0) / len,
    uy = (y1 - y0) / len,
    step = TILE * 0.22,
    off = (t / 40) % step;
  for (let k = -off; k < len - step * 0.5; k += step) {
    const a = Math.max(0, k),
      b = Math.min(len, k + step * 0.55);
    if (b > a) gfx.lineBetween(x0 + ux * a, y0 + uy * a, x0 + ux * b, y0 + uy * b);
  }
}

export const drawMutation: Draw = (scene, g, t) => {
  const gfx = layer(scene, 'mutation', 2400);
  gfx.clear();
  const live = liveOf(g);
  if (!live || live.phase !== 1) return;
  const pulse = 0.5 + 0.5 * Math.sin(t / 110);
  gfx.lineStyle(5, WARN, 0.55 + 0.4 * pulse);
  for (const [kind, a, b] of live.m.ops) {
    const ax = OX + (a[0] + 0.5) * TILE,
      ay = OY + (a[1] + 0.5) * TILE;
    gfx.strokeRoundedRect(OX + a[0] * TILE + 3, OY + a[1] * TILE + 3, TILE - 6, TILE - 6, TILE * 0.12);
    if (kind === 'tile') continue;
    const p = b as readonly [number, number];
    const bx = OX + (p[0] + 0.5) * TILE,
      by = OY + (p[1] + 0.5) * TILE;
    gfx.fillStyle(WARN, 0.12 + 0.16 * pulse).fillRoundedRect(OX + p[0] * TILE + 3, OY + p[1] * TILE + 3, TILE - 6, TILE - 6, TILE * 0.12);
    gfx.strokeRoundedRect(OX + p[0] * TILE + 3, OY + p[1] * TILE + 3, TILE - 6, TILE - 6, TILE * 0.12);
    dashed(gfx, ax, ay, bx, by, t);
    const d = Math.hypot(bx - ax, by - ay) || 1,
      ux = (bx - ax) / d,
      uy = (by - ay) / d;
    gfx
      .fillStyle(WARN, 0.95)
      .fillTriangle(
        bx - ux * TILE * 0.1,
        by - uy * TILE * 0.1,
        bx - ux * TILE * 0.34 - uy * TILE * 0.16,
        by - uy * TILE * 0.34 + ux * TILE * 0.16,
        bx - ux * TILE * 0.34 + uy * TILE * 0.16,
        by - uy * TILE * 0.34 - ux * TILE * 0.16,
      );
  }
};
export const mutationArt: MechArt = { draw: drawMutation as unknown as () => void };
