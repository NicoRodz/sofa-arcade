// Kitchen environment: floor, walls, benches and the static body of every station, baked into ONE canvas texture.
import Phaser from 'phaser';
import type { Grid, Tile } from '@party/shared/maps';
import { C, H, HUD_H, OX, OY, TILE, U, W, floorPair } from './tokens';
import { circle, drawOutlined, rng, rr, shade, vgrad, type Ctx } from './gfx';
import { RAW_KIND, drawFood, ingredientColor } from './food';

const BG_R = 1.5;
type Kind = 'wall' | 'floor' | 'water' | 'bench' | 'oven' | 'out';

const kindOf = (g: Grid, x: number, y: number): Kind => {
  const t: Tile | undefined = g[y]?.[x];
  if (!t) return 'out';
  if (t.kind === 'station') return t.station === 'pot' ? 'oven' : 'bench';
  return t.kind;
};

// Rounded rect with a radius per corner [tl, tr, br, bl].
function rrc(c: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  c.beginPath();
  c.moveTo(x + r[0], y);
  c.lineTo(x + w - r[1], y); c.arcTo(x + w, y, x + w, y + r[1], r[1] || 0.001);
  c.lineTo(x + w, y + h - r[2]); c.arcTo(x + w, y + h, x + w - r[2], y + h, r[2] || 0.001);
  c.lineTo(x + r[3], y + h); c.arcTo(x, y + h, x, y + h - r[3], r[3] || 0.001);
  c.lineTo(x, y + r[0]); c.arcTo(x, y, x + r[0], y, r[0] || 0.001);
  c.closePath();
}

function outerWall(c: Ctx) {
  c.fillStyle = C.cocoa; c.fillRect(0, 0, W, H);
  c.fillStyle = vgrad(c, 0, H, '#46332B', '#352620'); c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2;
  const bh = 24, bw = 64;
  for (let y = 0, row = 0; y < H; y += bh, row++) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    for (let x = (row % 2) * (bw / 2); x < W; x += bw) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + bh); c.stroke(); }
  }
  c.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0, row = 0; y < H; y += bh, row++) for (let x = (row % 2) * (bw / 2); x < W; x += bw) if ((x / bw + row) % 3 === 0) c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
  // HUD trim
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 0, W, HUD_H - 8);
  c.fillStyle = C.wallTop; c.fillRect(0, HUD_H - 8, W, 8);
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, HUD_H - 8, W, 2);
  c.fillStyle = C.ink; c.fillRect(0, HUD_H, W, 3);
}

function floorPass(c: Ctx, g: Grid, pair: [string, string]) {
  g.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind !== 'floor') return;
    const x0 = tx * 120, y0 = ty * 120;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = (tx * 2 + i + ty * 2 + j) % 2 ? pair[1] : pair[0];
      c.fillRect(x0 + i * 60, y0 + j * 60, 60, 60);
    }
    c.strokeStyle = 'rgba(80,50,20,0.06)'; c.lineWidth = 1;
    c.strokeRect(x0, y0, 60, 60); c.strokeRect(x0 + 60, y0, 60, 60); c.strokeRect(x0, y0 + 60, 60, 60); c.strokeRect(x0 + 60, y0 + 60, 60, 60);
    const n = kindOf(g, tx, ty - 1), w = kindOf(g, tx - 1, ty), e = kindOf(g, tx + 1, ty);
    if (n === 'bench' || n === 'wall' || n === 'oven' || n === 'out') {
      c.fillStyle = vgrad(c, y0, y0 + 22, 'rgba(50,25,10,0.34)', 'rgba(50,25,10,0)'); c.fillRect(x0, y0, 120, 22);
    }
    if (w === 'bench' || w === 'wall' || w === 'oven') {
      const gr = c.createLinearGradient(x0, 0, x0 + 12, 0); gr.addColorStop(0, 'rgba(50,25,10,0.22)'); gr.addColorStop(1, 'rgba(50,25,10,0)');
      c.fillStyle = gr; c.fillRect(x0, y0, 12, 120);
    }
    if (e === 'bench' || e === 'wall' || e === 'oven') {
      const gr = c.createLinearGradient(x0 + 120, 0, x0 + 108, 0); gr.addColorStop(0, 'rgba(50,25,10,0.16)'); gr.addColorStop(1, 'rgba(50,25,10,0)');
      c.fillStyle = gr; c.fillRect(x0 + 108, y0, 12, 120);
    }
  }));
}

