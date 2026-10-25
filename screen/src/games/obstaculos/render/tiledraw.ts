// Pure canvas drawing of one tile (no Phaser): autotiling by the 4-bit mask of solid neighbours plus per-biome decoration.
// Everything is drawn in world px with (x, y) the cell's top-left. Cells are drawn with a 0.5 px overlap so chunks have no seams.
import { T, TILE, isSolidKind, tileAt, type Biome, type TileGrid } from '@party/shared/obstaculos';
import { INK, PALETTES, lerpColor, type Palette } from './biome';

export type Ctx = CanvasRenderingContext2D;
export const N_ = 1,
  E_ = 2,
  S_ = 4,
  W_ = 8;

// Deterministic per-cell random in [0, 1).
export function cellRand(x: number, y: number, i = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + i * 2147483647, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const solid = (g: TileGrid, x: number, y: number) => isSolidKind(tileAt(g, x, y)) && x >= 0 && x < g.w && !(y >= g.h); // outside left/right is a wall: drawn open
// Mask of neighbours that are plain terrain-like solids (merge outline with them).
export function terrainMask(g: TileGrid, x: number, y: number): number {
  const s = (xx: number, yy: number) => (xx < 0 || xx >= g.w ? true : yy >= g.h ? true : solid(g, xx, yy));
  return (s(x, y - 1) ? N_ : 0) | (s(x + 1, y) ? E_ : 0) | (s(x, y + 1) ? S_ : 0) | (s(x - 1, y) ? W_ : 0);
}

function shape(c: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  c.beginPath();
  c.moveTo(x + r[0], y);
  c.lineTo(x + w - r[1], y);
  if (r[1]) c.quadraticCurveTo(x + w, y, x + w, y + r[1]);
  c.lineTo(x + w, y + h - r[2]);
  if (r[2]) c.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
  c.lineTo(x + r[3], y + h);
  if (r[3]) c.quadraticCurveTo(x, y + h, x, y + h - r[3]);
  c.lineTo(x, y + r[0]);
  if (r[0]) c.quadraticCurveTo(x, y, x + r[0], y);
  c.closePath();
}

// Ink outline along the open edges only, rounded at convex corners.
function outlineOpen(c: Ctx, x: number, y: number, mask: number, r: number, lw = 3) {
  const o = lw / 2;
  const nO = !(mask & N_),
    eO = !(mask & E_),
    sO = !(mask & S_),
    wO = !(mask & W_);
  const rTL = nO && wO ? r : 0,
    rTR = nO && eO ? r : 0,
    rBR = sO && eO ? r : 0,
    rBL = sO && wO ? r : 0;
  const x0 = x + o,
    y0 = y + o,
    x1 = x + TILE - o,
    y1 = y + TILE - o;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  if (nO) {
    c.moveTo(x0 + rTL, y0);
    c.lineTo(x1 - rTR, y0);
  }
  if (nO && eO) {
    c.moveTo(x1 - rTR, y0);
    c.quadraticCurveTo(x1, y0, x1, y0 + rTR);
  }
  if (eO) {
    c.moveTo(x1, y0 + rTR);
    c.lineTo(x1, y1 - rBR);
  }
  if (sO && eO) {
    c.moveTo(x1, y1 - rBR);
    c.quadraticCurveTo(x1, y1, x1 - rBR, y1);
  }
  if (sO) {
    c.moveTo(x1 - rBR, y1);
    c.lineTo(x0 + rBL, y1);
  }
  if (sO && wO) {
    c.moveTo(x0 + rBL, y1);
    c.quadraticCurveTo(x0, y1, x0, y1 - rBL);
  }
  if (wO) {
    c.moveTo(x0, y1 - rBL);
    c.lineTo(x0, y0 + rTL);
  }
  if (nO && wO) {
    c.moveTo(x0, y0 + rTL);
    c.quadraticCurveTo(x0, y0, x0 + rTL, y0);
  }
  c.stroke();
}

export interface CellCtx {
  g: TileGrid;
  x: number;
  y: number;
  px: number;
  py: number;
  mask: number;
  biome: Biome;
  pal: Palette;
  seed: number;
}

function depthAbove(g: TileGrid, x: number, y: number): number {
  let d = 0;
  while (d < 6 && y - d - 1 >= 0 && tileAt(g, x, y - d - 1) === T.Solid) d++;
  return d;
}

export function drawTerrain(c: Ctx, k: CellCtx) {
  const { x: cx, y: cy, px, py, mask, pal, biome } = k;
  const rnd = (i: number) => cellRand(cx, cy, i + k.seed);
  const r = 11;
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
  const depth = depthAbove(k.g, cx, cy);
  const base = lerpColor(pal.body, pal.bodyDark, Math.min(depth, 5) / 6);
  shape(c, fx, fy, fw, fh, radii);
  c.fillStyle = base;
  c.fill();

  c.save();
  shape(c, fx, fy, fw, fh, radii);
  c.clip();
  // gradient shading on the sides that face open air
  if (!(mask & W_)) {
    const gr = c.createLinearGradient(px, 0, px + 14, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.14)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(px, py, 14, TILE);
  }
  if (!(mask & E_)) {
    const gr = c.createLinearGradient(px + TILE, 0, px + TILE - 14, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(px + TILE - 14, py, 14, TILE);
  }
  if (!(mask & S_)) {
    const gr = c.createLinearGradient(0, py + TILE, 0, py + TILE - 14);
    gr.addColorStop(0, 'rgba(0,0,0,0.2)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(px, py + TILE - 14, TILE, 14);
  }

  // texture by biome
  switch (biome) {
    case 'beach': {
      c.strokeStyle = 'rgba(160,110,50,0.22)';
      c.lineWidth = 2;
      c.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const yy = py + 16 + i * 16 + rnd(i) * 6;
        c.beginPath();
        c.moveTo(px + 2, yy);
        c.quadraticCurveTo(px + 24, yy + (rnd(i + 5) - 0.5) * 8, px + 46, yy + 1);
        c.stroke();
      }
      c.fillStyle = pal.speck;
      for (let i = 0; i < 4; i++) {
        c.globalAlpha = 0.35;
        c.beginPath();
        c.arc(px + 4 + rnd(10 + i) * 40, py + 6 + rnd(20 + i) * 36, 1.6 + rnd(30 + i), 0, 7);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case 'forest': {
      c.strokeStyle = 'rgba(30,15,5,0.4)';
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      if (rnd(1) < 0.7) {
        const x0 = px + 6 + rnd(2) * 30;
        c.beginPath();
        c.moveTo(x0, py + 2);
        c.bezierCurveTo(x0 + 8, py + 14, x0 - 6, py + 26, x0 + 4, py + 46);
        c.stroke();
      }
      c.fillStyle = pal.bodyLight;
      c.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(px + 6 + rnd(10 + i) * 36, py + 8 + rnd(20 + i) * 32, 3 + rnd(30 + i) * 3, 2.4, rnd(40 + i), 0, 7);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case 'mine': {
      c.fillStyle = pal.speck;
      c.globalAlpha = 0.4;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(px + rnd(i) * 40, py + rnd(i + 9) * 40);
        c.lineTo(px + rnd(i) * 40 + 8, py + rnd(i + 9) * 40 + 3);
        c.lineTo(px + rnd(i) * 40 + 3, py + rnd(i + 9) * 40 + 9);
        c.fill();
      }
      c.globalAlpha = 1;
      if (rnd(7) < 0.28) {
        // copper ore
        const ox = px + 10 + rnd(8) * 26,
          oy = py + 10 + rnd(9) * 26;
        for (let i = 0; i < 3; i++) {
          c.fillStyle = i ? '#E9A24E' : '#B87333';
          c.beginPath();
          c.arc(ox + i * 5 - 4, oy + (i % 2) * 5, 3.4 - i * 0.4, 0, 7);
          c.fill();
        }
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillRect(ox - 1, oy - 2, 2, 2);
      }
      break;
    }
    case 'glacier': {
      c.strokeStyle = 'rgba(30,45,60,0.3)';
      c.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const yy = py + 12 + i * 20 + rnd(i) * 6;
        c.beginPath();
        c.moveTo(px, yy + 6);
        c.lineTo(px + TILE, yy - 6 + rnd(i + 3) * 8);
        c.stroke();
      }
      c.fillStyle = 'rgba(190,232,245,0.35)';
      for (let i = 0; i < 2; i++) {
        c.beginPath();
        c.arc(px + 8 + rnd(10 + i) * 32, py + 10 + rnd(20 + i) * 28, 2.2, 0, 7);
        c.fill();
      }
      break;
    }
    case 'volcano': {
      c.strokeStyle = pal.accent;
      c.lineWidth = 2;
      c.lineCap = 'round';
      if (rnd(1) < 0.4) {
        const x0 = px + 6 + rnd(2) * 34,
          y0 = py + 4 + rnd(3) * 20;
        c.globalAlpha = 0.9;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + 7, y0 + 9);
        c.lineTo(x0 + 3, y0 + 15);
        c.lineTo(x0 + 11, y0 + 24);
        c.stroke();
        c.strokeStyle = '#FFD27A';
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + 7, y0 + 9);
        c.lineTo(x0 + 3, y0 + 15);
        c.lineTo(x0 + 11, y0 + 24);
        c.stroke();
        c.globalAlpha = 1;
      }
      c.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(px + 6 + rnd(10 + i) * 36, py + 8 + rnd(20 + i) * 32, 3 + rnd(i), 0, 7);
        c.fill();
      }
      break;
    }
  }

  // cap on top of exposed ground
  if (!(mask & N_)) {
    const capH = biome === 'glacier' ? 15 : biome === 'volcano' ? 8 : 12;
    c.beginPath();
    c.moveTo(px - 1, py - 1);
    c.lineTo(px + TILE + 1, py - 1);
    const n = 6;
    for (let i = n; i >= 0; i--) {
      const xx = px + (i / n) * TILE;
      c.lineTo(xx, py + capH + (i % 2 ? 2.5 : -1) + rnd(40 + i) * 3);
    }
    c.closePath();
    c.fillStyle = pal.top;
    c.fill();
    // rim under the cap
    c.strokeStyle = pal.topDark;
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(px + 3, py + 2, TILE - 6, 2.4);
    if (biome === 'forest') {
      // moss tufts
      c.fillStyle = pal.top;
      for (let i = 0; i < 3; i++) {
        const bx = px + 5 + rnd(50 + i) * 38;
        c.beginPath();
        c.moveTo(bx - 3, py + 2);
        c.lineTo(bx, py - 4 - rnd(60 + i) * 3);
        c.lineTo(bx + 3, py + 2);
        c.fill();
      }
    } else if (biome === 'volcano') {
      c.fillStyle = 'rgba(255,90,31,0.55)';
      c.fillRect(px + 4 + rnd(70) * 20, py + capH - 1, 8 + rnd(71) * 10, 2);
    } else if (biome === 'glacier') {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.beginPath();
      c.arc(px + 10 + rnd(80) * 28, py + 6, 1.6, 0, 7);
      c.fill();
    }
  }
  c.restore();

  // hanging details under exposed ceilings
  if (!(mask & S_)) {
    if (biome === 'glacier' || biome === 'mine' || biome === 'volcano') {
      const n = 2 + (rnd(90) < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const bx = px + 8 + ((i * (TILE - 16)) / Math.max(1, n - 1)) * (n > 1 ? 1 : 0.5) + (rnd(91 + i) - 0.5) * 6,
          len = 8 + rnd(95 + i) * 11;
        c.beginPath();
        c.moveTo(bx - 4, py + TILE - 2);
        c.lineTo(bx + 0.5, py + TILE + len);
        c.lineTo(bx + 4, py + TILE - 2);
        c.closePath();
        c.fillStyle = biome === 'glacier' ? '#D9F3FB' : biome === 'mine' ? pal.bodyLight : pal.bodyLight;
        c.fill();
        c.lineWidth = 2.4;
        c.strokeStyle = INK;
        c.stroke();
      }
    } else if (biome === 'forest') {
      c.strokeStyle = INK;
      c.lineWidth = 3;
      c.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const bx = px + 12 + i * 24 + rnd(92 + i) * 6;
        c.beginPath();
        c.moveTo(bx, py + TILE - 1);
        c.quadraticCurveTo(bx + 4, py + TILE + 8, bx - 1, py + TILE + 12 + rnd(96 + i) * 6);
        c.stroke();
      }
      c.strokeStyle = pal.topDark;
      c.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        const bx = px + 12 + i * 24 + rnd(92 + i) * 6;
        c.beginPath();
        c.moveTo(bx, py + TILE - 1);
        c.quadraticCurveTo(bx + 4, py + TILE + 8, bx - 1, py + TILE + 12 + rnd(96 + i) * 6);
        c.stroke();
      }
    }
  }
  outlineOpen(c, px, py, mask, r);
}

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

