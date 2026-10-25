// Standing surfaces and floor hazards: one-way, ladder, spikes, crumble, belts, trampoline.
import { type CellCtx, type Ctx, cellRand, shape } from './base';
import { T, TILE, tileAt } from '../../../index';
import { INK, lerpColor } from '../biome';

export function drawOneWay(c: Ctx, k: CellCtx) {
  const { x: cx, y: cy, px, py, pal } = k;
  const wl = tileAt(k.g, cx - 1, cy) === T.OneWay || tileAt(k.g, cx - 1, cy) === T.Trampoline,
    wr = tileAt(k.g, cx + 1, cy) === T.OneWay || tileAt(k.g, cx + 1, cy) === T.Trampoline;
  const x0 = px - (wl ? 0.5 : 0),
    x1 = px + TILE + (wr ? 0.5 : 0),
    y0 = py + 1,
    h = 13;
  c.save();
  shape(c, x0, y0, x1 - x0, h, [wl ? 0 : 5, wr ? 0 : 5, wr ? 0 : 5, wl ? 0 : 5]);
  const g = c.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, lerpColor(pal.wood, '#FFFFFF', 0.25));
  g.addColorStop(1, pal.woodDark);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.28)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(px + 16, y0);
  c.lineTo(px + 16, y0 + h);
  c.moveTo(px + 32, y0);
  c.lineTo(px + 32, y0 + h);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(px + 2, y0 + 2, TILE - 4, 2);
  c.restore();
  shape(c, x0, y0, x1 - x0, h, [wl ? 0 : 5, wr ? 0 : 5, wr ? 0 : 5, wl ? 0 : 5]);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = INK;
  for (const nx of [px + 8, px + 40]) {
    c.beginPath();
    c.arc(nx, y0 + 6.5, 1.3, 0, 7);
    c.fill();
  }
  c.restore();
}

export function drawLadder(c: Ctx, k: CellCtx, alpha = 1) {
  const { px, py, pal } = k;
  c.save();
  c.globalAlpha = alpha;
  for (const lw of [
    [3.5, INK],
    [1.5, pal.wood],
  ] as const) {
    c.lineWidth = lw[0] + (lw[1] === INK ? 3 : 0);
    c.strokeStyle = lw[1];
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(px + 11, py);
    c.lineTo(px + 11, py + TILE);
    c.moveTo(px + 37, py);
    c.lineTo(px + 37, py + TILE);
    c.stroke();
  }
  c.lineCap = 'round';
  for (const lw of [
    [5.5, INK],
    [2.6, lerpColor(pal.wood, '#FFFFFF', 0.2)],
  ] as const) {
    c.lineWidth = lw[0];
    c.strokeStyle = lw[1];
    c.beginPath();
    for (const yy of [8, 24, 40]) {
      c.moveTo(px + 11, py + yy);
      c.lineTo(px + 37, py + yy);
    }
    c.stroke();
  }
  c.restore();
}

export function drawSpikes(c: Ctx, k: CellCtx) {
  const { px, py, pal } = k;
  c.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const bx = px + i * 16;
    c.beginPath();
    c.moveTo(bx + 1, py + TILE);
    c.lineTo(bx + 8, py + 10 + (i === 1 ? -3 : 0));
    c.lineTo(bx + 15, py + TILE);
    c.closePath();
    const g = c.createLinearGradient(bx, 0, bx + 16, 0);
    g.addColorStop(0, pal.spike);
    g.addColorStop(1, pal.spikeDark);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(bx + 5.5, py + 36);
    c.lineTo(bx + 8, py + 18);
    c.stroke();
  }
}

export function drawCrumble(c: Ctx, k: CellCtx) {
  const { px, py, pal, x, y } = k;
  shape(c, px, py, TILE, TILE, [4, 4, 4, 4]);
  const g = c.createLinearGradient(0, py, 0, py + TILE);
  g.addColorStop(0, lerpColor(pal.wood, '#FFFFFF', 0.25));
  g.addColorStop(1, lerpColor(pal.wood, '#000000', 0.12));
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(40,20,5,0.4)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(px, py + 16);
  c.lineTo(px + TILE, py + 16);
  c.moveTo(px, py + 32);
  c.lineTo(px + TILE, py + 32);
  c.stroke();
  c.strokeStyle = INK;
  c.lineWidth = 2.2; // cracks
  const j = cellRand(x, y, 3);
  c.beginPath();
  c.moveTo(px + 10 + j * 20, py);
  c.lineTo(px + 15 + j * 20, py + 12);
  c.lineTo(px + 9 + j * 20, py + 22);
  c.lineTo(px + 17 + j * 20, py + 34);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(px + 3, py + 3, TILE - 6, 2.2);
  c.restore();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [4, 4, 4, 4]);
  c.stroke();
  c.fillStyle = INK;
  for (const [nx, ny] of [
    [7, 8],
    [41, 8],
    [7, 40],
    [41, 40],
  ] as const) {
    c.beginPath();
    c.arc(px + nx, py + ny, 1.4, 0, 7);
    c.fill();
  }
}

export function drawBelt(c: Ctx, k: CellCtx, dir: 1 | -1) {
  const { px, py } = k;
  shape(c, px, py, TILE, TILE, [4, 4, 4, 4]);
  const g = c.createLinearGradient(0, py, 0, py + TILE);
  g.addColorStop(0, '#6B7780');
  g.addColorStop(1, '#3E464D');
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#FFC21A';
  for (let i = 0; i < 2; i++) {
    const cx0 = px + 8 + i * 24;
    c.beginPath();
    c.moveTo(cx0, py + 14);
    c.lineTo(cx0 + 12 * dir, py + 24);
    c.lineTo(cx0, py + 34);
    c.lineTo(cx0 + 5 * dir, py + 24);
    c.closePath();
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(px + 3, py + 3, TILE - 6, 3);
  c.restore();
  shape(c, px + 1.5, py + 1.5, TILE - 3, TILE - 3, [4, 4, 4, 4]);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
}

export function drawTrampoline(c: Ctx, k: CellCtx) {
  const { px, py } = k;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(px + 14, py + 44);
  c.lineTo(px + 34, py + 38);
  c.lineTo(px + 14, py + 32);
  c.lineTo(px + 34, py + 26);
  c.stroke();
  c.strokeStyle = '#B8C4CC';
  c.lineWidth = 3.2;
  c.stroke();
  shape(c, px + 3, py + 18, TILE - 6, 11, [5, 5, 5, 5]);
  const g = c.createLinearGradient(0, py + 18, 0, py + 29);
  g.addColorStop(0, '#FF6A5A');
  g.addColorStop(1, '#B5281F');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(px + 8, py + 21, 14, 2.4);
  shape(c, px + 8, py + 42, TILE - 16, 6, [3, 3, 3, 3]);
  c.fillStyle = '#5E6B78';
  c.fill();
  c.stroke();
}