function waterPass(c: Ctx, g: Grid) {
  g.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind !== 'water') return;
    const x0 = tx * 120, y0 = ty * 120;
    c.fillStyle = vgrad(c, y0, y0 + 120, '#63C1EE', '#2F7DB8'); c.fillRect(x0, y0, 120, 120);
    const n = kindOf(g, tx, ty - 1);
    if (n !== 'water' && n !== 'floor') { c.fillStyle = vgrad(c, y0, y0 + 30, 'rgba(10,40,80,0.45)', 'rgba(10,40,80,0)'); c.fillRect(x0, y0, 120, 30); }
    const rnd = rng(tx * 31 + ty * 17 + 5);
    c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = x0 + 14 + rnd() * 70, y = y0 + 14 + i * 26 + rnd() * 8;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10, y - 7, x + 20, y); c.quadraticCurveTo(x + 30, y + 7, x + 40, y); c.stroke();
    }
  }));
}

function seed(tx: number, ty: number) { return tx * 73 + ty * 19 + 3; }

function benchTop(c: Ctx, g: Grid, tx: number, ty: number) {
  const x0 = tx * 120, y0 = ty * 120;
  const below = kindOf(g, tx, ty + 1) === 'bench';
  const topH = below ? 120 : 102;
  c.fillStyle = vgrad(c, y0, y0 + topH, '#D9A064', C.wood); c.fillRect(x0, y0, 120, topH);
  if (kindOf(g, tx, ty - 1) !== 'bench') { c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x0, y0, 120, 4); }
  const rnd = rng(seed(tx, ty));
  c.strokeStyle = 'rgba(90,50,20,0.15)'; c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const y = y0 + 16 + i * 28 + rnd() * 8, x = x0 + 6 + rnd() * 30;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 30, y - 5, x + 60, y + 1); c.quadraticCurveTo(x + 75, y + 4, x + 100 - rnd() * 20, y); c.stroke();
  }
  if (!below) {
    c.fillStyle = vgrad(c, y0 + 102, y0 + 120, C.wood2, shade(C.wood2, -0.25)); c.fillRect(x0, y0 + 102, 120, 18);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x0, y0 + 100, 120, 3);
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2;
    for (let x = 30; x < 120; x += 30) { c.beginPath(); c.moveTo(x0 + x, y0 + 104); c.lineTo(x0 + x, y0 + 120); c.stroke(); }
  }
}

function wallTop(c: Ctx, g: Grid, tx: number, ty: number) {
  const x0 = tx * 120, y0 = ty * 120;
  const below = kindOf(g, tx, ty + 1) === 'wall';
  const topH = below ? 120 : 96;
  c.fillStyle = vgrad(c, y0, y0 + topH, '#6B4E44', C.wallTop); c.fillRect(x0, y0, 120, topH);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
  for (let r = 0; r * 24 < topH; r++) {
    c.beginPath(); c.moveTo(x0, y0 + r * 24); c.lineTo(x0 + 120, y0 + r * 24); c.stroke();
    for (let x = (r % 2) * 30; x < 120; x += 60) { c.beginPath(); c.moveTo(x0 + x, y0 + r * 24); c.lineTo(x0 + x, y0 + r * 24 + 24); c.stroke(); }
  }
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x0, y0, 120, 4);
  if (!below) { c.fillStyle = vgrad(c, y0 + 96, y0 + 120, C.cocoa, '#2A1D18'); c.fillRect(x0, y0 + 96, 120, 24); }
}

