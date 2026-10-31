// Art of 'oil' (drawn by code): amber puddles that shimmer, flames that flicker on a burning tile, water that ripples, and the drip g (a cloud-shaped tap with a falling drop). The tiles come from Implemented by T1d.
// `game.mech.tile` (1 oil, 2 fire, 3 water), so whatever the sim says is what is drawn: a tile the sim cleaned is clean here one frame later.
import type Phaser from 'phaser';
import type { MechArt } from '../../../../sim/mech/types';
import { FIRE, OIL, WATER } from '../../../../sim/mech/oil/state';
import { TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';
import { layer, type Draw } from '../layer';

const COL = {
  oil: 0xd99a1e,
  oilHi: 0xffd76a,
  water: 0x4fb6e0,
  waterHi: 0xcff1ff,
  flameA: 0xff8a1f,
  flameB: 0xffc93c,
  flameC: 0xff4d2e,
  drip: 0x6b4a12,
  rim: 0x4b3a22,
};

function puddle(gfx: Phaser.GameObjects.Graphics, x: number, y: number, t: number, i: number, base: number, hi: number, alpha: number) {
  const k = 0.5 + 0.06 * Math.sin(t / 420 + i);
  gfx.fillStyle(base, alpha).fillEllipse(x + TILE / 2, y + TILE / 2, TILE * (0.88 + 0.03 * Math.sin(t / 500 + i)), TILE * 0.62 * k * 1.5);
  gfx.fillStyle(hi, alpha * 0.7).fillEllipse(x + TILE * 0.38, y + TILE * 0.4, TILE * 0.3, TILE * 0.12);
  gfx.lineStyle(2, hi, alpha * 0.5).strokeEllipse(x + TILE / 2, y + TILE / 2, TILE * 0.8, TILE * 0.5);
}
function flame(gfx: Phaser.GameObjects.Graphics, x: number, y: number, t: number, i: number) {
  const cx = x + TILE / 2,
    base = y + TILE * 0.86;
  gfx.fillStyle(COL.flameC, 0.35).fillEllipse(cx, y + TILE * 0.62, TILE * 1.05, TILE * 0.7); // glow
  for (const [dx, h, col] of [
    [-0.24, 0.55, COL.flameA],
    [0.22, 0.62, COL.flameA],
    [0, 0.82, COL.flameC],
    [0, 0.5, COL.flameB],
  ] as const) {
    const f = 1 + 0.18 * Math.sin(t / 90 + i * 1.7 + dx * 9);
    const hh = TILE * h * f,
      w = TILE * 0.2;
    gfx
      .fillStyle(col, 0.95)
      .fillTriangle(cx + dx * TILE - w, base, cx + dx * TILE + w, base, cx + dx * TILE + Math.sin(t / 130 + dx * 7) * w * 0.4, base - hh);
  }
}
export function drip(gfx: Phaser.GameObjects.Graphics, x: number, y: number, t: number) {
  const cx = x + TILE / 2;
  gfx.fillStyle(COL.rim, 1).fillRoundedRect(cx - TILE * 0.22, y + TILE * 0.12, TILE * 0.44, TILE * 0.2, TILE * 0.06);
  gfx.fillStyle(COL.oil, 1).fillRoundedRect(cx - TILE * 0.06, y + TILE * 0.3, TILE * 0.12, TILE * 0.12, TILE * 0.04);
  const f = (t / 720) % 1; // the drop falls and fattens
  gfx.fillStyle(COL.oilHi, 1).fillCircle(cx, y + TILE * (0.46 + 0.34 * f), TILE * (0.05 + 0.03 * f));
}

export const drawOil: Draw = (scene, g, t) => {
  const gfx = layer(scene, 'oil');
  gfx.clear();
  const tile = g.mech?.tile;
  if (!tile) return;
  for (let i = 0; i < tile.length; i++) {
    const k = tile[i];
    if (!k) continue;
    const x = OX + (i % 16) * TILE,
      y = OY + Math.floor(i / 16) * TILE;
    if (k === OIL) puddle(gfx, x, y, t, i, COL.oil, COL.oilHi, 0.78);
    else if (k === WATER) puddle(gfx, x, y, t, i, COL.water, COL.waterHi, 0.55);
    else if (k === FIRE) flame(gfx, x, y, t, i);
  }
  g.grid.forEach((row, ty) =>
    row.forEach((tl, tx) => tl.kind === 'floor' && tl.mech === 'g' && drip(gfx, OX + tx * TILE, OY + ty * TILE, t)),
  );
};
export const oilArt: MechArt = { draw: drawOil as unknown as () => void };
