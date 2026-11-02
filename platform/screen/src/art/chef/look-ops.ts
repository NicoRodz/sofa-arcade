// A recorded drawing: the avatar parts paint through a Painter, so one pass can be written down as a list of ops and replayed later, as many times
// as needed, choosing for each fill/stroke whether it runs and in which colour. This is what lets the team look split one figure into layers.
import type { PaintStyle, Painter } from '@pichi/core/avatar';

type StyleName = 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'lineCap' | 'lineJoin';
type CallName =
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'arcTo'
  | 'ellipse'
  | 'quadraticCurveTo'
  | 'bezierCurveTo'
  | 'rect'
  | 'clip';
type Arg = number | boolean;

export type PaintOp = { t: 'paint'; name: 'fill' | 'stroke' | 'fillRect'; a: number[]; color: string };
export type Op = { t: 'set'; name: StyleName; v: string | number } | { t: 'call'; name: CallName; a: Arg[] } | PaintOp;

const plain = (s: PaintStyle): string => {
  if (typeof s !== 'string') throw new Error('team look: gradients cannot be split into layers');
  return s;
};

/** A Painter that does not draw: it writes every call down. Gradients are refused (no avatar part uses one). */
export class CommandPainter implements Painter {
  readonly ops: Op[] = [];
  private st = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter' };
  private stack: (typeof this.st)[] = []; // a Canvas 2D context restores its styles on restore(), so the recording must too
  private set(name: StyleName, v: string | number) {
    (this.st as Record<StyleName, string | number>)[name] = v;
    this.ops.push({ t: 'set', name, v });
  }
  private call(name: CallName, a: Arg[]) {
    this.ops.push({ t: 'call', name, a });
  }
  get fillStyle(): PaintStyle {
    return this.st.fillStyle;
  }
  set fillStyle(v: PaintStyle) {
    this.set('fillStyle', plain(v));
  }
  get strokeStyle(): PaintStyle {
    return this.st.strokeStyle;
  }
  set strokeStyle(v: PaintStyle) {
    this.set('strokeStyle', plain(v));
  }
  get lineWidth() {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    this.set('lineWidth', v);
  }
  get globalAlpha() {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.set('globalAlpha', v);
  }
  get lineCap() {
    return this.st.lineCap as 'butt' | 'round' | 'square';
  }
  set lineCap(v: 'butt' | 'round' | 'square') {
    this.set('lineCap', v);
  }
  get lineJoin() {
    return this.st.lineJoin as 'bevel' | 'round' | 'miter';
  }
  set lineJoin(v: 'bevel' | 'round' | 'miter') {
    this.set('lineJoin', v);
  }
  save = () => {
    this.stack.push({ ...this.st });
    this.call('save', []);
  };
  restore = () => {
    this.st = this.stack.pop() ?? this.st;
    this.call('restore', []);
  };
  translate = (x: number, y: number) => this.call('translate', [x, y]);
  rotate = (r: number) => this.call('rotate', [r]);
  scale = (x: number, y: number) => this.call('scale', [x, y]);
  beginPath = () => this.call('beginPath', []);
  closePath = () => this.call('closePath', []);
  moveTo = (x: number, y: number) => this.call('moveTo', [x, y]);
  lineTo = (x: number, y: number) => this.call('lineTo', [x, y]);
  arc = (x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) =>
    this.call('arc', ccw === undefined ? [x, y, r, a0, a1] : [x, y, r, a0, a1, ccw]);
  arcTo = (a: number, b: number, c: number, d: number, r: number) => this.call('arcTo', [a, b, c, d, r]);
  ellipse = (x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean) =>
    this.call('ellipse', ccw === undefined ? [x, y, rx, ry, rot, a0, a1] : [x, y, rx, ry, rot, a0, a1, ccw]);
  quadraticCurveTo = (a: number, b: number, c: number, d: number) => this.call('quadraticCurveTo', [a, b, c, d]);
  bezierCurveTo = (a: number, b: number, c: number, d: number, e: number, f: number) => this.call('bezierCurveTo', [a, b, c, d, e, f]);
  rect = (x: number, y: number, w: number, h: number) => this.call('rect', [x, y, w, h]);
  clip = () => this.call('clip', []);
  fill = () => this.ops.push({ t: 'paint', name: 'fill', a: [], color: plain(this.st.fillStyle) });
  stroke = () => this.ops.push({ t: 'paint', name: 'stroke', a: [], color: plain(this.st.strokeStyle) });
  fillRect = (x: number, y: number, w: number, h: number) =>
    this.ops.push({ t: 'paint', name: 'fillRect', a: [x, y, w, h], color: plain(this.st.fillStyle) });
  createLinearGradient(): never {
    throw new Error('team look: gradients cannot be split into layers');
  }
  createRadialGradient(): never {
    throw new Error('team look: gradients cannot be split into layers');
  }
}

/**
 * Plays the ops back on `p`. State and path ops always run (the transform stack and the current path must stay right); a fill/stroke runs only if
 * `pick(index, op)` returns a colour for it (that colour replaces the recorded one for that one paint) and is skipped on null.
 */
export function replay(ops: readonly Op[], p: Painter, pick: (index: number, op: PaintOp) => string | null): void {
  let cur = { fillStyle: '#000000', strokeStyle: '#000000' };
  const stack: (typeof cur)[] = [];
  ops.forEach((op, i) => {
    if (op.t === 'set') {
      (p as unknown as Record<StyleName, string | number>)[op.name] = op.v;
      if (op.name === 'fillStyle' || op.name === 'strokeStyle') cur[op.name] = op.v as string;
    } else if (op.t === 'call') {
      if (op.name === 'save') stack.push({ ...cur });
      if (op.name === 'restore') cur = stack.pop() ?? cur;
      (p[op.name] as (...a: Arg[]) => void)(...op.a);
    } else {
      const color = pick(i, op);
      if (color === null) return;
      const stroke = op.name === 'stroke';
      const was = stroke ? cur.strokeStyle : cur.fillStyle;
      if (color !== was) {
        if (stroke) p.strokeStyle = color;
        else p.fillStyle = color;
      }
      if (op.name === 'fillRect') p.fillRect(op.a[0]!, op.a[1]!, op.a[2]!, op.a[3]!);
      else p[op.name]();
      if (color !== was) {
        if (stroke) p.strokeStyle = was;
        else p.fillStyle = was;
      }
    }
  });
}
