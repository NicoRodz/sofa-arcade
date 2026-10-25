// Redrawn geometry of things that move on their own: enemies, pickaxes, lanterns, sinkers, geysers.
import { redraw, type Sprite } from './sprite';
import { TILE } from '../../../index';
import type { EntityView } from '../view';

// Escarabajo: red-brown dome with six legs that shuffle; stunned = grey, eyes crossed and three stars circling over it.
export function drawEnemy(sp: Sprite, e: EntityView, clock: number) {
  const t = clock,
    shuffle = e.on ? 0 : Math.floor(t * 8) % 2,
    spin = e.on ? Math.floor(t * 12) : 0;
  const g = redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${e.on}|${e.value}|${shuffle}|${spin}`);
  if (!g) return;
  const cx = e.x + e.w / 2,
    base = e.y + e.h,
    f = e.value > 0.5 ? 1 : -1;
  const body = e.on ? 0x9aa7b0 : 0xc0562f,
    shade = e.on ? 0x77848d : 0x8f3a1e;
  g.lineStyle(3, 0x2b1b17, 1);
  for (let i = 0; i < 3; i++) {
    const lx = cx - 13 + i * 13,
      sw = shuffle ^ (i & 1) ? 4 : -4;
    g.lineBetween(lx, base - 9, lx + sw, base);
  }
  g.fillStyle(0x2b1b17, 1);
  g.fillEllipse(cx, base - 13, e.w + 4, 28);
  g.fillStyle(body, 1);
  g.fillEllipse(cx, base - 14, e.w - 2, 24);
  g.fillStyle(shade, 1);
  g.fillEllipse(cx - f * 4, base - 11, e.w - 14, 12);
  g.lineStyle(2, 0x2b1b17, 0.8);
  g.lineBetween(cx - f * 2, base - 26, cx - f * 2, base - 3);
  g.fillStyle(0xffffff, 0.45);
  g.fillEllipse(cx + f * 6, base - 22, 10, 4);
  const hx = cx + f * (e.w / 2 - 3),
    hy = base - 15;
  g.fillStyle(0x2b1b17, 1);
  g.fillCircle(hx, hy, 9);
  g.fillStyle(body, 1);
  g.fillCircle(hx, hy, 7);
  if (e.on) {
    g.lineStyle(2, 0x2b1b17, 1);
    g.lineBetween(hx - 3, hy - 3, hx + 3, hy + 3);
    g.lineBetween(hx - 3, hy + 3, hx + 3, hy - 3);
    for (let k = 0; k < 3; k++) {
      const a = t * 5 + k * 2.1;
      g.fillStyle(0xffd23f, 1);
      g.fillCircle(cx + Math.cos(a) * 14, base - 36 + Math.sin(a) * 4, 3);
    }
  } else {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(hx + f * 2, hy - 1, 3);
    g.fillStyle(0x2b1b17, 1);
    g.fillCircle(hx + f * 3, hy - 1, 1.6);
  }
}
// Piolet: a pick with a steel crescent head; on the floor it bobs with a halo, in a player's hands it is smaller and sits over the head.
export function drawPickaxe(sp: Sprite, e: EntityView, clock: number) {
  const bob = e.on ? 0 : Math.round(Math.sin(clock * 3.4 + e.x) * 3),
    k = e.on ? 0.75 : 1;
  const g = redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${bob}|${e.on}`);
  if (!g) return;
  const cx = e.x + e.w / 2,
    cy = e.y + e.h / 2 + bob;
  if (!e.on) {
    g.fillStyle(0xc8f0ff, 0.35);
    g.fillCircle(cx, cy, 20);
  }
  g.lineStyle(8 * k, 0x2b1b17, 1);
  g.lineBetween(cx - 12 * k, cy + 15 * k, cx + 9 * k, cy - 11 * k);
  g.lineStyle(4.5 * k, 0xb57a3a, 1);
  g.lineBetween(cx - 12 * k, cy + 15 * k, cx + 9 * k, cy - 11 * k);
  g.lineStyle(9 * k, 0x2b1b17, 1);
  g.beginPath();
  g.moveTo(cx - 8 * k, cy - 16 * k);
  g.lineTo(cx + 8 * k, cy - 18 * k);
  g.lineTo(cx + 22 * k, cy - 6 * k);
  g.strokePath();
  g.lineStyle(5 * k, 0xcfe9f5, 1);
  g.beginPath();
  g.moveTo(cx - 8 * k, cy - 16 * k);
  g.lineTo(cx + 8 * k, cy - 18 * k);
  g.lineTo(cx + 22 * k, cy - 6 * k);
  g.strokePath();
}

