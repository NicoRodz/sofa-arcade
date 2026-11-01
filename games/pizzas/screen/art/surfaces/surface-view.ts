// Ice and floor belts, drawn by code over the floor (surfaces/ in the sim is the rules). Created by the background builder for a map that has them;
// it animates itself on the scene's update event and goes away with the scene's children (the round's teardown removes them all).
// Ice: a pale blue sheet with bevelled edges, a few diagonal glints that pulse. Belt: a dark rubber lane with side rails and chevrons that scroll at the belt's own speed.
import type Phaser from 'phaser';
import type { Grid } from '../../../sim/maps';
import { BELT_SPEED } from '../../../sim/surfaces/config';
import { TILE } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';

const ICE = { base: 0xbfe6f5, edge: 0xe9f8ff, deep: 0x8cc7e0, glint: 0xffffff };
const BELT = { base: 0x3a3f47, rail: 0xf2b632, chevron: 0xffd966, dark: 0x262a30 };
const DEPTH = 1.5; // over the floor and the kitchen tint, under stations, items and chefs
const GLINTS = 3; // glints per ice tile

type Tile = { x: number; y: number };
type Belt = Tile & { dx: number; dy: number };

export class SurfaceView {
  private ice: Tile[] = [];
  private belts: Belt[] = [];
  private still: Phaser.GameObjects.Graphics;
  private moving: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
  ) {
    grid.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t.kind !== 'floor' || !t.surface) return;
        if (t.surface.kind === 'ice') this.ice.push({ x, y });
        else this.belts.push({ x, y, dx: t.surface.dx, dy: t.surface.dy });
      }),
    );
    this.still = scene.add.graphics().setDepth(DEPTH);
    this.moving = scene.add.graphics().setDepth(DEPTH);
    this.drawStill();
    const tick = (_time: number, dtMs: number) => this.update(dtMs);
    scene.events.on('update', tick);
    this.moving.once('destroy', () => scene.events.off('update', tick));
  }

  private px = (t: Tile) => ({ x: OX + t.x * TILE, y: OY + t.y * TILE });

  /** The parts that never change: the ice sheets and the belt lanes (the chevrons are redrawn each frame). */
  private drawStill() {
    const g = this.still;
    const has = (x: number, y: number, kind: 'ice' | 'belt') => {
      const t = this.grid[y]?.[x];
      return t?.kind === 'floor' && t.surface?.kind === kind;
    };
    for (const t of this.ice) {
      const { x, y } = this.px(t);
      g.fillStyle(ICE.base, 1).fillRect(x, y, TILE, TILE);
      g.fillStyle(ICE.deep, 0.35).fillRect(x, y + TILE * 0.82, TILE, TILE * 0.18);
      g.fillStyle(ICE.edge, 0.9);
      if (!has(t.x, t.y - 1, 'ice')) g.fillRect(x, y, TILE, TILE * 0.07); // a bright rim only where the sheet ends
      if (!has(t.x - 1, t.y, 'ice')) g.fillRect(x, y, TILE * 0.07, TILE);
      g.lineStyle(1, ICE.deep, 0.35).strokeRect(x, y, TILE, TILE); // the seams between sheets
    }
    for (const b of this.belts) {
      const { x, y } = this.px(b);
      g.fillStyle(BELT.base, 1).fillRect(x, y, TILE, TILE);
      const horizontal = b.dx !== 0;
      const rail = TILE * 0.09;
      g.fillStyle(BELT.rail, 1);
      if (horizontal) {
        g.fillRect(x, y, TILE, rail);
        g.fillRect(x, y + TILE - rail, TILE, rail);
      } else {
        g.fillRect(x, y, rail, TILE);
        g.fillRect(x + TILE - rail, y, rail, TILE);
      }
      g.lineStyle(1, BELT.dark, 0.6).strokeRect(x, y, TILE, TILE);
    }
  }

  private update(dtMs: number) {
    this.t += dtMs;
    const g = this.moving;
    g.clear();
    // ice glints: three short diagonal strokes per tile, each pulsing out of phase
    for (const t of this.ice) {
      const { x, y } = this.px(t);
      for (let k = 0; k < GLINTS; k++) {
        const seed = (t.x * 7 + t.y * 13 + k * 5) % 11;
        const a = 0.5 + 0.5 * Math.sin(this.t / 700 + seed);
        const gx = x + TILE * (0.2 + 0.28 * k) + ((seed * 3) % 7) * 0.01 * TILE;
        const gy = y + TILE * (0.25 + 0.22 * ((seed + k) % 3));
        g.lineStyle(Math.max(2, TILE * 0.03), ICE.glint, 0.18 + 0.5 * a * a);
        g.lineBetween(gx, gy + TILE * 0.12, gx + TILE * 0.12, gy);
      }
    }
    // belt chevrons: a lane of "V" marks along the direction, moving one tile every 1 / BELT_SPEED seconds
    const phase = ((this.t / 1000) * BELT_SPEED) % 1;
    for (const b of this.belts) {
      const { x, y } = this.px(b);
      const cx = x + TILE / 2,
        cy = y + TILE / 2;
      g.lineStyle(Math.max(3, TILE * 0.07), BELT.chevron, 0.9);
      for (const o of [0, 0.5]) {
        const s = ((phase + o) % 1) - 0.5; // -0.5..0.5 along the tile
        const fade = 1 - Math.abs(s) * 1.4;
        g.lineStyle(Math.max(3, TILE * 0.07), BELT.chevron, Math.max(0.15, fade));
        this.chevron(g, cx + b.dx * s * TILE, cy + b.dy * s * TILE, b.dx, b.dy);
      }
    }
  }

  // one ">" pointing along (dx, dy), centred on (x, y)
  private chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, dx: number, dy: number) {
    const a = TILE * 0.16, // half-width of the arm across the direction
      d = TILE * 0.12; // depth along the direction
    const px = -dy,
      py = dx; // perpendicular
    g.beginPath();
    g.moveTo(x - dx * d + px * a, y - dy * d + py * a);
    g.lineTo(x + dx * d, y + dy * d);
    g.lineTo(x - dx * d - px * a, y - dy * d - py * a);
    g.strokePath();
  }
}

/** Draws the surfaces of a grid if it has any. */
export function addSurfaces(scene: Phaser.Scene, g: Grid) {
  if (g.some((row) => row.some((t) => t.kind === 'floor' && t.surface))) new SurfaceView(scene, g);
}
