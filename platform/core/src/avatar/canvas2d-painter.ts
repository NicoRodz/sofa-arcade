import type { PaintGradient, PaintStyle, Painter } from './painter';

/** Structural slice of CanvasRenderingContext2D, so this file needs no DOM types. */
export interface Canvas2DLike {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'bevel' | 'round' | 'miter';
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): PaintGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): PaintGradient;
}

/** Passthrough adapter: every call lands on the 2D context unchanged, so the pixels are the ones chefdraw always drew. */
export class Canvas2DPainter implements Painter {
  constructor(readonly ctx: Canvas2DLike) {}
  get fillStyle(): PaintStyle {
    return this.ctx.fillStyle as PaintStyle;
  }
  set fillStyle(v: PaintStyle) {
    this.ctx.fillStyle = v;
  }
  get strokeStyle(): PaintStyle {
    return this.ctx.strokeStyle as PaintStyle;
  }
  set strokeStyle(v: PaintStyle) {
    this.ctx.strokeStyle = v;
  }
  get lineWidth() {
    return this.ctx.lineWidth;
  }
  set lineWidth(v: number) {
    this.ctx.lineWidth = v;
  }
  get globalAlpha() {
    return this.ctx.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.ctx.globalAlpha = v;
  }
  get lineCap() {
    return this.ctx.lineCap;
  }
  set lineCap(v: 'butt' | 'round' | 'square') {
    this.ctx.lineCap = v;
  }
  get lineJoin() {
    return this.ctx.lineJoin;
  }
  set lineJoin(v: 'bevel' | 'round' | 'miter') {
    this.ctx.lineJoin = v;
  }
  save() {
    this.ctx.save();
  }
  restore() {
    this.ctx.restore();
  }
  translate(x: number, y: number) {
    this.ctx.translate(x, y);
  }
  rotate(rad: number) {
    this.ctx.rotate(rad);
  }
  scale(x: number, y: number) {
    this.ctx.scale(x, y);
  }
  beginPath() {
    this.ctx.beginPath();
  }
  closePath() {
    this.ctx.closePath();
  }
  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) {
    this.ctx.arc(x, y, r, a0, a1, ccw);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    this.ctx.arcTo(x1, y1, x2, y2, r);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean) {
    this.ctx.ellipse(x, y, rx, ry, rot, a0, a1, ccw);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.ctx.quadraticCurveTo(cx, cy, x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this.ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.ctx.rect(x, y, w, h);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.ctx.fillRect(x, y, w, h);
  }
  fill() {
    this.ctx.fill();
  }
  stroke() {
    this.ctx.stroke();
  }
  clip() {
    this.ctx.clip();
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    return this.ctx.createLinearGradient(x0, y0, x1, y1);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }
}