// ---- campaign A6 (dynamics 10 and 12): Graphics only, redrawn when their signature changes
// Farol: a brass lantern with a warm glass; on the floor it bobs with a big halo, in a player's hands it is smaller and sits over the head.
export function drawLantern(sp: Sprite, e: EntityView, clock: number) {
  const bob = e.on ? 0 : Math.round(Math.sin(clock * 3 + e.x) * 3),
    k = e.on ? 0.8 : 1,
    fl = Math.round((0.5 + 0.5 * Math.sin(clock * 9 + e.x)) * 3);
  const g = redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${bob}|${e.on}|${fl}`);
  if (!g) return;
  const cx = e.x + e.w / 2,
    cy = e.y + e.h / 2 + bob;
  g.fillStyle(0xffd27a, 0.18 + fl * 0.03);
  g.fillCircle(cx, cy, 30 * k);
  g.lineStyle(4, 0x2b1b17, 1);
  g.beginPath();
  g.arc(cx, cy - 16 * k, 8 * k, Math.PI, 0, false);
  g.strokePath(); // handle
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(cx - 12 * k, cy - 16 * k, 24 * k, 7 * k, 3);
  g.fillRoundedRect(cx - 12 * k, cy + 10 * k, 24 * k, 7 * k, 3);
  g.fillStyle(0xc98a2b, 1);
  g.fillRoundedRect(cx - 10 * k, cy - 15 * k, 20 * k, 5 * k, 2);
  g.fillRoundedRect(cx - 10 * k, cy + 11 * k, 20 * k, 5 * k, 2);
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(cx - 11 * k, cy - 10 * k, 22 * k, 21 * k, 5);
  g.fillStyle(0xfff0b0, 1);
  g.fillRoundedRect(cx - 8.5 * k, cy - 8 * k, 17 * k, 17 * k, 4);
  g.fillStyle(0xffb62e, 1);
  g.fillCircle(cx, cy + 2 * k, (4.5 + fl * 0.5) * k);
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(cx - 6 * k, cy - 6 * k, 2.4 * k, 9 * k);
}
// Roca hundible: a grey slab with a darker underside and waterline streaks; it darkens and drips as it sinks.
export function drawSinker(sp: Sprite, e: EntityView) {
  const sink = Math.round(e.value * 8) / 8;
  const g = redraw(sp, `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${e.w}|${sink}`);
  if (!g) return;
  const th = 22,
    top =
      (Math.round(0x9a + (0x6f - 0x9a) * sink) << 16) |
      (Math.round(0xa3 + (0x77 - 0xa3) * sink) << 8) |
      Math.round(0xa8 + (0x7c - 0xa8) * sink);
  g.fillStyle(0x2b1b17, 1);
  g.fillRoundedRect(e.x - 2, e.y - 2, e.w + 4, th + 4, 9);
  g.fillStyle(top, 1);
  g.fillRoundedRect(e.x + 1, e.y + 1, e.w - 2, th - 2, 8);
  g.fillStyle(0x59636b, 1);
  g.fillRoundedRect(e.x + 6, e.y + th - 9, e.w - 12, 6, 3);
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(e.x + 10, e.y + 4, e.w - 26, 3);
  g.lineStyle(2, 0x3a4147, 0.8);
  for (let x = e.x + 18; x < e.x + e.w - 6; x += 26) g.lineBetween(x, e.y + 8, x + 5, e.y + th - 4);
  if (sink > 0) {
    g.fillStyle(0x9be0ff, 0.65);
    for (let i = 0; i < 3; i++) g.fillCircle(e.x + 12 + (i * (e.w - 24)) / 2, e.y - 4 - (i % 2) * 4, 3);
  } // spray while it goes down
}
// Geiser: a stone mouth in the floor. Calm: a faint ring; bubbling (value 0.5): bubbles climb; erupting (value 1): a water column with spray.
export function drawGeyser(sp: Sprite, e: EntityView, clock: number) {
  const ph = e.value >= 1 ? 2 : e.value > 0 ? 1 : 0,
    tt = Math.floor(clock * 12);
  const g = redraw(sp, `${e.x}|${e.y}|${ph}|${ph ? tt : 0}`);
  if (!g) return;
  const cx = e.x + e.w / 2,
    base = e.y + e.h,
    w = e.w;
  g.fillStyle(0x2b1b17, 1);
  g.fillEllipse(cx, base - 3, w + 10, 20);
  g.fillStyle(0x59636b, 1);
  g.fillEllipse(cx, base - 4, w + 2, 15);
  g.fillStyle(0x1d2a33, 1);
  g.fillEllipse(cx, base - 5, w - 12, 9);
  g.fillStyle(ph === 2 ? 0xdff6ff : 0x6fb3d6, 1);
  g.fillEllipse(cx, base - 5, w - 20, 5);
  if (ph === 1)
    for (let i = 0; i < 5; i++) {
      const u = (tt * 0.13 + i * 0.21) % 1,
        bx = cx + Math.sin(i * 2.3 + tt * 0.3) * (w / 3);
      g.fillStyle(0xbfe9ff, 0.85 * (1 - u));
      g.fillCircle(bx, base - 8 - u * 46, 3 + (i % 2) * 1.5);
    }
  if (ph === 2) {
    const h = 2.6 * TILE;
    g.fillStyle(0x9be0ff, 0.8);
    g.fillRoundedRect(cx - 19, base - h, 38, h - 4, 15);
    g.fillStyle(0xffffff, 0.75);
    g.fillRoundedRect(cx - 8, base - h + 4, 10, h - 14, 5);
    for (let i = 0; i < 7; i++) {
      const a = (tt * 0.37 + i * 0.9) % 1;
      g.fillStyle(0xdff6ff, 1 - a);
      g.fillCircle(cx + (i % 2 ? 1 : -1) * (12 + a * 26), base - h + 10 + a * 34, 4 - a * 2);
    }
  }
}
