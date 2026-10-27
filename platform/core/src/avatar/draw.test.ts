import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { FIELDS, FIELD_SIZE } from './catalog';
import type { Appearance } from './appearance';
import { randomAppearance } from './random';
import { avatarParts, drawAvatar, partsForRig, Z } from './draw';
import type { PaintGradient, Painter } from './painter';
import { RecordingPainter } from './recording-painter';

type View = 'front' | 'side' | 'back';
const VIEWS: View[] = ['front', 'side', 'back'];
const ROLES = [undefined, 'pizzas', 'obstaculos', 'arena', 'nope'];
const BASE: Appearance = { v: 1, g: 2, s: 0, hc: 1, sk: 1, hat: 0, gl: 0, bk: 0, cl: 0 };
const full = (o: Partial<Appearance>): Appearance => ({ ...BASE, ...o });
const ids = (ap: Appearance, view: View, role?: string) => avatarParts(ap, view, role).map((p) => p.id);
const draw = (ap: Appearance, view: View, role?: string, t = 0.5) => {
  const p = new RecordingPainter();
  drawAvatar(p, ap, { view, t, slotColor: '#2F7DE1', role });
  return p.log;
};

/** Painter that tracks the bounding box of everything drawn, through translate/rotate/scale. */
class BoundsPainter implements Painter {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;
  lineCap: 'round' = 'round';
  lineJoin: 'round' = 'round';
  minX = Infinity;
  maxX = -Infinity;
  minY = Infinity;
  maxY = -Infinity;
  depth = 0;
  private m = [1, 0, 0, 1, 0, 0];
  private stack: number[][] = [];
  private pt(x: number, y: number) {
    const [a, b, c, d, e, f] = this.m as [number, number, number, number, number, number];
    const X = a * x + c * y + e,
      Y = b * x + d * y + f;
    this.minX = Math.min(this.minX, X);
    this.maxX = Math.max(this.maxX, X);
    this.minY = Math.min(this.minY, Y);
    this.maxY = Math.max(this.maxY, Y);
  }
  save() {
    this.stack.push([...this.m]);
    this.depth++;
  }
  restore() {
    this.m = this.stack.pop()!;
    this.depth--;
  }
  private mul(a2: number, b2: number, c2: number, d2: number, e2: number, f2: number) {
    const [a, b, c, d, e, f] = this.m as [number, number, number, number, number, number];
    this.m = [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
  }
  translate(x: number, y: number) {
    this.mul(1, 0, 0, 1, x, y);
  }
  rotate(r: number) {
    this.mul(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
  }
  scale(x: number, y: number) {
    this.mul(x, 0, 0, y, 0, 0);
  }
  beginPath() {}
  closePath() {}
  moveTo(x: number, y: number) {
    this.pt(x, y);
  }
  lineTo(x: number, y: number) {
    this.pt(x, y);
  }
  arc(x: number, y: number, r: number) {
    for (let i = 0; i < 8; i++) this.pt(x + Math.cos(i * 0.785) * r, y + Math.sin(i * 0.785) * r);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number) {
    this.pt(x1, y1);
    this.pt(x2, y2);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number) {
    for (let i = 0; i < 16; i++) {
      const a = i * 0.3927;
      this.pt(
        x + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot),
        y + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot),
      );
    }
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.pt(cx, cy);
    this.pt(x, y);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.pt(a, b);
    this.pt(c, d);
    this.pt(x, y);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.pt(x, y);
    this.pt(x + w, y + h);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, h);
  }
  fill() {}
  stroke() {}
  clip() {}
  createLinearGradient(): PaintGradient {
    return { addColorStop() {} };
  }
  createRadialGradient(): PaintGradient {
    return { addColorStop() {} };
  }
}

/** Every appearance worth drawing: each value of each field on its own, plus seeded random ones. */
function* looks(): Generator<Appearance> {
  for (const f of FIELDS) for (let v = 0; v < FIELD_SIZE[f]; v++) yield full({ [f]: v });
  for (let i = 0; i < 200; i++) yield randomAppearance(mulberry32(i + 1));
}

