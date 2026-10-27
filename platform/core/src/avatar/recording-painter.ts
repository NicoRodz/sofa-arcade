import type { PaintGradient, Painter } from './painter';

/** Test double: logs every call as `name(args)` with numbers rounded to 3 decimals and style writes as `name=value`. */
export class RecordingPainter implements Painter {
  readonly log: string[] = [];
  private st = {
    fillStyle: '' as string | PaintGradient,
    strokeStyle: '' as string | PaintGradient,
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  private rec(name: string, args: unknown[]) {
    this.log.push(`${name}(${args.map((a) => (typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : String(a))).join(',')})`);
  }
  private style(name: string, v: unknown) {
    this.log.push(`${name}=${typeof v === 'object' ? 'gradient' : String(v)}`);
  }
  get fillStyle() {
    return this.st.fillStyle;
  }
  set fillStyle(v) {
    this.st.fillStyle = v;
    this.style('fillStyle', v);
  }
  get strokeStyle() {
    return this.st.strokeStyle;
  }
  set strokeStyle(v) {
    this.st.strokeStyle = v;
    this.style('strokeStyle', v);
  }
  get lineWidth() {
    return this.st.lineWidth;
  }
  set lineWidth(v) {
    this.st.lineWidth = v;
    this.style('lineWidth', v);
  }
  get globalAlpha() {
    return this.st.globalAlpha;
  }
  set globalAlpha(v) {
    this.st.globalAlpha = v;
    this.style('globalAlpha', v);
  }
  get lineCap() {
    return this.st.lineCap as 'round';
  }
  set lineCap(v) {
    this.st.lineCap = v;
    this.style('lineCap', v);
  }
  get lineJoin() {
    return this.st.lineJoin as 'round';
  }
  set lineJoin(v) {
    this.st.lineJoin = v;
    this.style('lineJoin', v);
  }
  save = () => this.rec('save', []);
  restore = () => this.rec('restore', []);
  translate = (...a: [number, number]) => this.rec('translate', a);
  rotate = (...a: [number]) => this.rec('rotate', a);
  scale = (...a: [number, number]) => this.rec('scale', a);
  beginPath = () => this.rec('beginPath', []);
  closePath = () => this.rec('closePath', []);
  moveTo = (...a: [number, number]) => this.rec('moveTo', a);
  lineTo = (...a: [number, number]) => this.rec('lineTo', a);
  arc = (...a: [number, number, number, number, number, boolean?]) => this.rec('arc', a);
  arcTo = (...a: [number, number, number, number, number]) => this.rec('arcTo', a);
  ellipse = (...a: [number, number, number, number, number, number, number, boolean?]) => this.rec('ellipse', a);
  quadraticCurveTo = (...a: [number, number, number, number]) => this.rec('quadraticCurveTo', a);
  bezierCurveTo = (...a: [number, number, number, number, number, number]) => this.rec('bezierCurveTo', a);
  rect = (...a: [number, number, number, number]) => this.rec('rect', a);
  fillRect = (...a: [number, number, number, number]) => this.rec('fillRect', a);
  fill = () => this.rec('fill', []);
  stroke = () => this.rec('stroke', []);
  clip = () => this.rec('clip', []);
  createLinearGradient(...a: [number, number, number, number]): PaintGradient {
    this.rec('createLinearGradient', a);
    return { addColorStop: (o, c) => this.rec('addColorStop', [o, c]) };
  }
  createRadialGradient(...a: [number, number, number, number, number, number]): PaintGradient {
    this.rec('createRadialGradient', a);
    return { addColorStop: (o, c) => this.rec('addColorStop', [o, c]) };
  }
}
