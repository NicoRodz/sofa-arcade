// Tile layer: the level baked into canvas chunks (20 columns each), repainted when the live grid changes, plus the animated liquid.
import type Phaser from 'phaser';
import { T, TILE, type Biome, type Rect, type TileGrid } from '@party/shared/obstaculos';
import { PALETTES, hexToInt } from './biome';
import { drawCell } from './tiledraw';
import type { HazardView } from './view';

export const CHUNK_COLS = 20;
export const TEX_SCALE = 1.5; // texture px per world px: sharp up to a 1.5x-scaled screen
const PAD = 26; // world px kept above and below the grid for tufts and icicles

let instances = 0;

export class TileLayer {
  private shadow: Uint8Array;
  private chunks: { img: Phaser.GameObjects.Image; key: string; c0: number; dirty: boolean }[] = [];
  private id = ++instances;
  private liquid: Phaser.GameObjects.Graphics;
  private liquidCells: number[] = []; // flattened [x, y, topExposed] for every liquid cell
  readonly width: number;
  readonly height: number;

  constructor(
    private scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    liquidLayer: Phaser.GameObjects.Layer,
    private grid: TileGrid,
    private biome: Biome,
  ) {
    this.shadow = new Uint8Array(grid.w * grid.h).fill(255);
    this.width = grid.w * TILE;
    this.height = grid.h * TILE;
    const n = Math.ceil(grid.w / CHUNK_COLS);
    for (let i = 0; i < n; i++) {
      const c0 = i * CHUNK_COLS,
        cols = Math.min(CHUNK_COLS, grid.w - c0);
      const key = `obt_tiles_${this.id}_${i}`;
      const tex = scene.textures.createCanvas(key, Math.ceil(cols * TILE * TEX_SCALE), Math.ceil((grid.h * TILE + 2 * PAD) * TEX_SCALE));
      if (!tex) throw new Error('chunk texture not created');
      const img = scene.add
        .image(c0 * TILE, -PAD, key)
        .setOrigin(0, 0)
        .setScale(1 / TEX_SCALE);
      layer.add(img);
      this.chunks.push({ img, key, c0, dirty: true });
    }
    this.liquid = scene.add.graphics();
    liquidLayer.add(this.liquid);
    this.refresh();
  }

  // Diff the live grid against what is painted; repaint the chunks that changed.
  refresh(): void {
    const g = this.grid;
    for (let i = 0; i < g.cells.length; i++) {
      if (g.cells[i] === this.shadow[i]) continue;
      this.shadow[i] = g.cells[i]!;
      const x = i % g.w;
      // a tile changes its neighbours' autotile mask: mark the chunk of x-1, x and x+1
      for (const cx of [x - 1, x, x + 1]) {
        const ch = this.chunks[Math.floor(cx / CHUNK_COLS)];
        if (ch && cx >= 0 && cx < g.w) ch.dirty = true;
      }
    }
    let liquidStale = false;
    for (const ch of this.chunks)
      if (ch.dirty) {
        this.paint(ch);
        liquidStale = true;
      }
    if (liquidStale || !this.liquidCells.length) this.collectLiquid();
  }

