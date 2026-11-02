// The wall behind the board: cocoa with a faint pattern of small diamonds (a single TileSprite, drawn by the GPU), so the area around the floor is not a flat grey.
import type Phaser from 'phaser';
import { H, W } from '@pichi/screen-kit/art';
import { A } from './palette';

const KEY = 'mz_wallpaper';
const SIZE = 64;

export function addBackdrop(scene: Phaser.Scene): Phaser.GameObjects.TileSprite {
  if (!scene.textures.exists(KEY)) {
    const tex = scene.textures.createCanvas(KEY, SIZE * 2, SIZE * 2);
    if (!tex) throw new Error(`texture ${KEY} not created`);
    const c = tex.getContext();
    c.scale(2, 2);
    c.fillStyle = A.cocoa;
    c.fillRect(0, 0, SIZE, SIZE);
    c.fillStyle = 'rgba(255,244,224,0.05)';
    for (const [x, y] of [
      [SIZE / 2, SIZE / 2],
      [0, 0],
      [SIZE, 0],
      [0, SIZE],
      [SIZE, SIZE],
    ] as const) {
      c.beginPath();
      c.moveTo(x, y - 9);
      c.lineTo(x + 9, y);
      c.lineTo(x, y + 9);
      c.lineTo(x - 9, y);
      c.closePath();
      c.fill();
    }
    tex.refresh();
  }
  return scene.add.tileSprite(0, 0, W, H, KEY).setOrigin(0, 0).setTileScale(0.5, 0.5).setDepth(-3);
}