function masses(c: Ctx, g: Grid) {
  const mass = (k: Kind) => k === 'bench' || k === 'wall';
  const radii = (tx: number, ty: number, k: Kind): [number, number, number, number] => {
    const same = (dx: number, dy: number) => kindOf(g, tx + dx, ty + dy) === k;
    const r = (a: boolean, b: boolean) => (!a && !b ? 14 : 0);
    return [r(same(0, -1), same(-1, 0)), r(same(0, -1), same(1, 0)), r(same(0, 1), same(1, 0)), r(same(0, 1), same(-1, 0))];
  };
  const tiles: [number, number, Kind][] = [];
  g.forEach((_row, ty) => _row.forEach((_t, tx) => { const k = kindOf(g, tx, ty); if (mass(k)) tiles.push([tx, ty, k]); }));
  // outline layer: the same shapes grown by the ink width
  for (const [tx, ty, k] of tiles) {
    const rd = radii(tx, ty, k).map((v) => (v ? v + 3 : 0)) as [number, number, number, number];
    rrc(c, tx * 120 - 3, ty * 120 - 3, 126, 126, rd); c.fillStyle = C.ink; c.fill();
  }
  for (const [tx, ty, k] of tiles) {
    c.save(); rrc(c, tx * 120, ty * 120, 120, 120, radii(tx, ty, k)); c.clip();
    if (k === 'bench') benchTop(c, g, tx, ty); else wallTop(c, g, tx, ty);
    c.restore();
  }
  // seams between different masses
  c.strokeStyle = C.ink; c.lineWidth = 3;
  for (const [tx, ty, k] of tiles) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const n = kindOf(g, tx + dx, ty + dy);
      if (n !== k && (mass(n) || n === 'oven')) {
        c.beginPath();
        if (dx) { c.moveTo((tx + 1) * 120, ty * 120); c.lineTo((tx + 1) * 120, (ty + 1) * 120); } else { c.moveTo(tx * 120, (ty + 1) * 120); c.lineTo((tx + 1) * 120, (ty + 1) * 120); }
        c.stroke();
      }
    }
  }
}

