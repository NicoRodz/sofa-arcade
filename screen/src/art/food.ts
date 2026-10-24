// Food and items, drawn procedurally at the current ctx origin. One box of 72x72 design units per item.
import Phaser from 'phaser';
import type { Item } from '@party/shared/game';
import { C } from './tokens';
import { blob, circle, contactShadow, drawOutlined, ellipse, makeTex, mix, rng, shade, shine, star, type Ctx } from './gfx';

export type FoodKind =
  | 'dough_raw' | 'dough_str' | 'tomato' | 'tomato_cut' | 'pizza_raw' | 'pizza_done' | 'pizza_burnt' | 'tray' | 'dish' | 'box';

export const ITEM_KIND: Record<Item, FoodKind> = {
  raw0: 'dough_raw', cut0: 'dough_str', raw1: 'tomato', cut1: 'tomato_cut', plate: 'tray', dish: 'dish',
};
export const ingredientColor = (type: number) => (type === 0 ? C.dough : C.tomato);
export const foodKey = (k: FoodKind) => `it_${k}`;

function radial(c: Ctx, x: number, y: number, r: number, inner: string, outer: string) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  return g;
}

function doughRaw(c: Ctx) {
  drawOutlined(c, () => blob(c, 0, 0, 22, 10, 2, 7), radial(c, 0, 0, 24, '#FFEFC8', C.dough), { lw: 2.5, shadow: [2, 22, 20, 5] });
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath(); c.ellipse(-7, -8, 8, 5, -0.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.dough2;
  c.beginPath(); c.ellipse(8, 6, 7, 4.5, 0.4, 0, Math.PI * 2); c.fill();
  shine(c, 0, 0, 17, 0.5, 2.5);
}

function doughStr(c: Ctx, withShadow = true) {
  drawOutlined(c, circle(c, 0, 0, 28), C.doughEdge, { lw: 2.5, shadow: withShadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = radial(c, 0, 0, 23, '#FFF1D0', C.dough2);
  c.beginPath(); c.arc(0, 0, 22.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(160,110,50,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 22.5, 0, Math.PI * 2); c.stroke();
  const rnd = rng(11);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc((rnd() - 0.5) * 34, (rnd() - 0.5) * 34, 1.6 + rnd() * 1.2, 0, Math.PI * 2); c.fill(); }
  shine(c, 0, 0, 24, 0.5, 2.5);
}

function tomato(c: Ctx) {
  drawOutlined(c, () => { c.beginPath(); c.ellipse(0, 3, 20, 18, 0, 0, Math.PI * 2); }, radial(c, 0, 2, 20, '#FF6A57', C.tomato2), { lw: 2.5, shadow: [2, 22, 18, 5] });
  c.fillStyle = C.tomato; c.beginPath(); c.ellipse(1, 5, 15, 12, 0, 0, Math.PI * 2); c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1;
  // calyx
  drawOutlined(c, () => star(c, 0, -13, 10, 4.5, 5), C.basil, { lw: 2 });
  c.fillStyle = C.basil2; c.beginPath(); c.arc(0, -13, 2.2, 0, Math.PI * 2); c.fill();
  shine(c, 0, 3, 14, 0.55, 3);
}

function slice(c: Ctx, x: number, y: number, r: number, rot: number) {
  c.save(); c.translate(x, y); c.rotate(rot);
  drawOutlined(c, circle(c, 0, 0, r), C.tomato2, { lw: 2 });
  c.fillStyle = C.tomato; c.beginPath(); c.arc(0, 0, r - 2.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#FF7B6B'; c.beginPath(); c.arc(0, 0, r - 4.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(181,40,31,0.45)'; c.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * (r - 4.5), Math.sin(a) * (r - 4.5)); c.stroke(); }
  c.fillStyle = '#FFE3A0';
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; c.beginPath(); c.ellipse(Math.cos(a) * 4.8, Math.sin(a) * 4.8, 1.7, 1.1, a, 0, Math.PI * 2); c.fill(); }
  c.restore();
}
function tomatoCut(c: Ctx) {
  contactShadow(c, 0, 22, 22, 5);
  slice(c, -10, 6, 12, 0.3); slice(c, 10, 8, 12, -0.4); slice(c, 0, -8, 13, 0.1);
}

function pizzaRaw(c: Ctx, shadow = true) {
  doughStr(c, shadow);
  c.fillStyle = '#D7362A'; blob(c, 0, 0, 21.5, 12, 1.5, 5); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-7, -8, 9, 5, -0.6, 0, Math.PI * 2); c.fill();
  const rnd = rng(29);
  c.fillStyle = '#FFE58A';
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 14;
    c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 3.4, 2.6, rnd() * 3, 0, Math.PI * 2); c.fill();
  }
}

