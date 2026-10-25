// Food and items, drawn procedurally at the current ctx origin. One box of 72x72 design units per item.
import type Phaser from 'phaser';
import type { Item } from '../../sim/overcooked';
import { C } from '@pichi/screen-kit/art/tokens';
import {
  blob,
  circle,
  contactShadow,
  drawOutlined,
  ellipse,
  makeTex,
  mix,
  rng,
  shade,
  shine,
  star,
  vgrad,
  type Ctx,
} from '@pichi/screen-kit/art/gfx';
import { EXTRA_COLOR, EXTRA_ITEM_KIND, extraDraw, type RecipeFoodKind } from './food/recipes'; // the Carta del día: pepperoni, mushroom, calzone

export type FoodKind =
  | 'dough_raw'
  | 'dough_str'
  | 'tomato'
  | 'tomato_cut'
  | 'cheese_raw'
  | 'cheese_cut'
  | 'pizza_raw'
  | 'pizza_raw_q'
  | 'pizza_done'
  | 'pizza_done_q'
  | 'pizza_burnt'
  | 'tray'
  | 'tray_dirty'
  | 'dish'
  | 'dish_q'
  | 'dish_burnt'
  | 'box'
  | 'peel'
  | 'bag'
  | RecipeFoodKind;

export const ITEM_KIND: Record<Item, FoodKind> = {
  raw0: 'dough_raw',
  cut0: 'dough_str',
  raw1: 'tomato',
  cut1: 'tomato_cut',
  raw2: 'cheese_raw',
  cut2: 'cheese_cut',
  plate: 'tray',
  dirty: 'tray_dirty',
  dish: 'dish',
  dishQ: 'dish_q',
  burnt: 'dish_burnt',
  trash: 'peel',
  trashBag: 'bag',
  ...EXTRA_ITEM_KIND,
};
export const RAW_KIND: readonly FoodKind[] = ['dough_raw', 'tomato', 'cheese_raw', 'pepperoni_raw', 'mushroom_raw'];
export const CUT_KIND: readonly FoodKind[] = ['dough_str', 'tomato_cut', 'cheese_cut', 'pepperoni_cut', 'mushroom_cut'];
export const ingredientColor = (type: number) =>
  type === 0 ? C.dough : type === 1 ? C.tomato : type === 2 ? C.cheese : (EXTRA_COLOR[type - 3] ?? C.cheese);
export const foodKey = (k: FoodKind) => `it_${k}`;

function radial(c: Ctx, x: number, y: number, r: number, inner: string, outer: string) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

function doughRaw(c: Ctx) {
  drawOutlined(c, () => blob(c, 0, 0, 22, 10, 2, 7), radial(c, 0, 0, 24, '#FFEFC8', C.dough), { lw: 2.5, shadow: [2, 22, 20, 5] });
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.ellipse(-7, -8, 8, 5, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = C.dough2;
  c.beginPath();
  c.ellipse(8, 6, 7, 4.5, 0.4, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 0, 17, 0.5, 2.5);
}

function doughStr(c: Ctx, withShadow = true) {
  drawOutlined(c, circle(c, 0, 0, 28), C.doughEdge, { lw: 2.5, shadow: withShadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = radial(c, 0, 0, 23, '#FFF1D0', C.dough2);
  c.beginPath();
  c.arc(0, 0, 22.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(160,110,50,0.35)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 22.5, 0, Math.PI * 2);
  c.stroke();
  const rnd = rng(11);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc((rnd() - 0.5) * 34, (rnd() - 0.5) * 34, 1.6 + rnd() * 1.2, 0, Math.PI * 2);
    c.fill();
  }
  shine(c, 0, 0, 24, 0.5, 2.5);
}

function tomato(c: Ctx) {
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.ellipse(0, 3, 20, 18, 0, 0, Math.PI * 2);
    },
    radial(c, 0, 2, 20, '#FF6A57', C.tomato2),
    { lw: 2.5, shadow: [2, 22, 18, 5] },
  );
  c.fillStyle = C.tomato;
  c.beginPath();
  c.ellipse(1, 5, 15, 12, 0, 0, Math.PI * 2);
  c.globalAlpha = 0.45;
  c.fill();
  c.globalAlpha = 1;
  // calyx
  drawOutlined(c, () => star(c, 0, -13, 10, 4.5, 5), C.basil, { lw: 2 });
  c.fillStyle = C.basil2;
  c.beginPath();
  c.arc(0, -13, 2.2, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 3, 14, 0.55, 3);
}

