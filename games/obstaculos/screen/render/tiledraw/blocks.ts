// Special blocks: doors, ice (campaign dynamics 7 and 9) and crystals (dynamic 10).
import { type CellCtx, type Ctx, E_, N_, S_, W_, cellRand, outlineOpen, shape, terrainMask } from './base';
import { TILE } from '../../../index';
import { INK, lerpColor } from '../biome';

export function drawDoor(c: Ctx, k: CellCtx) {
  const { px, py, pal } = k;
  shape(c, px, py, TILE, TILE, [4, 4, 4, 4]);
  const g = c.createLinearGradient(px, 0, px + TILE, 0);
  g.addColorStop(0, lerpColor(pal.wood, '#FFFFFF', 0.15));
  g.addColorStop(1, pal.woodDark);
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(px + 16, py);
  c.lineTo(px + 16, py + TILE);
  c.moveTo(px + 32, py);
  c.lineTo(px + 32, py + TILE);
  c.stroke();
  c.fillStyle = '#7D8B95';
  c.fillRect(px, py + 8, TILE, 7);
  c.fillRect(px, py + 33, TILE, 7);
  c.restore();
  c.fillStyle = '#FFD23F';
  c.beginPath();
  c.arc(px + 24, py + 24, 6, 0, 7);
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = INK;
  c.fillRect(px + 23, py + 24, 2, 7);
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [4, 4, 4, 4]);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
}

// Ice ('I', campaign dynamics 7 and 9): pale blue block, bright lip where it faces the sky, a few white glints. Same outline rules as the terrain.
export function drawIce(c: Ctx, k: CellCtx) {
  const { x: cx, y: cy, px, py } = k;
  const mask = terrainMask(k.g, cx, cy);
  const r = 9;
  const radii: [number, number, number, number] = [
    !(mask & N_) && !(mask & W_) ? r : 0,
    !(mask & N_) && !(mask & E_) ? r : 0,
    !(mask & S_) && !(mask & E_) ? r : 0,
    !(mask & S_) && !(mask & W_) ? r : 0,
  ];
  const ov = 0.5;
  const fx = px - (mask & W_ ? ov : 0),
    fy = py - (mask & N_ ? ov : 0);
  const fw = TILE + (mask & W_ ? ov : 0) + (mask & E_ ? ov : 0),
    fh = TILE + (mask & N_ ? ov : 0) + (mask & S_ ? ov : 0);
  shape(c, fx, fy, fw, fh, radii);
  const g = c.createLinearGradient(0, py, 0, py + TILE);
  g.addColorStop(0, '#E6F8FF');
  g.addColorStop(1, '#8FDDF7');
  c.fillStyle = g;
  c.fill();
  c.save();
  shape(c, fx, fy, fw, fh, radii);
  c.clip();
  if (!(mask & N_)) {
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillRect(px, py, TILE, 7);
  }
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 3;
  c.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const gx = px + 8 + cellRand(cx, cy, 10 + i + k.seed) * (TILE - 24),
      gy = py + 12 + cellRand(cx, cy, 20 + i + k.seed) * (TILE - 26);
    c.beginPath();
    c.moveTo(gx, gy + 9);
    c.lineTo(gx + 9, gy);
    c.stroke();
  }
  c.restore();
  outlineOpen(c, px, py, mask, r);
}

// Crystals ('Y', campaign dynamic 10). Dark = a faint violet ghost you walk through; lit (CrystalLit, solid) = a bright faceted block with a glow. Cell-sized, no autotile.
export function drawCrystal(c: Ctx, k: CellCtx, lit: boolean) {
  const { px, py } = k;
  if (!lit) {
    shape(c, px + 8, py + 6, TILE - 16, TILE - 12, [6, 6, 6, 6]);
    c.fillStyle = 'rgba(150,110,255,0.14)';
    c.fill();
    c.lineWidth = 2.4;
    c.setLineDash([5, 5]);
    c.strokeStyle = 'rgba(190,160,255,0.7)';
    c.stroke();
    c.setLineDash([]);
    return;
  }
  const g = c.createLinearGradient(0, py, 0, py + TILE);
  g.addColorStop(0, '#F1E6FF');
  g.addColorStop(0.5, '#B58CFF');
  g.addColorStop(1, '#6F4BD8');
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [8, 8, 8, 8]);
  c.fillStyle = g;
  c.fill();
  c.save();
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [8, 8, 8, 8]);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.moveTo(px + 6, py + 4);
  c.lineTo(px + 20, py + 4);
  c.lineTo(px + 8, py + 30);
  c.lineTo(px + 6, py + 30);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(70,35,160,0.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(px + 24, py + 2);
  c.lineTo(px + 34, py + 24);
  c.lineTo(px + 22, py + 46);
  c.moveTo(px + 34, py + 24);
  c.lineTo(px + 46, py + 18);
  c.stroke();
  c.restore();
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [8, 8, 8, 8]);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
}