function pizzaDone(c: Ctx, shadow = true) {
  drawOutlined(c, () => blob(c, 0, 0, 28, 14, 1, 3), C.crust, { lw: 2.5, shadow: shadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = mix(C.crust, '#FFFFFF', 0.25); c.beginPath(); c.ellipse(-12, -14, 10, 4, -0.7, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.tomato; blob(c, 0, 0, 23, 12, 1, 8); c.fill();
  c.fillStyle = radial(c, 0, 0, 21, '#FFE46A', C.cheese); blob(c, 0, 0, 20.5, 11, 1.6, 4); c.fill();
  const rnd = rng(17);
  c.fillStyle = '#F2B33D';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(), d = 6 + rnd() * 9;
    c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 3.6, 2.8, rnd() * 3, 0, Math.PI * 2); c.fill();
  }
  for (const [x, y, rot] of [[-8, -4, 0.6], [7, -9, -0.5], [3, 9, 0.2]] as const) {
    c.save(); c.translate(x, y); c.rotate(rot);
    drawOutlined(c, ellipse(c, 0, 0, 5.6, 3.4), C.basil, { lw: 1.6 });
    c.strokeStyle = C.basil2; c.lineWidth = 1; c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke();
    c.restore();
  }
  shine(c, 0, 0, 25, 0.45, 2.5);
}

function pizzaBurnt(c: Ctx, shadow = true) {
  drawOutlined(c, () => blob(c, 0, 0, 28, 14, 1, 3), C.burnt, { lw: 2.5, shadow: shadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = C.burnt2; blob(c, 0, 0, 22, 12, 1.5, 8); c.fill();
  c.strokeStyle = C.ink; c.lineWidth = 2;
  for (const [a, b, d, e] of [[-14, -6, -2, 2], [-4, 10, 8, 2], [4, -12, 12, -2]] as const) {
    c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineTo(d + 4, e + 8); c.stroke();
  }
}

function tray(c: Ctx) {
  // round peel: handle first so the disc covers its root
  drawOutlined(c, () => { c.beginPath(); c.roundRect(-5, 20, 10, 22, 4); }, C.wood2, { lw: 2.5 });
  contactShadow(c, 2, 30, 30, 6);
  const g = c.createLinearGradient(-24, -28, 24, 28);
  g.addColorStop(0, '#E4ECF0'); g.addColorStop(1, C.steel2);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.fill(); c.lineWidth = 2.5; c.strokeStyle = C.ink; c.stroke();
  c.strokeStyle = 'rgba(43,27,23,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.stroke();
  c.fillStyle = shade(C.steel, 0.35); c.beginPath(); c.arc(0, 0, 25, 0, Math.PI * 2); c.fill();
  shine(c, 0, 0, 28, 0.6, 3);
}

function dish(c: Ctx) {
  tray(c);
  c.save(); c.scale(0.82, 0.82); pizzaDone(c, false); c.restore();
}

function box(c: Ctx) {
  contactShadow(c, 2, 28, 30, 6);
  const g = c.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, '#F1D6AE'); g.addColorStop(1, C.cardboard);
  c.fillStyle = g; c.beginPath(); c.roundRect(-30, -30, 60, 60, 5); c.fill(); c.lineWidth = 2.5; c.strokeStyle = C.ink; c.stroke();
  c.strokeStyle = C.cardboard2; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-30, -18); c.lineTo(30, -18); c.stroke();
  drawOutlined(c, circle(c, 0, 4, 14), C.tomato, { lw: 2 });
  c.fillStyle = C.cream; c.font = '800 18px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('P', 0, 5);
}

const DRAW: Record<FoodKind, (c: Ctx) => void> = {
  dough_raw: doughRaw, dough_str: (c) => doughStr(c), tomato, tomato_cut: tomatoCut, pizza_raw: (c) => pizzaRaw(c),
  pizza_done: (c) => pizzaDone(c), pizza_burnt: (c) => pizzaBurnt(c), tray, dish, box,
};
export const drawFood = (c: Ctx, k: FoodKind) => DRAW[k](c);

export function buildFoodTextures(scene: Phaser.Scene) {
  for (const k of Object.keys(DRAW) as FoodKind[]) makeTex(scene, foodKey(k), { w: 84, h: 92, oy: 40 }, DRAW[k]);
}
