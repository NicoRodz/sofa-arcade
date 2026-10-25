// Canvas 2D drawing helpers. Textures are drawn once into canvas textures (Graphics.generateTexture goes
// through the same canvas path but ignores gradients), then used as plain images.
import type Phaser from 'phaser';
import { C, U } from './tokens';

export type Ctx = CanvasRenderingContext2D;
export const R = 2; // supersampling: textures are drawn at R px per design unit
export const ART = U / R; // display scale of a texture drawn in design units

export interface TexSpec { w: number; h: number; ox?: number; oy?: number; r?: number }
const specs = new Map<string, Required<TexSpec>>();

// Draws in design units with (0, 0) at the anchor (default: centre).
export function makeTex(scene: Phaser.Scene, key: string, spec: TexSpec, draw: (c: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const s = { ox: spec.w / 2, oy: spec.h / 2, r: R, ...spec };
  specs.set(key, s);
  const tex = scene.textures.createCanvas(key, Math.ceil(s.w * s.r), Math.ceil(s.h * s.r));
  if (!tex) throw new Error(`texture ${key} not created`);
  const c = tex.getContext();
  c.scale(s.r, s.r);
  c.translate(s.ox, s.oy);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  tex.refresh();
}

export function img(scene: Phaser.Scene, key: string, x = 0, y = 0, scale = 1): Phaser.GameObjects.Image {
  const s = specs.get(key);
  if (!s) throw new Error(`unknown texture ${key}`);
  return scene.add.image(x, y, key).setOrigin(s.ox / s.w, s.oy / s.h).setScale((U / s.r) * scale);
}
export const texSize = (key: string) => specs.get(key);

// Offscreen canvas in design units for DOM use (lobby chips, results podium).
export function domCanvas(w: number, h: number, ox: number, oy: number, draw: (c: Ctx) => void, r = 2): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * r); cv.height = Math.ceil(h * r);
  const c = cv.getContext('2d')!;
  c.scale(r, r); c.translate(ox, oy);
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  return cv;
}

export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
// amt in -1..1: toward black (<0) or white (>0)
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const ch = (v: number) => clamp(v + (t - v) * p);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => clamp(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
export function vgrad(c: Ctx, y0: number, y1: number, top: string, bottom: string): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  return g;
}

export function contactShadow(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.18) {
  c.save(); c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.restore();
}

// One white arc, top-left: the single highlight of every object.
export function shine(c: Ctx, cx: number, cy: number, r: number, a = 0.35, lw = 3) {
  c.save(); c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath(); c.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.45); c.stroke(); c.restore();
}

export interface OutlineOpts { lw?: number; stroke?: string; shadow?: [number, number, number, number?] }
// Fill (flat colour or gradient) + ink outline of the current path builder, optionally with a contact shadow.
export function drawOutlined(c: Ctx, build: () => void, fill: string | CanvasGradient, o: OutlineOpts = {}) {
  if (o.shadow) { const [x, y, rx, ry] = o.shadow; contactShadow(c, x, y, rx, ry ?? rx * 0.3); }
  build();
  c.fillStyle = fill; c.fill();
  c.lineWidth = o.lw ?? 3; c.strokeStyle = o.stroke ?? C.ink; c.stroke();
}
export const circle = (c: Ctx, x: number, y: number, r: number) => () => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };
export const ellipse = (c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => () => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
export const rect = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => () => rr(c, x, y, w, h, r);

// Seeded noise for hand-made looking shapes.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function blob(c: Ctx, cx: number, cy: number, r: number, n: number, jitter: number, seed: number) {
  const rnd = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr2 = r + (rnd() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2]);
  }
  c.beginPath();
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
  const m0 = mid(pts[n - 1]!, pts[0]!);
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i]!, pts[(i + 1) % n]!); c.quadraticCurveTo(pts[i]![0], pts[i]![1], m[0], m[1]); }
  c.closePath();
}
export function star(c: Ctx, cx: number, cy: number, ro: number, ri: number, n = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    if (i) c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.closePath();
}
