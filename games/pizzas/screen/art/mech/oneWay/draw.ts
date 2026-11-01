// Art of 'oneWay' (drawn by code): a tile you can only enter going one way is a blue-grey pad with a bold white arrow and a notch on the three closed sides, so it never reads as a belt (belts have moving Implemented by T1c.
// chevrons; this is still). Drawn once per frame from the grid, a few rectangles.
import type { MechArt } from '../../../../sim/mech/types';
import { SENSE } from '../../../../sim/mech/oneWay/module';
import { TILE } from '@pichi/screen-kit/art';
import { OX, OY } from '../../env/grid';
import { layer, type Draw } from '../layer';

const COL = { pad: 0x5b7a99, padHi: 0x7f9fbf, arrow: 0xffffff, wall: 0x2b3a4a };

export const drawOneWays: Draw = (scene, g) => {
  const gfx = layer(scene, 'oneWay', 1.5);
  gfx.clear();
  g.grid.forEach((row, ty) =>
    row.forEach((t, tx) => {
      const s = t.kind === 'floor' && t.mech ? SENSE[t.mech] : undefined;
      if (!s) return;
      const x = OX + tx * TILE,
        y = OY + ty * TILE,
        cx = x + TILE / 2,
        cy = y + TILE / 2;
      gfx.fillStyle(COL.pad, 0.9).fillRoundedRect(x + TILE * 0.05, y + TILE * 0.05, TILE * 0.9, TILE * 0.9, TILE * 0.1);
      gfx.fillStyle(COL.padHi, 0.5).fillRoundedRect(x + TILE * 0.1, y + TILE * 0.1, TILE * 0.8, TILE * 0.2, TILE * 0.08);
      const [ux, uy] = s,
        [px, py] = [-uy, ux];
      const L = TILE * 0.26,
        W = TILE * 0.2;
      gfx.fillStyle(COL.arrow, 1).fillTriangle(cx + ux * L, cy + uy * L, cx + px * W, cy + py * W, cx - px * W, cy - py * W);
      gfx.fillRect(
        Math.min(cx - ux * L, cx - ux * 0.02 * TILE) - (ux ? 0 : TILE * 0.07),
        Math.min(cy - uy * L, cy) - (uy ? 0 : TILE * 0.07),
        ux ? L : TILE * 0.14,
        uy ? L : TILE * 0.14,
      );
      // the three closed sides get a dark notch: you cannot come in from there
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (dx === ux && dy === uy) continue;
        if (dx === -ux && dy === -uy) continue; // the back is the way out: no notch
        gfx
          .fillStyle(COL.wall, 1)
          .fillRect(
            cx + dx * TILE * 0.44 - (dx ? TILE * 0.03 : TILE * 0.18),
            cy + dy * TILE * 0.44 - (dy ? TILE * 0.03 : TILE * 0.18),
            dx ? TILE * 0.06 : TILE * 0.36,
            dy ? TILE * 0.06 : TILE * 0.36,
          );
      }
    }),
  );
};
export const oneWayArt: MechArt = { draw: drawOneWays as unknown as () => void };
