// Manchazo's card in the game menu: a cream-tiled floor with an orange dotted diamond and a blue striped diamond of paint, a tempera pot with a lit fuse on each,
// two chefs and a splash of paint in the middle. Same size and 2x canvas as the other cards; procedural (no external assets).
import { C, circle, drawOutlined, rr, shade, star, type Ctx } from '@pichi/screen-kit/art';
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { A } from './palette';

const ART_W = 380,
  ART_H = 300;

function sunburst(c: Ctx) {
  c.fillStyle = '#7B4FC9';
  c.fillRect(0, 0, ART_W, ART_H);
  c.fillStyle = '#6A3FB5';
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * Math.PI * 2;
    c.beginPath();
    c.moveTo(ART_W / 2, ART_H * 0.62);
    c.arc(ART_W / 2, ART_H * 0.62, 520, a0, a0 + Math.PI / 18);
    c.closePath();
    c.fill();
  }
  const g = c.createRadialGradient(ART_W / 2, ART_H * 0.62, 20, ART_W / 2, ART_H * 0.62, 300);
  g.addColorStop(0, 'rgba(255,255,255,.2)');
  g.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = g;
  c.fillRect(0, 0, ART_W, ART_H);
}

function floor(c: Ctx) {
  const y0 = 150,
    s = 38;
  for (let j = 0; y0 + j * s < ART_H; j++)
    for (let i = 0; i * s < ART_W + s; i++) {
      c.fillStyle = (i + j) % 2 ? A.tileA : A.tileB;
      c.fillRect(i * s, y0 + j * s, s, s);
    }
  c.fillStyle = 'rgba(43,27,23,.55)';
  c.fillRect(0, y0 - 3, ART_W, 4);
}

/** A diamond of paint (radius `n` tiles of 38 px around the tile centre (cx, cy)), dotted or striped. */
function diamond(c: Ctx, cx: number, cy: number, n: number, team: 0 | 1) {
  const s = 38;
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      if (Math.abs(i) + Math.abs(j) > n) continue;
      const x = cx + i * s - s / 2,
        y = cy + j * s - s / 2;
      c.fillStyle = team === 0 ? A.orange : A.blue;
      c.fillRect(x, y, s, s);
      c.fillStyle = 'rgba(255,255,255,.6)';
      if (team === 0)
        for (let k = 0; k < 3; k++)
          for (let m = 0; m < 3; m++) {
            circle(c, x + 6 + k * 13, y + 6 + m * 13, 3)();
            c.fill();
          }
      else {
        c.save();
        c.beginPath();
        c.rect(x, y, s, s);
        c.clip();
        c.strokeStyle = 'rgba(255,255,255,.55)';
        c.lineWidth = 4;
        for (let k = -s; k < 2 * s; k += 10) {
          c.beginPath();
          c.moveTo(x + k, y);
          c.lineTo(x + k - s, y + s);
          c.stroke();
        }
        c.restore();
      }
    }
}

function pot(c: Ctx, x: number, y: number, team: 0 | 1, s: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = 'rgba(43,27,23,.3)';
  c.beginPath();
  c.ellipse(0, 24, 26, 7, 0, 0, Math.PI * 2);
  c.fill();
  drawOutlined(c, () => rr(c, -22, -16, 44, 42, 9), team === 0 ? A.orange : A.blue, { lw: 4 });
  c.fillStyle = C.cream;
  c.fillRect(-20, 2, 40, 14);
  c.fillStyle = C.ink;
  c.beginPath();
  c.arc(-7, 9, 2.2, 0, 7);
  c.arc(7, 9, 2.2, 0, 7);
  c.fill();
  drawOutlined(c, () => rr(c, -26, -24, 52, 10, 4), C.ink, { lw: 2 });
  c.strokeStyle = C.ink;
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(0, -24);
  c.quadraticCurveTo(14, -36, 8, -52);
  c.stroke();
  c.strokeStyle = '#E8C9A0';
  c.lineWidth = 3;
  c.stroke();
  drawOutlined(c, () => star(c, 8, -54, 13, 6, 6), C.fire2, { lw: 3 });
  c.restore();
}

// chefCanvas is 120x170 units with the feet at (60, 150): put the feet at (x, y)
const chef = (c: Ctx, slot: number, x: number, y: number, s: number, flip = false) => {
  c.save();
  c.translate(x, y);
  c.scale(flip ? -s : s, s);
  c.drawImage(chefCanvas(slot, 'happy', true), -60, -150, 120, 170);
  c.restore();
};

export function drawManchazoCard(cv: HTMLCanvasElement): void {
  const R = 2;
  cv.width = ART_W * R;
  cv.height = ART_H * R;
  const c = cv.getContext('2d')!;
  c.scale(R, R);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  sunburst(c);
  floor(c);
  diamond(c, 95, 232, 2, 0);
  diamond(c, 285, 232, 2, 1);
  chef(c, 0, 70, 232, 0.95);
  chef(c, 4, 310, 232, 0.95, true);
  pot(c, 150, 236, 0, 0.9);
  pot(c, 232, 236, 1, 0.9);
  for (const [x, y, r, col] of [
    [135, 168, 6, A.orange],
    [118, 192, 4, A.orange],
    [250, 172, 6, A.blue],
    [268, 196, 4, A.blue],
    [190, 160, 5, '#FFFFFF'],
  ] as const) {
    c.fillStyle = col;
    circle(c, x, y, r)();
    c.fill();
  }
  drawOutlined(c, () => star(c, 190, 120, 34, 15, 9), C.cheese, { lw: 4 });
  drawOutlined(c, () => star(c, 190, 120, 17, 8, 9), shade(C.cheese, 0.45), { lw: 3 });
}
