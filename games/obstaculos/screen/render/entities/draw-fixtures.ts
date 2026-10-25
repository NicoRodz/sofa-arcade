// Redrawn geometry of fixtures: plates, levers, gates, ladders, movers, crumbling tiles, targets.
import { redraw, type Sprite } from './sprite';
import { TILE, type Biome } from '../../../index';
import { PALETTES, hexToInt, tagColor } from '../biome';
import { drawCrumble, drawLadder, type CellCtx } from '../tiledraw';
import type { EntityView } from '../view';

export function drawPlate(sp: Sprite, e: EntityView) {
  const sink = Math.round(e.value * 6) / 6 || (e.on ? 1 : 0);
  const sig = `${e.x}|${e.y}|${e.w}|${e.on}|${sink}`;
  const g = redraw(sp, sig);
  if (sp.text)
    sp.text
      .setText(e.label)
      .setPosition(e.x + e.w / 2, e.y + e.h - 10 - (e.on ? 3 : 0))
      .setVisible(e.label !== '');
  if (!g) return;
  const col = hexToInt(tagColor(e.tag)),
    y = e.y + e.h - 10 + sink * 5;
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(e.x + 2, e.y + e.h - 6, e.w - 4, 6, 2); // base rail
  g.fillStyle(0x59636b, 1);
  g.fillRoundedRect(e.x + 5, e.y + e.h - 5, e.w - 10, 3, 1);
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(e.x + 4, y - 2, e.w - 8, 11, 4);
  g.fillStyle(e.on ? 0xfff2b0 : col, 1);
  g.fillRoundedRect(e.x + 7, y, e.w - 14, 7, 3);
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(e.x + 11, y + 1, e.w - 26, 1.8);
}
export function drawLever(sp: Sprite, e: EntityView) {
  const sig = `${e.x}|${e.y}|${e.on}`;
  const g = redraw(sp, sig);
  if (!g) return;
  const col = hexToInt(tagColor(e.tag)),
    cx = e.x + e.w / 2,
    by = e.y + e.h;
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(cx - 17, by - 12, 34, 12, 4);
  g.fillStyle(0x7d8b95, 1);
  g.fillRoundedRect(cx - 14, by - 10, 28, 8, 3);
  const ang = e.on ? 0.65 : -0.65,
    hx = cx + Math.sin(ang) * 30,
    hy = by - 10 - Math.cos(ang) * 30;
  g.lineStyle(9, 0x2b1b17, 1);
  g.lineBetween(cx, by - 10, hx, hy);
  g.lineStyle(5, 0xd9dee2, 1);
  g.lineBetween(cx, by - 10, hx, hy);
  g.fillStyle(0x2b1b17, 1);
  g.fillCircle(hx, hy, 8.5);
  g.fillStyle(col, 1);
  g.fillCircle(hx, hy, 6);
}
export function drawGate(sp: Sprite, e: EntityView, wood: string) {
  const open = Math.round(sp.shown * 8) / 8;
  const sig = `${e.x}|${e.y}|${e.w}|${e.h}|${open}`;
  const g = redraw(sp, sig);
  if (!g) return;
  const col = hexToInt(tagColor(e.tag));
  const h = e.h * (1 - open * 0.88);
  if (h < 4) return;
  const n = Math.max(2, Math.round(e.w / 16));
  for (let i = 0; i < n; i++) {
    const bx = e.x + (i + 0.5) * (e.w / n);
    g.fillStyle(0x2b1b17, 1);
    g.fillRoundedRect(bx - 5.5, e.y, 11, h, 3);
    g.fillStyle(0xaeb8c0, 1);
    g.fillRoundedRect(bx - 3, e.y + 1.5, 6, h - 3, 2);
    g.fillStyle(0xffffff, 0.45);
    g.fillRect(bx - 2.5, e.y + 3, 1.8, h - 8);
  }
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(e.x - 2, e.y - 4, e.w + 4, 12, 3);
  g.fillStyle(col, 1);
  g.fillRoundedRect(e.x + 1, e.y - 1.5, e.w - 2, 7, 2);
  void wood;
}
export function drawLadderEnt(sp: Sprite, e: EntityView, biome: Biome) {
  const a = Math.round(sp.shown * 8) / 8;
  const sig = `${e.x}|${e.y}|${e.h}|${a}`;
  const g = redraw(sp, sig);
  if (!g) return;
  // ladder art is the canvas one: draw rails and rungs directly with Graphics to avoid a texture per height
  const alpha = 0.16 + a * 0.84;
  const x0 = e.x + e.w / 2 - 24;
  const wood = hexToInt(PALETTES[biome].wood);
  g.lineStyle(9, 0x2b1b17, alpha);
  g.lineBetween(x0 + 11, e.y, x0 + 11, e.y + e.h);
  g.lineBetween(x0 + 37, e.y, x0 + 37, e.y + e.h);
  g.lineStyle(4, wood, alpha);
  g.lineBetween(x0 + 11, e.y, x0 + 11, e.y + e.h);
  g.lineBetween(x0 + 37, e.y, x0 + 37, e.y + e.h);
  for (let yy = e.y + 8; yy < e.y + e.h; yy += 16) {
    g.lineStyle(5.5, 0x2b1b17, alpha);
    g.lineBetween(x0 + 11, yy, x0 + 37, yy);
    g.lineStyle(2.6, 0xe6b980, alpha);
    g.lineBetween(x0 + 11, yy, x0 + 37, yy);
  }
  void drawLadder;
}
export function drawMover(sp: Sprite, e: EntityView, wood: string, woodDark: string) {
  const sig = `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${e.w}|${e.h}`;
  const g = redraw(sp, sig);
  if (!g) return;
  const w = hexToInt(wood),
    wd = hexToInt(woodDark),
    th = Math.max(12, Math.min(e.h, 16));
  if (e.kind === 'balance') {
    // chains up to the pulley
    g.lineStyle(3.5, 0x2b1b17, 1);
    g.lineBetween(e.x + 6, e.y, e.x + 6, e.y - 150);
    g.lineBetween(e.x + e.w - 6, e.y, e.x + e.w - 6, e.y - 150);
    g.lineStyle(1.6, 0x9aa6ae, 1);
    g.lineBetween(e.x + 6, e.y, e.x + 6, e.y - 150);
    g.lineBetween(e.x + e.w - 6, e.y, e.x + e.w - 6, e.y - 150);
  }
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(e.x - 1.5, e.y - 1.5, e.w + 3, th + 3, 6);
  g.fillStyle(w, 1);
  g.fillRoundedRect(e.x + 1, e.y + 1, e.w - 2, th - 2, 5);
  g.fillStyle(wd, 1);
  g.fillRect(e.x + 3, e.y + th - 5, e.w - 6, 3);
  g.fillStyle(0xffffff, 0.3);
  g.fillRect(e.x + 6, e.y + 3, e.w - 12, 2);
  g.lineStyle(2, wd, 0.7);
  for (let x = e.x + 24; x < e.x + e.w - 4; x += 24) g.lineBetween(x, e.y + 1, x, e.y + th - 1);
  g.fillStyle(0x2b1b17, 1);
  g.fillCircle(e.x + 8, e.y + th / 2, 1.8);
  g.fillCircle(e.x + e.w - 8, e.y + th / 2, 1.8);
}
export function drawCrumbleEnt(sp: Sprite, e: EntityView, clock: number, biome: Biome) {
  // shaking / falling copy of the tile. Cheap: redraw as a Graphics block (the baked tile hides underneath until the grid clears it)
  const sh = e.on ? 0 : e.value * 2.4 * Math.sin(clock * 60);
  const fade = e.on ? 1 - e.value : 1;
  const sig = `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${sh.toFixed(1)}|${fade.toFixed(2)}`;
  const g = redraw(sp, sig);
  if (!g) return;
  if (e.value <= 0 && !e.on) return;
  const pal = PALETTES[biome];
  g.fillStyle(0x2b1b17, fade);
  g.fillRoundedRect(e.x + sh - 1, e.y - 1, e.w + 2, e.h + 2, 5);
  g.fillStyle(hexToInt(pal.wood), fade);
  g.fillRoundedRect(e.x + sh + 2, e.y + 2, e.w - 4, e.h - 4, 4);
  g.lineStyle(2.4, 0x2b1b17, fade);
  g.lineBetween(e.x + sh + 12, e.y + 2, e.x + sh + 18, e.y + 16);
  g.lineBetween(e.x + sh + 18, e.y + 16, e.x + sh + 11, e.y + 28);
  void ({} as CellCtx);
  void drawCrumble;
  void TILE;
}

