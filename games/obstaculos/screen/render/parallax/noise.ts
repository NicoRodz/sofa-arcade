import { lerpColor } from '../biome';
import type { Ctx } from '../tiledraw';

export const lerpHex = (a: string, b: string, t: number): string => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(lerpColor(a, b, t))!;
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
};

export const TW = 1024,
  TH = 512;

export function rngOf(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
// Seamless height profile in [-1, 1]: integer frequencies over the texture width.
export function profile(seed: number, harmonics: number[]) {
  const r = rngOf(seed);
  const parts = harmonics.map((k, i) => ({ k, a: 1 / (1 + i * 0.9), ph: r() * Math.PI * 2 }));
  const norm = parts.reduce((s, p) => s + p.a, 0);
  return (x: number) => parts.reduce((s, p) => s + Math.sin((x / TW) * Math.PI * 2 * p.k + p.ph) * p.a, 0) / norm;
}
export function ground(c: Ctx, f: (x: number) => number, base: number, amp: number, color: string) {
  c.beginPath();
  c.moveTo(0, TH);
  for (let x = 0; x <= TW; x += 8) c.lineTo(x, base + f(x) * amp);
  c.lineTo(TW, TH);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}
export function peaks(
  c: Ctx,
  seed: number,
  n: number,
  baseY: number,
  hMin: number,
  hMax: number,
  wMin: number,
  wMax: number,
  color: string,
  snow?: string,
) {
  const r = rngOf(seed);
  for (let i = 0; i < n; i++) {
    const cx = (i + r() * 0.8) * (TW / n),
      w = wMin + r() * (wMax - wMin),
      h = hMin + r() * (hMax - hMin);
    for (const off of [0, -TW, TW]) {
      // wrap
      const x0 = cx + off;
      if (x0 + w < 0 || x0 - w > TW) continue;
      c.beginPath();
      c.moveTo(x0 - w, baseY + 40);
      c.lineTo(x0 - w * 0.12, baseY - h);
      c.lineTo(x0 + w * 0.2, baseY - h * 0.92);
      c.lineTo(x0 + w, baseY + 40);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      if (snow) {
        c.beginPath();
        c.moveTo(x0 - w * 0.12, baseY - h);
        c.lineTo(x0 + w * 0.2, baseY - h * 0.92);
        c.lineTo(x0 + w * 0.34, baseY - h * 0.66);
        c.lineTo(x0 + w * 0.12, baseY - h * 0.72);
        c.lineTo(x0 - w * 0.02, baseY - h * 0.6);
        c.lineTo(x0 - w * 0.3, baseY - h * 0.66);
        c.closePath();
        c.fillStyle = snow;
        c.fill();
      }
    }
  }
}
export const tree = (c: Ctx, x: number, baseY: number, h: number, w: number, trunk: string, leaf: string) => {
  c.fillStyle = trunk;
  c.fillRect(x - w / 2, baseY - h, w, h + 4);
  c.fillStyle = leaf;
  for (let i = 0; i < 4; i++) {
    const yy = baseY - h * (0.35 + i * 0.2);
    c.beginPath();
    c.moveTo(x - w * (3.4 - i * 0.6), yy + h * 0.14);
    c.lineTo(x, yy - h * 0.2);
    c.lineTo(x + w * (3.4 - i * 0.6), yy + h * 0.14);
    c.closePath();
    c.fill();
  }
};
export const palm = (c: Ctx, x: number, baseY: number, h: number, trunk: string, leaf: string) => {
  c.strokeStyle = trunk;
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, baseY + 6);
  c.quadraticCurveTo(x + h * 0.12, baseY - h * 0.5, x + h * 0.22, baseY - h);
  c.stroke();
  c.strokeStyle = leaf;
  c.lineWidth = 7;
  const tx = x + h * 0.22,
    ty = baseY - h;
  for (const a of [-2.7, -2.1, -1.4, -0.7, -0.1]) {
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(
      tx + Math.cos(a) * h * 0.3,
      ty + Math.sin(a) * h * 0.3 - 10,
      tx + Math.cos(a) * h * 0.5,
      ty + Math.sin(a) * h * 0.5 + 14,
    );
    c.stroke();
  }
};