  private paint(ch: { key: string; c0: number; dirty: boolean }): void {
    const g = this.grid;
    const tex = this.scene.textures.get(ch.key) as Phaser.Textures.CanvasTexture;
    const c = tex.getContext();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tex.width, tex.height);
    c.scale(TEX_SCALE, TEX_SCALE);
    const cols = Math.min(CHUNK_COLS, g.w - ch.c0);
    c.save();
    c.beginPath();
    c.rect(0, 0, cols * TILE, g.h * TILE + 2 * PAD);
    c.clip();
    const ox = ch.c0 * TILE;
    for (let y = 0; y < g.h; y++)
      for (let x = Math.max(0, ch.c0 - 1); x < Math.min(g.w, ch.c0 + cols + 1); x++)
        drawCell(c, g, x, y, x * TILE - ox, y * TILE + PAD, this.biome, 0);
    c.restore();
    tex.refresh();
    ch.dirty = false;
  }

  private collectLiquid(): void {
    const g = this.grid;
    this.liquidCells = [];
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        if (g.cells[y * g.w + x] !== T.Liquid) continue;
        const top = y === 0 || g.cells[(y - 1) * g.w + x] !== T.Liquid;
        this.liquidCells.push(x, y, top ? 1 : 0);
      }
  }

  setVisible(rect: Rect): void {
    for (const ch of this.chunks) {
      const x0 = ch.c0 * TILE,
        x1 = x0 + CHUNK_COLS * TILE;
      ch.img.setVisible(x1 > rect.x - 4 && x0 < rect.x + rect.w + 4);
    }
  }

  // Animated liquid (static chunks carry nothing for liquid cells), drawn above the players with some transparency.
  drawLiquid(tSec: number, rect: Rect, hazard: HazardView | null): void {
    const pal = PALETTES[this.biome],
      g = this.liquid;
    g.clear();
    const body = hexToInt(pal.liquid),
      dark = hexToInt(pal.liquidDark),
      foam = hexToInt(pal.foam);
    const lava = this.biome === 'volcano';
    const a = lava ? 0.96 : 0.78;
    const wave = (x: number, phase: number, amp: number) =>
      Math.sin(x * 0.045 + tSec * 2.2 + phase) * amp + Math.sin(x * 0.11 - tSec * 1.6 + phase * 2) * amp * 0.45;
    const x0 = rect.x - 20,
      x1 = rect.x + rect.w + 20;
    const cells = this.liquidCells;
    for (let i = 0; i < cells.length; i += 3) {
      const cx = cells[i]! * TILE,
        cy = cells[i + 1]! * TILE,
        top = cells[i + 2]!;
      if (cx + TILE < x0 || cx > x1 || cy + TILE < rect.y - 20 || cy > rect.y + rect.h + 20) continue;
      this.liquidSlab(g, cx, cy, TILE, TILE, top === 1, tSec, body, dark, foam, a, lava, wave);
    }
    if (hazard && (hazard.kind === 'risingLava' || hazard.kind === 'tide')) {
      const gx0 = Math.max(0, rect.x - 20),
        gx1 = Math.min(this.width, rect.x + rect.w + 20);
      const top = hazard.pos,
        bottom = Math.max(this.height + PAD, rect.y + rect.h + 40);
      const lavaHz = hazard.kind === 'risingLava';
      const hb = lavaHz ? 0xff5a1f : body,
        hd = lavaHz ? 0xc23a10 : dark;
      this.liquidSlab(
        g,
        gx0,
        top,
        gx1 - gx0,
        bottom - top,
        true,
        tSec,
        hb,
        hd,
        lavaHz ? 0xffd27a : foam,
        lavaHz ? 0.96 : 0.78,
        lavaHz,
        wave,
      );
    }
  }

  private liquidSlab(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    topExposed: boolean,
    t: number,
    body: number,
    dark: number,
    foam: number,
    alpha: number,
    lava: boolean,
    wave: (x: number, p: number, a: number) => number,
  ): void {
    const amp = topExposed ? 3 : 0;
    if (topExposed) {
      g.fillStyle(body, alpha);
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + 8 + wave(x, 0, amp));
      for (let px = x; px <= x + w; px += 8) g.lineTo(px, y + 8 + wave(px, 0, amp));
      g.lineTo(x + w, y + h);
      g.closePath();
      g.fillPath();
      g.fillStyle(dark, alpha * 0.55); // back wave, darker
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + 18 + wave(x, 2, amp));
      for (let px = x; px <= x + w; px += 8) g.lineTo(px, y + 18 + wave(px, 2, amp));
      g.lineTo(x + w, y + h);
      g.closePath();
      g.fillPath();
      g.lineStyle(3, 0x2b1b17, 0.9);
      g.beginPath();
      g.moveTo(x, y + 8 + wave(x, 0, amp));
      for (let px = x; px <= x + w; px += 8) g.lineTo(px, y + 8 + wave(px, 0, amp));
      g.strokePath();
      g.lineStyle(2, foam, 0.85);
      g.beginPath();
      g.moveTo(x, y + 11 + wave(x, 0, amp));
      for (let px = x; px <= x + w; px += 8) g.lineTo(px, y + 11 + wave(px, 0, amp));
      g.strokePath();
      if (lava) {
        g.fillStyle(0xffd27a, 0.9);
        for (let b = 0; b < Math.max(1, Math.floor(w / 80)); b++) {
          const bx = x + ((b * 83 + t * 18) % Math.max(1, w)),
            by = y + 14 + ((b * 17) % 22) + Math.sin(t * 3 + b) * 3;
          g.fillCircle(bx, by, 2.5);
        }
      }
    } else {
      g.fillStyle(dark, alpha * 0.7);
      g.fillRect(x, y, w, h);
      g.fillStyle(body, alpha * 0.4);
      g.fillRect(x, y + 8, w, h - 16);
    }
  }

  destroy(): void {
    for (const ch of this.chunks) {
      ch.img.destroy();
      this.scene.textures.remove(ch.key);
    }
    this.liquid.destroy();
  }
}
