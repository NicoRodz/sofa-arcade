import { C, blob, drawOutlined, ellipse, mix, rng, shine, type Ctx } from '@pichi/screen-kit/art';
import { radial, doughStr } from './ingredients';

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

export function pizzaBurnt(c: Ctx, shadow = true) {
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
