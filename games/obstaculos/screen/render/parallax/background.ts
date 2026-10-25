// Parallax textures per biome and the Background that scrolls them behind the level.
import { lerpHex } from './noise';
import { TH, TW } from './noise';
import { layerFar, layerMid, layerNear } from './layers';
import type Phaser from 'phaser';
import type { Biome } from '../../../index';
import { INK, PALETTES, hexToInt } from '../biome';

export const LAYER_FACTORS = [0.12, 0.3, 0.58] as const;

export function buildParallaxTextures(scene: Phaser.Scene, biome: Biome): string[] {
  const p = PALETTES[biome];
  const keys: string[] = [];
  [layerFar, layerMid, layerNear].forEach((fn, i) => {
    const key = `obt_bg_${biome}_${i}`;
    keys.push(key);
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, TW, TH);
    if (!tex) throw new Error('parallax texture not created');
    const c = tex.getContext();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const dx of [0, -TW, TW]) {
      c.save();
      c.translate(dx, 0);
      fn(c, biome, p);
      c.restore();
    } // three passes: whatever crosses the edge wraps around
    c.clearRect(0, 0, TW, 2);
    c.clearRect(0, TH - 2, TW, 2); // transparent rim: the vertical wrap must not blend ground into sky
    tex.refresh();
  });
  const sky = `obt_sky_${biome}`;
  if (!scene.textures.exists(sky)) {
    const tex = scene.textures.createCanvas(sky, 4, 256)!;
    const c = tex.getContext();
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(1, p.skyBottom);
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
    tex.refresh();
  }
  return keys;
}

export class Background {
  private sky: Phaser.GameObjects.Image;
  private layers: Phaser.GameObjects.TileSprite[];
  private outside: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    outsideLayer: Phaser.GameObjects.Layer,
    private biome: Biome,
    private worldW: number,
    private worldH: number,
  ) {
    const keys = buildParallaxTextures(scene, biome);
    this.sky = scene.add.image(0, 0, `obt_sky_${biome}`).setOrigin(0.5, 0.5);
    layer.add(this.sky);
    this.layers = keys.map((k) => {
      const t = scene.add.tileSprite(0, 0, 3600, TH, k).setOrigin(0.5, 1);
      layer.add(t);
      return t;
    });
    this.outside = scene.add.graphics();
    outsideLayer.add(this.outside);
  }

  update(cx: number, cy: number, viewW: number, viewH: number): void {
    const margin = 120;
    this.sky.setPosition(cx, cy).setDisplaySize(viewW + margin, viewH + margin);
    const H = this.worldH;
    const bases = [H * 0.86, H * 0.97, H * 1.06];
    this.layers.forEach((l, i) => {
      const f = LAYER_FACTORS[i]!;
      l.setPosition(cx, bases[i]! + (cy - H / 2) * (1 - f) * 0.35);
      l.setSize(Math.ceil(viewW + margin), TH);
      l.tilePositionX = cx * f + TW / 2;
      l.tilePositionY = 0;
    });
    // outside the level: dark ground below and dark walls at the sides
    const pal = PALETTES[this.biome],
      g = this.outside;
    g.clear();
    const x0 = cx - viewW / 2 - 200,
      x1 = cx + viewW / 2 + 200,
      y1 = cy + viewH / 2 + 200;
    g.fillStyle(hexToInt(pal.bodyDark), 1);
    if (x0 < 0) g.fillRect(x0, cy - viewH / 2 - 200, -x0, y1 - (cy - viewH / 2 - 200));
    if (x1 > this.worldW) g.fillRect(this.worldW, cy - viewH / 2 - 200, x1 - this.worldW, y1 - (cy - viewH / 2 - 200));
    if (y1 > this.worldH) {
      const dark = hexToInt(lerpHex(pal.bodyDark, '#000000', 0.45));
      g.fillGradientStyle(hexToInt(pal.bodyDark), hexToInt(pal.bodyDark), dark, dark, 1);
      g.fillRect(x0, this.worldH, x1 - x0, y1 - this.worldH);
      g.fillStyle(0x2b1b17, 1);
      g.fillRect(x0, this.worldH - 1, x1 - x0, 3);
    }
    void INK;
  }

  destroy(): void {
    this.sky.destroy();
    this.layers.forEach((l) => l.destroy());
    this.outside.destroy();
  }
}