function slice(c: Ctx, x: number, y: number, r: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  drawOutlined(c, circle(c, 0, 0, r), C.tomato2, { lw: 2 });
  c.fillStyle = C.tomato;
  c.beginPath();
  c.arc(0, 0, r - 2.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#FF7B6B';
  c.beginPath();
  c.arc(0, 0, r - 4.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(181,40,31,0.45)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (r - 4.5), Math.sin(a) * (r - 4.5));
    c.stroke();
  }
  c.fillStyle = '#FFE3A0';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    c.beginPath();
    c.ellipse(Math.cos(a) * 4.8, Math.sin(a) * 4.8, 1.7, 1.1, a, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
function tomatoCut(c: Ctx) {
  contactShadow(c, 0, 22, 22, 5);
  slice(c, -10, 6, 12, 0.3);
  slice(c, 10, 8, 12, -0.4);
  slice(c, 0, -8, 13, 0.1);
}

// Marinara: dough and tomato sauce. With cheese (Margarita) it also gets the cream mozzarella blobs.
export function pizzaRaw(c: Ctx, shadow = true, cheese = false) {
  doughStr(c, shadow);
  c.fillStyle = '#D7362A';
  blob(c, 0, 0, 21.5, 12, 1.5, 5);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.ellipse(-7, -8, 9, 5, -0.6, 0, Math.PI * 2);
  c.fill();
  const rnd = rng(29);
  if (cheese) {
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2,
        d = rnd() * 14;
      drawOutlined(c, ellipse(c, Math.cos(a) * d, Math.sin(a) * d, 4.6, 3.6, rnd() * 3), '#FFF3C4', { lw: 1.4 });
    }
  } else {
    c.fillStyle = 'rgba(255,170,150,0.5)';
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2,
        d = rnd() * 14;
      c.beginPath();
      c.arc(Math.cos(a) * d, Math.sin(a) * d, 1.7, 0, Math.PI * 2);
      c.fill();
    }
  }
}