describe('avatarParts: z order', () => {
  it('lists parts strictly increasing in z for every view, role and look', () => {
    for (const ap of looks())
      for (const view of VIEWS)
        for (const role of ROLES) {
          const z = avatarParts(ap, view, role).map((p) => p.z);
          expect(z.every((v, i) => i === 0 || v > z[i - 1]!)).toBe(true);
        }
  });
  it('front and side: ring first, back item behind the torso, face < glasses < front hair < hat < front arm last', () => {
    const ap = full({ s: 1, hat: 3, gl: 2, bk: 1 });
    for (const view of ['front', 'side'] as const) {
      const l = ids(ap, view);
      expect(l[0]).toBe('ring');
      expect(l.at(-1)).toBe('arm-front');
      expect(l.indexOf('back')).toBeLessThan(l.indexOf('hair-back'));
      expect(l.indexOf('hair-back')).toBeLessThan(l.indexOf('torso'));
      expect(l.indexOf('torso')).toBeLessThan(l.indexOf('head'));
      expect(l.indexOf('head')).toBeLessThan(l.indexOf('face'));
      expect(l.indexOf('face')).toBeLessThan(l.indexOf('glasses'));
      expect(l.indexOf('glasses')).toBeLessThan(l.indexOf('hair-front'));
      expect(l.indexOf('hair-front')).toBeLessThan(l.indexOf('hat'));
      expect(l.indexOf('hat')).toBeLessThan(l.indexOf('arm-front'));
    }
  });
  it('role overlay sits over the torso and under the head, scarf collar and straps in front of it', () => {
    const l = ids(full({ bk: 5 }), 'front', 'pizzas');
    expect(l.indexOf('torso')).toBeLessThan(l.indexOf('overlay'));
    expect(l.indexOf('overlay')).toBeLessThan(l.indexOf('back-front'));
    expect(l.indexOf('back-front')).toBeLessThan(l.indexOf('head'));
  });
  it('back view: no face, no glasses, no back hair; the back item moves after the overlay; both arms above it', () => {
    const l = ids(full({ s: 2, gl: 1, bk: 2, hat: 2 }), 'back', 'obstaculos');
    expect(l).not.toContain('face');
    expect(l).not.toContain('glasses');
    expect(l).not.toContain('hair-back');
    expect(l.indexOf('overlay')).toBeLessThan(l.indexOf('back'));
    expect(l.indexOf('back')).toBeLessThan(l.indexOf('arm-back'));
    expect(l.indexOf('arm-back')).toBeLessThan(l.indexOf('head'));
    expect(avatarParts(full({}), 'back')[0]!.id).toBe('ring');
  });
  it('the Z table keeps the plan order (ring < back < hair-back < arm < legs < torso < overlay < head < face < glasses < hair < hat < arm)', () => {
    const order = [
      Z.ring,
      Z.back,
      Z.hairBack,
      Z.armBack,
      Z.legs,
      Z.torso,
      Z.overlay,
      Z.backFront,
      Z.head,
      Z.face,
      Z.glasses,
      Z.hairFront,
      Z.hat,
      Z.armFront,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(Z.backOver).toBeGreaterThan(Z.overlay);
    expect(Z.armsBackView).toBeGreaterThan(Z.backOver);
    expect(Z.armsBackView).toBeLessThan(Z.head);
  });
  it('optional parts exist only when chosen', () => {
    const l = ids(full({}), 'front');
    for (const id of ['back', 'hair-back', 'glasses', 'hat', 'overlay', 'back-front']) expect(l).not.toContain(id);
    expect(ids(full({ s: 1 }), 'front')).toContain('hair-back');
    expect(ids(full({ hat: 1 }), 'front')).toContain('hat');
    expect(ids(full({}), 'front', 'pizzas')).toContain('hat');
    expect(ids(full({ hat: 4 }), 'front', 'arena').filter((i) => i === 'hat')).toHaveLength(1);
  });
  it('partsForRig lists every part once, on the bone it hangs from', () => {
    const ap = full({ s: 1, hat: 1, gl: 1, bk: 5 });
    const rig = partsForRig(ap, 'front', 'pizzas');
    expect(Object.values(rig).flat().sort()).toEqual(ids(ap, 'front', 'pizzas').sort());
    expect(rig.head).toEqual(expect.arrayContaining(['head', 'face', 'glasses', 'hair-front', 'hair-back', 'hat']));
    expect(rig.root).toEqual(['ring']);
  });
});

describe('drawAvatar', () => {
  it('draws every field value in every view and role without throwing, with balanced save/restore', () => {
    for (const ap of looks())
      for (const view of VIEWS)
        for (const role of ROLES) {
          const log = draw(ap, view, role);
          expect(log.length).toBeGreaterThan(20);
          expect(log.filter((l) => l === 'save()').length).toBe(log.filter((l) => l === 'restore()').length);
        }
  });
  it('is deterministic: the same input makes the same calls', () => {
    for (const ap of [...looks()].slice(0, 40))
      for (const view of VIEWS) expect(draw(ap, view, 'pizzas', 1.3)).toEqual(draw(ap, view, 'pizzas', 1.3));
  });
  it('keeps everything inside the 120x170 rig box (x in [-60,60], y in [-150,20])', () => {
    for (const ap of looks())
      for (const view of VIEWS)
        for (const role of ROLES)
          for (const t of [0, 1.1, 2.6]) {
            const b = new BoundsPainter();
            drawAvatar(b, ap, { view, t, slotColor: '#2F7DE1', role });
            expect(b.depth).toBe(0);
            expect([b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite)).toBe(true);
            expect(b.minX).toBeGreaterThanOrEqual(-60);
            expect(b.maxX).toBeLessThanOrEqual(60);
            expect(b.minY).toBeGreaterThanOrEqual(-150);
            expect(b.maxY).toBeLessThanOrEqual(20);
          }
  });
  it('uses the ink outline #2A211C and the slot colour for the ring', () => {
    const log = draw(full({}), 'front');
    expect(log).toContain('strokeStyle=#2A211C');
    expect(log).toContain('fillStyle=#2F7DE1');
  });
  it('the role replaces the head slot instead of stacking: chef hat hides the own crown, helmet too; arena keeps it', () => {
    const own = full({ hat: 5 });
    expect(draw(own, 'front')).toContain('fillStyle=#F2C230');
    expect(draw(own, 'front', 'arena')).toContain('fillStyle=#F2C230');
    expect(draw(own, 'front', 'pizzas')).not.toContain('fillStyle=#F2C230');
    expect(draw(own, 'front', 'obstaculos')).not.toContain('fillStyle=#F2C230');
    expect(draw(full({}), 'front', 'obstaculos')).toContain('fillStyle=#9AA5B5');
  });
  it('identity comes from the ring: clothes never use the slot colour, the ring does', () => {
    const a = draw(full({ cl: 4 }), 'front').join('\n');
    const b = new RecordingPainter();
    drawAvatar(b, full({ cl: 4 }), { view: 'front', t: 0, slotColor: '#E63B2E' });
    expect(b.log.filter((l) => l === 'fillStyle=#E63B2E')).toHaveLength(1);
    expect(a).not.toContain('#E63B2E');
  });
  it('different looks make different pictures', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(draw(randomAppearance(mulberry32(i + 7)), 'front').join('|'));
    expect(seen.size).toBe(60);
  });
});
