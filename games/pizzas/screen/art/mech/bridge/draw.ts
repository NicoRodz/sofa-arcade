// Art of 'bridge' (drawn by code): planks across the water with rope rails; from 4 steps of wear the planks crack, at 6 it is about to give; a broken bridge shows only the water and a few floating splinters. Implemented by T1c.
// The background paints a bridge tile as water (world.ts), so what is drawn here is the whole bridge.
import type { MechArt } from '../../../../sim/mech/types';
import { bridgeBreaks, BRIDGE_CRACKS, BRIDGE_MEND_TICKS, isBroken, mendProgress, repairable } from '../../../../sim/mech/bridge/module';
import { hz3Params } from '../../../../sim/hazards/hazard-v3';
import { TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';
import { layer, type Draw } from '../layer';
import { hideLabels, tileLabel } from '../tile-label';

const COL = { plank: 0xc98a4b, plank2: 0x9c6232, rope: 0xe8c9a0, crack: 0x2b1b17, warn: 0xffb020, bar: 0x6fd36f };

export const drawBridges: Draw = (scene, g, t) => {
  const gfx = layer(scene, 'bridge', 1.52);
  gfx.clear();
  hideLabels(scene, 'bridge:');
  for (const [k, b] of Object.entries(g.mech?.bridge ?? {})) {
    const i = Number(k),
      tx = i % 16,
      ty = Math.floor(i / 16),
      x = OX + tx * TILE,
      y = OY + ty * TILE;
    const vertical = g.grid[ty - 1]?.[tx]?.kind === 'water' || g.grid[ty + 1]?.[tx]?.kind === 'water' ? false : true; // planks run across the ditch, along the way a chef crosses
    if (isBroken(g, tx, ty)) {
      const left = (b.brokenUntil - (g.mech!.ext!.bridge as { tick: number }).tick) / BRIDGE_MEND_TICKS; // 1 .. 0: how long until it mends
      for (let s = 0; s < 4; s++)
        gfx
          .fillStyle(COL.plank2, 0.7)
          .fillRect(
            x + TILE * (0.2 + 0.2 * s) + Math.sin(t / 500 + s) * 3,
            y + TILE * (0.3 + 0.12 * ((s * 5) % 4)),
            TILE * 0.16,
            TILE * 0.05,
          );
      gfx
        .lineStyle(3, COL.warn, 0.25 + 0.3 * (1 - left))
        .strokeRoundedRect(x + TILE * 0.1, y + TILE * 0.1, TILE * 0.8, TILE * 0.8, TILE * 0.1); // mending
      if (repairable(g, i)) {
        // HAZARD_V3: a chef can mend it holding B: a bar that fills while it does, and the label
        const need = hz3Params(g).bridge.repair,
          done = Math.min(1, mendProgress(g, i) / need),
          bw = TILE * 0.9, // under a tile, so the bars of two broken tiles side by side do not run into each other
          bx = x + (TILE - bw) / 2,
          by = y - TILE * 0.3;
        gfx.fillStyle(0x2b1b17, 0.85).fillRoundedRect(bx - 4, by - 4, bw + 8, 24, 10);
        gfx.fillStyle(0xfff1d6, 0.25).fillRoundedRect(bx, by, bw, 16, 7);
        if (done > 0) gfx.fillStyle(COL.bar, 1).fillRoundedRect(bx, by, Math.max(14, bw * done), 16, 7);
        if (!(tx > 0 && repairable(g, i - 1))) tileLabel(scene, `bridge:${i}`, 'Mantén B', x + TILE / 2, by - 22, 26, '#FFE45C'); // one label per run of broken tiles (two side by side would print over each other)
      }
      continue;
    }
    const n = 5;
    for (let p = 0; p < n; p++) {
      const o = TILE * (0.1 + (0.8 * p) / (n - 1));
      if (vertical)
        gfx
          .fillStyle(p % 2 ? COL.plank : COL.plank2, 1)
          .fillRoundedRect(x + TILE * 0.06, y + o - TILE * 0.07, TILE * 0.88, TILE * 0.14, TILE * 0.03);
      else
        gfx
          .fillStyle(p % 2 ? COL.plank : COL.plank2, 1)
          .fillRoundedRect(x + o - TILE * 0.07, y + TILE * 0.06, TILE * 0.14, TILE * 0.88, TILE * 0.03);
    }
    gfx.lineStyle(4, COL.rope, 1);
    if (vertical) gfx.lineBetween(x, y + TILE * 0.06, x + TILE, y + TILE * 0.06).lineBetween(x, y + TILE * 0.94, x + TILE, y + TILE * 0.94);
    else gfx.lineBetween(x + TILE * 0.06, y, x + TILE * 0.06, y + TILE).lineBetween(x + TILE * 0.94, y, x + TILE * 0.94, y + TILE);
    if (b.uses >= BRIDGE_CRACKS) {
      const wob = b.uses >= bridgeBreaks(g) - 1 ? Math.sin(t / 60) * 2 : 0;
      gfx.lineStyle(3, COL.crack, 1);
      for (let c = 0; c < b.uses - BRIDGE_CRACKS + 1; c++) {
        const cx = x + TILE * (0.28 + 0.22 * c) + wob;
        gfx
          .lineBetween(cx, y + TILE * 0.2, cx + TILE * 0.08, y + TILE * 0.5)
          .lineBetween(cx + TILE * 0.08, y + TILE * 0.5, cx - TILE * 0.02, y + TILE * 0.8);
      }
      gfx.lineStyle(3, COL.warn, 0.4 + 0.4 * Math.sin(t / 150)).strokeRoundedRect(x + 2, y + 2, TILE - 4, TILE - 4, TILE * 0.08);
    }
  }
};
export const bridgeArt: MechArt = { draw: drawBridges as unknown as () => void };