// Marinara bakes red with basil; the Margarita adds the molten cheese layer on top.
export function pizzaDone(c: Ctx, shadow = true, cheese = false) {
  drawOutlined(c, () => blob(c, 0, 0, 28, 14, 1, 3), C.crust, { lw: 2.5, shadow: shadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = mix(C.crust, '#FFFFFF', 0.25);
  c.beginPath();
  c.ellipse(-12, -14, 10, 4, -0.7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = C.tomato;
  blob(c, 0, 0, 23, 12, 1, 8);
  c.fill();
  const rnd = rng(17);
  if (cheese) {
    c.fillStyle = radial(c, 0, 0, 21, '#FFE46A', C.cheese);
    blob(c, 0, 0, 20.5, 11, 1.6, 4);
    c.fill();
    c.fillStyle = '#F2B33D';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd(),
        d = 6 + rnd() * 9;
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 3.6, 2.8, rnd() * 3, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    c.fillStyle = C.tomato2;
    c.globalAlpha = 0.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd(),
        d = 5 + rnd() * 12;
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 4, 2.6, rnd() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.ellipse(-6, -5, 9, 4, -0.5, 0, Math.PI * 2);
    c.fill();
  }
  for (const [x, y, rot] of [
    [-8, -4, 0.6],
    [7, -9, -0.5],
    [3, 9, 0.2],
  ] as const) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    drawOutlined(c, ellipse(c, 0, 0, 5.6, 3.4), C.basil, { lw: 1.6 });
    c.strokeStyle = C.basil2;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-4, 0);
    c.lineTo(4, 0);
    c.stroke();
    c.restore();
  }
  shine(c, 0, 0, 25, 0.45, 2.5);
}

function pizzaBurnt(c: Ctx, shadow = true) {
  drawOutlined(c, () => blob(c, 0, 0, 28, 14, 1, 3), C.burnt, { lw: 2.5, shadow: shadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = C.burnt2;
  blob(c, 0, 0, 22, 12, 1.5, 8);
  c.fill();
  // charred patches, a few embers still glowing in the cracks, and the cracks themselves
  c.fillStyle = '#1B1210';
  for (const [x, y, rx, ry] of [
    [-9, -5, 7, 4.5],
    [8, 6, 8, 5],
    [3, -11, 5, 3.4],
    [-6, 10, 5.5, 3.4],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = C.ink;
  c.lineWidth = 2;
  for (const [a, b, d, e] of [
    [-14, -6, -2, 2],
    [-4, 10, 8, 2],
    [4, -12, 12, -2],
  ] as const) {
    c.beginPath();
    c.moveTo(a, b);
    c.lineTo(d, e);
    c.lineTo(d + 4, e + 8);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,120,40,0.85)';
  c.lineWidth = 1.2;
  for (const [a, b, d, e] of [
    [-2, 2, 8, 2],
    [8, 2, 12, 10],
  ] as const) {
    c.beginPath();
    c.moveTo(a, b);
    c.lineTo(d, e);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath();
  c.ellipse(-6, -8, 8, 3, -0.5, 0, Math.PI * 2);
  c.fill();
}

export function tray(c: Ctx) {
  // round peel: handle first so the disc covers its root
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.roundRect(-5, 20, 10, 22, 4);
    },
    C.wood2,
    { lw: 2.5 },
  );
  contactShadow(c, 2, 30, 30, 6);
  const g = c.createLinearGradient(-24, -28, 24, 28);
  g.addColorStop(0, '#E4ECF0');
  g.addColorStop(1, C.steel2);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 32, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = C.ink;
  c.stroke();
  c.strokeStyle = 'rgba(43,27,23,0.35)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 26, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = shade(C.steel, 0.35);
  c.beginPath();
  c.arc(0, 0, 25, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 0, 28, 0.6, 3);
}

// A used plate: the same tray with sauce smears, crumbs and a crust left behind.
function trayDirty(c: Ctx) {
  tray(c);
  const rnd = rng(53);
  c.fillStyle = 'rgba(181,40,31,0.75)';
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse((rnd() - 0.5) * 30, (rnd() - 0.5) * 26, 5 + rnd() * 5, 3 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,200,60,0.85)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc((rnd() - 0.5) * 36, (rnd() - 0.5) * 32, 1.4 + rnd() * 1.4, 0, Math.PI * 2);
    c.fill();
  }
  drawOutlined(c, () => blob(c, 9, -8, 6, 6, 1.2, 9), C.crust, { lw: 1.8 });
}

function dish(c: Ctx, cheese = false) {
  tray(c);
  c.save();
  c.scale(0.82, 0.82);
  pizzaDone(c, false, cheese);
  c.restore();
}

// A burnt pizza on its tray (what a chef carries to the bin).
function dishBurnt(c: Ctx) {
  tray(c);
  c.save();
  c.scale(0.82, 0.82);
  pizzaBurnt(c, false);
  c.restore();
}

// Cheese: a yellow wedge with holes (raw) and a mound of shreds (grated on the board).
function cheeseRaw(c: Ctx) {
  contactShadow(c, 2, 20, 26, 5);
  const front = () => {
    c.beginPath();
    c.moveTo(-26, 14);
    c.lineTo(26, 14);
    c.lineTo(26, -4);
    c.closePath();
  };
  const top = () => {
    c.beginPath();
    c.moveTo(-26, 14);
    c.lineTo(26, -4);
    c.lineTo(26, -14);
    c.lineTo(-26, 4);
    c.closePath();
  };
  drawOutlined(c, top, '#FFE87A', { lw: 2.5 });
  drawOutlined(c, front, vgrad(c, -4, 14, '#FFD23F', C.cheese2), { lw: 2.5 });
  c.fillStyle = '#C98A1B';
  for (const [x, y, r] of [
    [8, 9, 2.6],
    [17, 5, 2],
    [-6, 11, 2.2],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#E3B22A';
  for (const [x, y, r] of [
    [2, -2, 2.4],
    [14, -8, 2],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.7, -0.4, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-20, 7);
  c.lineTo(20, -7);
  c.stroke();
}
function cheeseCut(c: Ctx) {
  contactShadow(c, 0, 18, 24, 5);
  // a loose pile of yellow shreds: every strand is an ink-outlined curve, back ones first
  const rnd = rng(41);
  const strands: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.05 + 0.9 * rnd()),
      r = Math.sqrt(rnd());
    strands.push([Math.cos(a) * 22 * r, 14 - Math.sin(a) * 18 * r, (rnd() - 0.5) * 2.4, rnd()]);
  }
  strands.sort((p, q) => p[1] - q[1]);
  c.lineCap = 'round';
  for (const pass of [0, 1])
    for (const [x, y, rot, t] of strands) {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.strokeStyle = pass === 0 ? C.ink : t > 0.6 ? '#FFF1A8' : t > 0.25 ? C.cheese : '#F2B33D';
      c.lineWidth = pass === 0 ? 4.6 : 2.4;
      c.beginPath();
      c.moveTo(-6, 0);
      c.quadraticCurveTo(0, -3.5 * (t > 0.5 ? 1 : -1), 6, 0);
      c.stroke();
      c.restore();
    }
}

function box(c: Ctx) {
  contactShadow(c, 2, 28, 30, 6);
  const g = c.createLinearGradient(0, -30, 0, 30);
  g.addColorStop(0, '#F1D6AE');
  g.addColorStop(1, C.cardboard);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-30, -30, 60, 60, 5);
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = C.ink;
  c.stroke();
  c.strokeStyle = C.cardboard2;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-30, -18);
  c.lineTo(30, -18);
  c.stroke();
  drawOutlined(c, circle(c, 0, 4, 14), C.tomato, { lw: 2 });
  c.fillStyle = C.cream;
  c.font = '800 18px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('P', 0, 5);
}

// Sabotage: the banana-skin that makes chefs slip (yellow, three petals around a core, brown tips), and the black bag that is thrown.
function peel(c: Ctx) {
  contactShadow(c, 2, 18, 34, 7);
  // a banana skin laid on the floor: the curved skin with its brown stalk, and the two flaps that peeled off and fell open
  c.save();
  c.rotate(-0.12);
  const flap = (x: number, y: number, rot: number, len: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, -8);
        c.bezierCurveTo(len * 0.4, -16, len * 0.9, -12, len, 0);
        c.bezierCurveTo(len * 0.8, 14, len * 0.3, 14, 0, 8);
        c.closePath();
      },
      vgrad(c, -14, 14, '#FFEE70', '#F2B51E'),
      { lw: 2.8 },
    );
    c.strokeStyle = 'rgba(190,120,10,0.5)';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(6, 0);
    c.quadraticCurveTo(len * 0.5, -3, len * 0.85, 1);
    c.stroke();
    c.restore();
  };
  flap(8, 2, 0.95, 34);
  flap(8, 2, 2.2, 31);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-40, 4);
      c.quadraticCurveTo(-28, -22, 8, -14);
      c.quadraticCurveTo(34, -8, 40, 8);
      c.quadraticCurveTo(14, -2, -6, 4);
      c.quadraticCurveTo(-24, 14, -40, 4);
      c.closePath();
    },
    vgrad(c, -22, 14, '#FFF07C', '#F5B91F'),
    { lw: 3 },
  );
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-40, 4);
      c.quadraticCurveTo(-48, 2, -50, -6);
      c.lineTo(-44, -8);
      c.quadraticCurveTo(-42, -2, -35, 0);
      c.closePath();
    },
    '#6B3F1A',
    { lw: 2.4 },
  );
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-26, -6);
  c.quadraticCurveTo(-10, -15, 6, -11);
  c.stroke();
  c.fillStyle = '#7A4A1E';
  for (const [x, y] of [
    [-8, -4],
    [12, -3],
    [22, 0],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, 1.9, 1.3, 0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
function bag(c: Ctx) {
  contactShadow(c, 1, 26, 26, 6);
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-8, -18);
      c.bezierCurveTo(-30, -12, -34, 18, -16, 26);
      c.quadraticCurveTo(0, 31, 16, 26);
      c.bezierCurveTo(34, 18, 30, -12, 8, -18);
      c.closePath();
    },
    vgrad(c, -18, 28, '#4A4F5C', '#1D2029'),
    { lw: 3 },
  );
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(-8, -18);
      c.quadraticCurveTo(-18, -30, -9, -34);
      c.quadraticCurveTo(-3, -26, 0, -22);
      c.quadraticCurveTo(3, -26, 9, -34);
      c.quadraticCurveTo(18, -30, 8, -18);
      c.closePath();
    },
    '#2A2E39',
    { lw: 2.5 },
  );
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-20, -2);
  c.quadraticCurveTo(-24, 8, -17, 16);
  c.stroke();
  c.fillStyle = '#7FBF3A';
  c.beginPath();
  c.ellipse(8, 6, 6, 4, 0.5, 0, Math.PI * 2);
  c.fill();
}