export function drawCell(c: Ctx, g: TileGrid, x: number, y: number, px: number, py: number, biome: Biome, seed: number) {
  const kind = tileAt(g, x, y);
  if (kind === T.Empty || kind === T.Liquid || kind === T.Object) return;
  const k: CellCtx = { g, x, y, px, py, mask: kind === T.Solid ? terrainMask(g, x, y) : 0, biome, pal: PALETTES[biome], seed };
  switch (kind) {
    case T.Solid:
      drawTerrain(c, k);
      break;
    case T.OneWay:
      drawOneWay(c, k);
      break;
    case T.Ladder:
      drawLadder(c, k);
      break;
    case T.Spikes:
      drawSpikes(c, k);
      break;
    case T.Crumble:
      drawCrumble(c, k);
      break;
    case T.BeltL:
      drawBelt(c, k, -1);
      break;
    case T.BeltR:
      drawBelt(c, k, 1);
      break;
    case T.Trampoline:
      drawTrampoline(c, k);
      break;
    case T.Door:
      drawDoor(c, k);
      break;
    case T.Ice:
      drawIce(c, k);
      break;
    case T.Crystal:
      drawCrystal(c, k, false);
      break;
    case T.CrystalLit:
      drawCrystal(c, k, true);
      break;
  }
}