// ---- campaign A5 (dynamics 5, 6, 9): Graphics only, redrawn when their signature changes
// Diana: bullseye in the colour of its gate's letter; lit with a clock arc (the seconds left of the open gate) while it is on.
export function drawTarget(sp: Sprite, e: EntityView) {
  const clock = Math.round(e.value * 24) / 24;
  const g = redraw(sp, `${e.x}|${e.y}|${e.w}|${e.h}|${e.on}|${clock}`);
  if (!g) return;
  const cx = e.x + e.w / 2,
    cy = e.y + e.h / 2,
    r = Math.min(e.w, e.h) / 2 - 4,
    col = hexToInt(tagColor(e.tag));
  g.fillStyle(0x2b1b17, 1);
  g.fillCircle(cx, cy, r + 4);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx, cy, r);
  g.fillStyle(e.on ? 0xfff2b0 : col, 1);
  g.fillCircle(cx, cy, r * 0.72);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx, cy, r * 0.46);
  g.fillStyle(e.on ? 0xffc21a : 0xe63b2e, 1);
  g.fillCircle(cx, cy, r * 0.22);
  if (e.on && clock > 0) {
    g.lineStyle(5, 0xfff2b0, 1);
    g.beginPath();
    g.arc(cx, cy, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clock, false);
    g.strokePath();
  }
}
