// Rope drawing: a cosmetic verlet chain of 12 points per link, pinned to the two waists. Behind the tiles. The real rope is the PBD
// constraint in the simulation (plan §4); this only has to look right. Colour = the cordada's, blending to red with the tension.
import Phaser from 'phaser';
import { ROPE_LEN, TILE } from '../../index';
import { ROPE_COLORS, ROPE_COLOR_DARK, ROPE_RED, hexToInt, lerpColor } from './biome';
import type { RopeView } from './view';

export const ROPE_POINTS = 12;
const GRAVITY = 1500; // px/s^2, cosmetic
const ITER = 8;
const DAMP = 0.985;

interface Chain {
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  seeded: boolean;
  twang: number;
}
export interface Anchor {
  x: number;
  y: number;
}

export class RopeDrawer {
  private chains = new Map<string, Chain>();
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics();
    layer.add(this.g);
  }

  twang(a: number, b: number) {
    const c = this.chains.get(`${a}-${b}`);
    if (c) c.twang = 1;
  }

  // anchors: waist position per player id (already interpolated); returns nothing, draws.
  update(
    dt: number,
    ropes: readonly RopeView[],
    anchors: Map<number, Anchor>,
    view: { x: number; y: number; w: number; h: number },
    t: number,
    solidAt: (px: number, py: number) => boolean = () => false,
  ): void {
    const g = this.g;
    g.clear();
    const alive = new Set<string>();
    dt = Math.min(dt, 1 / 30);
    for (const rope of ropes) {
      const base = ROPE_COLORS[rope.cordada % ROPE_COLORS.length]!,
        dark = ROPE_COLOR_DARK[rope.cordada % ROPE_COLOR_DARK.length]!;
      for (const link of rope.links) {
        if (!link.active) continue;
        const A = anchors.get(link.a),
          B = anchors.get(link.b);
        if (!A || !B) continue;
        const key = `${link.a}-${link.b}`;
        alive.add(key);
        let ch = this.chains.get(key);
        if (!ch) {
          ch = {
            x: new Float32Array(ROPE_POINTS),
            y: new Float32Array(ROPE_POINTS),
            px: new Float32Array(ROPE_POINTS),
            py: new Float32Array(ROPE_POINTS),
            seeded: false,
            twang: 0,
          };
          this.chains.set(key, ch);
        }
        const N = ROPE_POINTS;
        if (
          ch.seeded &&
          (Math.abs(ch.x[0]! - A.x) > 150 ||
            Math.abs(ch.y[0]! - A.y) > 150 ||
            Math.abs(ch.x[N - 1]! - B.x) > 150 ||
            Math.abs(ch.y[N - 1]! - B.y) > 150)
        )
          ch.seeded = false; // teleport (respawn): start straight
        if (!ch.seeded) {
          for (let i = 0; i < N; i++) {
            const u = i / (N - 1);
            ch.x[i] = ch.px[i] = A.x + (B.x - A.x) * u;
            ch.y[i] = ch.py[i] = A.y + (B.y - A.y) * u;
          }
          ch.seeded = true;
        }
        // cull chains far away from the view
        const minX = Math.min(A.x, B.x),
          maxX = Math.max(A.x, B.x),
          minY = Math.min(A.y, B.y) - 200,
          maxY = Math.max(A.y, B.y) + 200;
        if (maxX < view.x - 100 || minX > view.x + view.w + 100 || maxY < view.y || minY > view.y + view.h) {
          ch.seeded = false;
          continue;
        }
        const baseLen = rope.base ?? ROPE_LEN; // the campaign's rope is longer
        const seg = baseLen / (N - 1);
        const taut = Math.max(0, Math.min(1.25, link.tension));
        // integrate
        const gScale = 1 - Math.max(0, Math.min(1, (taut - 0.7) / 0.3)) * 0.92; // taut rope barely sags
        for (let i = 1; i < N - 1; i++) {
          const vx = (ch.x[i]! - ch.px[i]!) * DAMP,
            vy = (ch.y[i]! - ch.py[i]!) * DAMP;
          ch.px[i] = ch.x[i]!;
          ch.py[i] = ch.y[i]!;
          ch.x[i] = ch.x[i]! + vx;
          ch.y[i] = ch.y[i]! + vy + GRAVITY * gScale * dt * dt;
        }
        ch.x[0] = A.x;
        ch.y[0] = A.y;
        ch.x[N - 1] = B.x;
        ch.y[N - 1] = B.y;
        if (ch.twang > 0) {
          const m = N >> 1;
          ch.y[m] = ch.y[m]! + Math.sin(t * 60) * 6 * ch.twang;
          ch.twang = Math.max(0, ch.twang - dt * 3);
        }
        // a slack rope hangs as a short loop: the visual length follows the distance (1.2x) between a third of L and L
        const dist = Math.hypot(B.x - A.x, B.y - A.y);
        const len = Math.min(seg, Math.max(baseLen * 0.3, dist * 1.2) / (N - 1));
        for (let it = 0; it < ITER; it++) {
          for (let i = 0; i < N - 1; i++) {
            const dx = ch.x[i + 1]! - ch.x[i]!,
              dy = ch.y[i + 1]! - ch.y[i]!;
            const d = Math.hypot(dx, dy) || 1e-6;
            const diff = d > len ? (d - len) / d : 0; // unilateral: only pulls (a rope does not push)
            if (diff === 0) continue;
            const w0 = i === 0 ? 0 : 1,
              w1 = i + 1 === N - 1 ? 0 : 1,
              ws = w0 + w1;
            if (ws === 0) continue;
            ch.x[i] = ch.x[i]! + dx * diff * (w0 / ws);
            ch.y[i] = ch.y[i]! + dy * diff * (w0 / ws);
            ch.x[i + 1] = ch.x[i + 1]! - dx * diff * (w1 / ws);
            ch.y[i + 1] = ch.y[i + 1]! - dy * diff * (w1 / ws);
          }
        }
        // a rope lies on the ground instead of sagging through it (it is drawn behind the tiles)
        for (let i = 1; i < N - 1; i++) {
          let ty = Math.floor(ch.y[i]! / TILE),
            guard = 0;
          if (!solidAt(ch.x[i]!, ch.y[i]!)) continue;
          while (guard++ < 4 && solidAt(ch.x[i]!, ty * TILE + 1)) ty--;
          ch.y[i] = (ty + 1) * TILE - 6;
          ch.py[i] = ch.y[i]!;
        }
        // draw: ink, then colour; stretched ropes go red and thin
        const el = !!link.elastic; // hanging from a bungee ring: an orange rubber cord that never goes red, thinner the more it stretches
        const strain = el ? 0 : Math.max(0, Math.min(1, (taut - 0.82) / 0.2));
        const col = hexToInt(rgbHex(el ? lerpColor(base, '#FF9A2E', 0.75) : lerpColor(base, ROPE_RED, strain)));
        const colDark = hexToInt(rgbHex(el ? '#B45A0A' : lerpColor(dark, '#8A1B12', strain)));
        const w = el ? 7 - Math.max(0, Math.min(1, (link.tension - 1) / 0.6)) * 2.6 : 6.5 - strain * 1.5;
        const pts = Array.from({ length: N }, (_, i) => new Phaser.Math.Vector2(ch!.x[i]!, ch!.y[i]!));
        g.lineStyle(w + 4, 0x2b1b17, 1);
        g.strokePoints(pts, false, false);
        g.lineStyle(w, col, 1);
        g.strokePoints(pts, false, false);
        g.lineStyle(1.6, colDark, 0.9); // twist
        for (let i = 0; i < N - 1; i += 1) {
          const mx = (ch.x[i]! + ch.x[i + 1]!) / 2,
            my = (ch.y[i]! + ch.y[i + 1]!) / 2;
          const dx = ch.x[i + 1]! - ch.x[i]!,
            dy = ch.y[i + 1]! - ch.y[i]!,
            d = Math.hypot(dx, dy) || 1;
          g.beginPath();
          g.moveTo(mx - (dy / d) * 2.2 - (dx / d) * 2, my + (dx / d) * 2.2 - (dy / d) * 2);
          g.lineTo(mx + (dy / d) * 2.2 + (dx / d) * 2, my - (dx / d) * 2.2 + (dy / d) * 2);
          g.strokePath();
        }
      }
    }
    for (const k of [...this.chains.keys()]) if (!alive.has(k)) this.chains.delete(k);
  }
  destroy() {
    this.g.destroy();
  }
}

function rgbHex(rgb: string): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}