const DRAW: Record<Exclude<FoodKind, RecipeFoodKind>, (c: Ctx) => void> = {
  dough_raw: doughRaw,
  dough_str: (c) => doughStr(c),
  tomato,
  tomato_cut: tomatoCut,
  cheese_raw: cheeseRaw,
  cheese_cut: cheeseCut,
  pizza_raw: (c) => pizzaRaw(c),
  pizza_raw_q: (c) => pizzaRaw(c, true, true),
  pizza_done: (c) => pizzaDone(c),
  pizza_done_q: (c) => pizzaDone(c, true, true),
  pizza_burnt: (c) => pizzaBurnt(c),
  tray,
  tray_dirty: trayDirty,
  dish: (c) => dish(c),
  dish_q: (c) => dish(c, true),
  dish_burnt: dishBurnt,
  box,
  peel,
  bag,
};
// the extra kinds are built on first use (they draw with the base pizza and tray of this file, which are all defined by then)
let extra: Record<RecipeFoodKind, (c: Ctx) => void> | null = null;
const drawerOf = (k: FoodKind): ((c: Ctx) => void) =>
  k in DRAW ? DRAW[k as keyof typeof DRAW] : (extra ??= extraDraw({ pizzaRaw, pizzaDone, tray }))[k as RecipeFoodKind];
export const drawFood = (c: Ctx, k: FoodKind) => drawerOf(k)(c);

export function buildFoodTextures(scene: Phaser.Scene) {
  const kinds = [...Object.keys(DRAW), ...Object.keys(extraDraw({ pizzaRaw, pizzaDone, tray }))] as FoodKind[];
  for (const k of kinds) makeTex(scene, foodKey(k), { w: 84, h: 92, oy: 40 }, drawerOf(k));
}