function crate(c: Ctx, x0: number, y0: number, type: number) {
  const col = ingredientColor(type);
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(60, 112, 50, 7, 0, 0, Math.PI * 2); c.fill();
  // body
  drawOutlined(c, () => rr(c, 8, 26, 104, 86, 10), vgrad(c, 26, 112, '#B0763D', C.wood2), { lw: 3 });
  // dark interior
  c.fillStyle = '#4A2E1C'; rr(c, 16, 32, 88, 36, 6); c.fill();
  // contents behind the front panel
  c.save(); rr(c, 8, 0, 104, 76, 0); c.clip();
  c.save(); c.translate(32, 54); c.scale(0.8, 0.8); drawFood(c, RAW_KIND[type]!); c.restore();
  c.save(); c.translate(88, 54); c.scale(0.8, 0.8); drawFood(c, RAW_KIND[type]!); c.restore();
  c.save(); c.translate(60, 48); c.scale(1.3, 1.3); drawFood(c, RAW_KIND[type]!); c.restore();
  c.restore();
  // front panel with slats
  drawOutlined(c, () => rr(c, 8, 62, 104, 50, 8), vgrad(c, 62, 112, '#C98A4B', C.wood2), { lw: 3 });
  c.strokeStyle = 'rgba(60,30,10,0.32)'; c.lineWidth = 2.5;
  for (const y of [78, 96]) { c.beginPath(); c.moveTo(14, y); c.lineTo(106, y); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(14, 66, 92, 3);
  // label
  drawOutlined(c, () => rr(c, 26, 80, 68, 24, 8), col, { lw: 2.5 });
  c.fillStyle = type === 1 || type === 3 ? C.cream : C.ink;
  const name = ['MASA', 'TOMATE', 'QUESO', 'PEPPERONI', 'CHAMPIÑÓN'][type]!;
  c.font = `800 ${name.length > 6 ? 11 : 15}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(name, 60, 93);
  c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(31, 86, 1.8, 0, Math.PI * 2); c.fill();
  c.restore();
}

function board(c: Ctx, x0: number, y0: number, tx: number, ty: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)'; rr(c, 14, 22, 96, 72, 12); c.fill();
  drawOutlined(c, () => rr(c, 12, 14, 96, 72, 12), vgrad(c, 14, 86, '#F2CB96', '#E0AE70'), { lw: 2.5 });
  c.strokeStyle = 'rgba(140,90,40,0.25)'; c.lineWidth = 2;
  const rnd = rng(seed(tx, ty) + 9);
  for (let i = 0; i < 4; i++) {
    const y = 26 + i * 15 + rnd() * 3;
    c.beginPath(); c.moveTo(22, y); c.quadraticCurveTo(50, y - 4, 70 + rnd() * 20, y + 1); c.stroke();
  }
  drawOutlined(c, () => { c.beginPath(); c.ellipse(96, 24, 4.5, 3, 0, 0, Math.PI * 2); }, '#9C6232', { lw: 1.8 });
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(18, 18, 50, 3);
  c.fillStyle = 'rgba(120,70,30,0.35)';
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(24 + rnd() * 66, 62 + rnd() * 18, 1.4 + rnd(), 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function oven(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(60, 114, 54, 7, 0, 0, Math.PI * 2); c.fill();
  // chimney
  drawOutlined(c, () => rr(c, 76, -14, 26, 52, 4), vgrad(c, -14, 38, '#8C3F2E', C.brick2), { lw: 3 });
  drawOutlined(c, () => rr(c, 72, -20, 34, 12, 4), '#5E2A20', { lw: 3 });
  // dome body
  const body = () => { c.beginPath(); c.moveTo(6, 114); c.lineTo(6, 62); c.arc(60, 62, 54, Math.PI, 0); c.lineTo(114, 114); c.closePath(); };
  drawOutlined(c, body, vgrad(c, 8, 114, '#CC6048', C.brick2), { lw: 3.5 });
  c.save(); body(); c.clip();
  c.strokeStyle = 'rgba(60,15,10,0.38)'; c.lineWidth = 2;
  for (let r = 0; r < 8; r++) {
    const y = 14 + r * 14;
    c.beginPath(); c.moveTo(0, y); c.lineTo(120, y); c.stroke();
    for (let x = (r % 2) * 18; x < 120; x += 36) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 14); c.stroke(); }
  }
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.beginPath(); c.ellipse(34, 40, 22, 10, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
  // mouth
  const mouth = () => { c.beginPath(); c.moveTo(30, 108); c.lineTo(30, 80); c.arc(60, 80, 30, Math.PI, 0); c.lineTo(90, 108); c.closePath(); };
  drawOutlined(c, mouth, '#E8C9A0', { lw: 3 });
  c.save(); c.translate(0, 3); c.scale(1, 1);
  c.beginPath(); c.moveTo(35, 106); c.lineTo(35, 80); c.arc(60, 80, 25, Math.PI, 0); c.lineTo(85, 106); c.closePath();
  c.fillStyle = vgrad(c, 55, 106, '#1B0F0B', '#4A1F12'); c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2.5; c.stroke();
  c.restore();
  // ledge
  drawOutlined(c, () => rr(c, 24, 104, 72, 12, 5), vgrad(c, 104, 116, '#B7803F', C.wood2), { lw: 2.5 });
  c.restore();
}

function plates(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)'; c.beginPath(); c.ellipse(60, 90, 40, 9, 0, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(60, 70 - i * 6); c.scale(0.95, 0.95);
    drawOutlined(c, circle(c, 0, 0, 32), vgrad(c, -32, 32, '#EEF3F6', C.steel2), { lw: 2.5 });
    c.fillStyle = vgrad(c, -26, 26, '#F8FBFC', C.steel); c.beginPath(); c.arc(0, 0, 25, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(43,27,23,0.3)'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3; c.beginPath(); c.arc(60, 46, 24, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
  c.restore();
}

function trashCan(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)'; c.beginPath(); c.ellipse(60, 104, 40, 8, 0, 0, Math.PI * 2); c.fill();
  // can body: slightly tapered steel drum with two ribs
  drawOutlined(c, () => { c.beginPath(); c.moveTo(30, 46); c.lineTo(90, 46); c.lineTo(84, 106); c.lineTo(36, 106); c.closePath(); }, vgrad(c, 46, 106, '#D6DFE5', C.steel2), { lw: 3 });
  c.strokeStyle = 'rgba(43,27,23,0.3)'; c.lineWidth = 2.5;
  for (const x of [48, 60, 72]) { c.beginPath(); c.moveTo(x - (60 - x) * 0.1, 56); c.lineTo(x + (x - 60) * 0.08, 98); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(35, 50, 5, 40);
  // basil band with a cream cross: "tira aqui lo que no sirve"
  drawOutlined(c, () => rr(c, 34, 66, 52, 18, 5), C.basil, { lw: 2.5 });
  c.strokeStyle = C.cream; c.lineWidth = 3.5; c.beginPath(); c.moveTo(54, 70); c.lineTo(66, 80); c.moveTo(66, 70); c.lineTo(54, 80); c.stroke();
  // lid and handle
  drawOutlined(c, () => rr(c, 25, 34, 70, 15, 7), vgrad(c, 34, 49, '#EAF0F3', C.steel), { lw: 3 });
  drawOutlined(c, () => rr(c, 50, 24, 20, 11, 5), C.steel2, { lw: 2.5 });
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 39); c.lineTo(52, 38); c.stroke();
  c.restore();
}

// Sabotage: the catapult. A wooden cart on two wheels with a post and a throwing arm that ends in a bag-shaped cup (the bag itself is a dynamic sprite
// that sits in it while the chef aims). Painted warning stripes on the base say "this one throws".
function catapult(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.28)'; c.beginPath(); c.ellipse(60, 110, 54, 8, 0, 0, Math.PI * 2); c.fill();
  // base slab with hazard stripes
  drawOutlined(c, () => rr(c, 8, 74, 104, 30, 8), vgrad(c, 74, 104, '#C98A4B', C.wood2), { lw: 3 });
  c.save(); rr(c, 8, 74, 104, 30, 8); c.clip();
  c.fillStyle = C.cheese;
  for (let i = -2; i < 8; i++) { c.beginPath(); c.moveTo(8 + i * 18, 104); c.lineTo(8 + i * 18 + 9, 104); c.lineTo(8 + i * 18 + 27, 74); c.lineTo(8 + i * 18 + 18, 74); c.closePath(); c.fill(); }
  c.fillStyle = 'rgba(43,27,23,0.55)'; c.fillRect(8, 74, 104, 5);
  c.restore();
  rr(c, 8, 74, 104, 30, 8); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
  // wheels
  for (const x of [30, 90]) {
    drawOutlined(c, circle(c, x, 106, 13), vgrad(c, 93, 119, '#6B4528', '#3C2615'), { lw: 3 });
    c.strokeStyle = '#B98A55'; c.lineWidth = 2.5;
    for (let a = 0; a < 3; a++) { c.beginPath(); c.moveTo(x - Math.cos(a * 1.047) * 10, 106 - Math.sin(a * 1.047) * 10); c.lineTo(x + Math.cos(a * 1.047) * 10, 106 + Math.sin(a * 1.047) * 10); c.stroke(); }
    drawOutlined(c, circle(c, x, 106, 3.5), C.steel, { lw: 2 });
  }
  // post and arm
  drawOutlined(c, () => rr(c, 50, 30, 20, 50, 4), vgrad(c, 30, 80, '#B7803F', C.wood2), { lw: 3 });
  c.save(); c.translate(60, 38); c.rotate(-0.62);
  drawOutlined(c, () => rr(c, -22, -7, 84, 14, 5), vgrad(c, -7, 7, '#E0A765', '#B7803F'), { lw: 3 });
  // the cup at the end of the arm
  drawOutlined(c, () => { c.beginPath(); c.moveTo(48, -5); c.lineTo(76, -9); c.quadraticCurveTo(72, 16, 54, 14); c.closePath(); }, vgrad(c, -9, 16, '#59606E', '#2A2E39'), { lw: 3 });
  drawOutlined(c, circle(c, 0, 0, 5.5), C.steel2, { lw: 2.5 });
  c.restore();
  // counterweight on the short end
  drawOutlined(c, () => rr(c, 34, 44, 18, 20, 5), vgrad(c, 44, 64, '#8A96A0', '#4D5963'), { lw: 3 });
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(14, 82); c.lineTo(40, 80); c.stroke();
  c.restore();
}

// Return window for dirty plates: a grey bus tub with a slot and a "SUCIOS" tag.
function dirtyReturn(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)'; c.beginPath(); c.ellipse(60, 104, 46, 8, 0, 0, Math.PI * 2); c.fill();
  drawOutlined(c, () => { c.beginPath(); c.moveTo(16, 44); c.lineTo(104, 44); c.lineTo(96, 104); c.lineTo(24, 104); c.closePath(); }, vgrad(c, 44, 104, '#8FA0AB', '#667782'), { lw: 3 });
  drawOutlined(c, () => rr(c, 10, 34, 100, 16, 7), vgrad(c, 34, 50, '#C9D4DA', '#93A3AD'), { lw: 3 });
  c.fillStyle = '#2B1B17'; c.beginPath(); c.roundRect(24, 38, 72, 7, 3.5); c.fill(); // slot
  drawOutlined(c, () => rr(c, 34, 66, 52, 22, 6), C.cream, { lw: 2.5 });
  c.fillStyle = C.tomato2; c.font = '800 15px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('SUCIOS', 60, 78);
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 3; c.beginPath(); c.moveTo(22, 56); c.lineTo(28, 96); c.stroke();
  c.restore();
}

// Sink: steel counter with a recessed basin of soapy water and a tap.
function sinkStation(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)'; c.beginPath(); c.ellipse(60, 108, 52, 8, 0, 0, Math.PI * 2); c.fill();
  drawOutlined(c, () => rr(c, 6, 34, 108, 74, 12), vgrad(c, 34, 108, '#DCE5EA', '#9BAAB4'), { lw: 3 });
  drawOutlined(c, () => rr(c, 16, 52, 88, 46, 10), vgrad(c, 52, 98, '#7FD0F2', '#2F86C2'), { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (const [x, y, r] of [[34, 66, 5], [44, 76, 3.2], [72, 70, 6], [84, 82, 3.6], [60, 86, 2.6]] as const) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5; c.stroke(); }
  // tap
  drawOutlined(c, () => { c.beginPath(); c.moveTo(60, 44); c.lineTo(60, 20); c.quadraticCurveTo(60, 8, 74, 8); c.lineTo(86, 8); c.lineTo(86, 20); c.lineTo(74, 20); c.lineTo(72, 44); c.closePath(); }, vgrad(c, 8, 44, '#F2F6F8', C.steel2), { lw: 2.5 });
  drawOutlined(c, circle(c, 40, 40, 6), C.tomato, { lw: 2 });
  drawOutlined(c, circle(c, 80, 40, 6), '#2F7DE1', { lw: 2 });
  c.restore();
}

function windowStation(c: Ctx, x0: number, y0: number) {
  c.save(); c.translate(x0, y0);
  // cream service pad on the counter
  drawOutlined(c, () => rr(c, 14, 44, 92, 52, 12), vgrad(c, 44, 96, '#FFF8EA', '#F1DFC0'), { lw: 2.5 });
  c.strokeStyle = 'rgba(230,59,46,0.5)'; c.lineWidth = 2.5; c.setLineDash([8, 6]); rr(c, 20, 50, 80, 40, 8); c.stroke(); c.setLineDash([]);
  // awning
  c.save();
  const n = 6, sw = 120 / n;
  const awning = () => {
    c.beginPath(); c.moveTo(-2, -4); c.lineTo(122, -4); c.lineTo(122, 30);
    for (let i = n - 1; i >= 0; i--) { c.arc(i * sw + sw / 2, 30, sw / 2, 0, Math.PI, false); }
    c.closePath();
  };
  c.fillStyle = C.cream; awning(); c.fill();
  c.save(); awning(); c.clip();
  for (let i = 0; i < n; i += 2) { c.fillStyle = C.tomato; c.fillRect(i * sw, -6, sw, 60); }
  c.fillStyle = vgrad(c, -4, 40, 'rgba(255,255,255,0.28)', 'rgba(0,0,0,0.12)'); c.fillRect(0, -6, 120, 60);
  c.restore();
  awning(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
  c.restore();
  c.restore();
}

export function buildBackground(scene: Phaser.Scene, g: Grid, mapId: string, seedN: number, topping = 2): Phaser.GameObjects.Image { // topping: what the cheese crate holds this round (2 cheese, 3 pepperoni, 4 mushroom)
  const key = `bg_${scene.textures.getTextureKeys().filter((k) => k.startsWith('bg_')).length}_${Date.now() % 100000}`;
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('bg_')) scene.textures.remove(k);
  const tex = scene.textures.createCanvas(key, Math.ceil(W * BG_R), Math.ceil(H * BG_R))!;
  const c = tex.getContext();
  c.scale(BG_R, BG_R);
  c.lineJoin = 'round'; c.lineCap = 'round';
  outerWall(c);
  c.save(); c.translate(OX, OY); c.scale(U, U);
  // clip the playfield so soft shadows never spill into the wall
  floorPass(c, g, floorPair(mapId, seedN));
  waterPass(c, g);
  masses(c, g);
  g.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind !== 'station') return;
    const x0 = tx * 120, y0 = ty * 120;
    if (t.station === 'crate') crate(c, x0, y0, t.crate === 2 ? topping : t.crate);
    else if (t.station === 'board') board(c, x0, y0, tx, ty);
    else if (t.station === 'pot') oven(c, x0, y0);
    else if (t.station === 'plates') plates(c, x0, y0);
    else if (t.station === 'window') windowStation(c, x0, y0);
    else if (t.station === 'trash') trashCan(c, x0, y0);
    else if (t.station === 'catapult') catapult(c, x0, y0);
    else if (t.station === 'dirty') dirtyReturn(c, x0, y0);
    else if (t.station === 'sink') sinkStation(c, x0, y0);
  }));
  c.restore();
  // soft vignette
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  tex.refresh();
  return scene.add.image(0, 0, key).setOrigin(0, 0).setScale(1 / BG_R).setDepth(0);
}

export const tileCenter = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
