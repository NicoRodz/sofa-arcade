// Menu card illustrations: one procedural painter per game id (same chefs and food as the game itself), plus a fallback
// that tints itself from the id so a game added to the registry gets a card with art before anyone draws it.
import { C, chefOf, circle, drawOutlined, ellipse, rng, shade, star, vgrad, type Ctx } from '@pichi/screen-kit/art';
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { drawFood, type FoodKind } from '../food';
export const ART_W = 380,
  ART_H = 300; // design units; the canvas is drawn at 2x and the card crops it to fit (object-fit: cover)
type Painter = (c: Ctx) => void;

function sunburst(c: Ctx, a: string, b: string, cx = ART_W / 2, cy = ART_H * 0.55, rays = 18) {
  c.fillStyle = a;
  c.fillRect(0, 0, ART_W, ART_H);
  c.fillStyle = b;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2,
      a1 = a0 + Math.PI / rays;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, 520, a0, a1);
    c.closePath();
    c.fill();
  }
  const g = c.createRadialGradient(cx, cy, 20, cx, cy, 300);
  g.addColorStop(0, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = g;
  c.fillRect(0, 0, ART_W, ART_H);
}
const food = (c: Ctx, k: FoodKind, x: number, y: number, s: number, rot = 0) => {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  drawFood(c, k);
  c.restore();
};
// chefCanvas is 120x170 units with the feet at (60, 150): put the feet at (x, y)
const chef = (c: Ctx, slot: number, x: number, y: number, s: number, flip = false) => {
  c.save();
  c.translate(x, y);
  c.scale(flip ? -s : s, s);
  c.drawImage(chefCanvas(slot, 'happy', true), -60, -150, 120, 170);
  c.restore();
};
function ground(c: Ctx, y: number, a: string, b: string, size = 38) {
  for (let i = 0; y + i * size < ART_H; i++)
    for (let j = 0; j * size < ART_W + size; j++) {
      c.fillStyle = (i + j) % 2 ? a : b;
      c.fillRect(j * size, y + i * size, size, size);
    }
  c.fillStyle = 'rgba(43,27,23,.55)';
  c.fillRect(0, y - 3, ART_W, 4);
}
const shadowAt = (c: Ctx, x: number, y: number, rx: number) => {
  c.fillStyle = 'rgba(43,27,23,.28)';
  ellipse(c, x, y, rx, rx * 0.28)();
  c.fill();
};

const PAINTERS: Record<string, Painter> = {
  pizzas(c) {
    sunburst(c, '#E8503F', '#D7392B');
    ground(c, 214, '#FFF4E0', '#E63B2E');
    shadowAt(c, 205, 238, 92);
    food(c, 'pizza_done', 205, 168, 3.1);
    chef(c, 0, 78, 276, 1.05);
    food(c, 'tomato', 322, 70, 1.5, 0.4);
    food(c, 'cheese_cut', 62, 64, 1.3, -0.5);
    food(c, 'dough_raw', 330, 160, 1.2, 0.2);
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (const [x, y, r] of [
      [118, 36, 3],
      [270, 30, 2.4],
      [340, 118, 2.6],
      [36, 140, 2.4],
      [250, 110, 2],
    ] as const) {
      star(c, x, y, r * 2.2, r * 0.9, 4);
      c.fill();
    }
  },
  obstaculos(c) {
    sunburst(c, '#6EC0E8', '#8FD0F0', ART_W / 2, ART_H * 0.5);
    ground(c, 238, '#8DBB5A', '#7DAA4C');
    shadowAt(c, 190, 250, 70);
    chef(c, 1, 190, 256, 0.78);
    chef(c, 2, 190, 206, 0.78);
    chef(c, 3, 190, 156, 0.78); // three explorers, each on the shoulders of the one below
    // goal flag
    c.strokeStyle = C.ink;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(318, 238);
    c.lineTo(318, 96);
    c.stroke();
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(318, 100);
        c.lineTo(364, 116);
        c.lineTo(318, 134);
        c.closePath();
      },
      C.tomato,
      { lw: 4 },
    );
    // spikes
    for (const x of [70, 106, 142])
      drawOutlined(
        c,
        () => {
          c.beginPath();
          c.moveTo(x - 16, 240);
          c.lineTo(x, 202);
          c.lineTo(x + 16, 240);
          c.closePath();
        },
        C.steel,
        { lw: 4 },
      );
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [x, y, r] of [
      [60, 60, 22],
      [100, 52, 28],
      [140, 62, 20],
      [270, 40, 24],
      [308, 50, 18],
    ] as const) {
      circle(c, x, y, r)();
      c.fill();
    }
  },
  arena(c) {
    sunburst(c, '#7B4FC9', '#6A3FB5', ART_W / 2, ART_H * 0.62);
    // lava below the platform
    c.fillStyle = vgrad(c, 230, ART_H, '#FF8A1F', '#E63B2E');
    c.fillRect(0, 232, ART_W, ART_H - 232);
    c.fillStyle = C.fire2;
    for (const x of [30, 120, 250, 340]) {
      circle(c, x, 262, 9)();
      c.fill();
    }
    drawOutlined(c, ellipse(c, 190, 214, 150, 42), '#E6B980', { lw: 5 });
    drawOutlined(c, ellipse(c, 190, 204, 150, 42), '#F1CF9C', { lw: 5 });
    c.strokeStyle = 'rgba(43,27,23,.25)';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(190, 204, 96, 26, 0, 0, Math.PI * 2);
    c.stroke();
    chef(c, 4, 132, 214, 0.95);
    chef(c, 5, 252, 214, 0.95, true);
    // push marks
    c.strokeStyle = C.cream;
    c.lineWidth = 6;
    c.lineCap = 'round';
    for (const [x0, x1, y] of [
      [170, 150, 128],
      [210, 232, 128],
      [172, 156, 148],
      [208, 224, 148],
    ] as const) {
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
    }
    drawOutlined(c, () => star(c, 190, 120, 26, 12, 8), C.cheese, { lw: 4 });
  },
};

// Unknown id: a sunburst in a colour taken from the id, a chef and a star. Same id, same card, every time.
function fallback(id: string): Painter {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360,
    r = rng(h || 1);
  return (c) => {
    sunburst(c, `hsl(${hue} 62% 52%)`, `hsl(${hue} 62% 44%)`);
    ground(c, 238, `hsl(${hue} 40% 85%)`, `hsl(${hue} 40% 74%)`);
    shadowAt(c, 190, 254, 60);
    chef(c, h % 8, 190, 262, 1.05);
    for (let i = 0; i < 5; i++) {
      drawOutlined(c, () => star(c, 40 + r() * 300, 30 + r() * 120, 12, 5), shade(chefOf(h + i).color, 0.1), { lw: 3 });
    }
  };
}

export function drawCardArt(cv: HTMLCanvasElement, id: string) {
  const R = 2;
  cv.width = ART_W * R;
  cv.height = ART_H * R;
  const c = cv.getContext('2d')!;
  c.scale(R, R);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  (PAINTERS[id] ?? fallback(id))(c);
}
