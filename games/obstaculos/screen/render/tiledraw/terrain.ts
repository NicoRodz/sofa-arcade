// Solid terrain: autotiled by the 4-bit mask of solid neighbours plus per-biome decoration.
import { type CellCtx, type Ctx, E_, N_, S_, W_, cellRand, depthAbove, outlineOpen, shape } from './base';
import { TILE } from '../../../index';
import { INK, lerpColor } from '../biome';

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
