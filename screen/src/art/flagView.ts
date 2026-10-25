// An in-game team flag: a canvas texture that drawFlag repaints about 30 times a second, shown as an image planted at a tile.
import type Phaser from 'phaser';
import { FLAG_H, FLAG_W, drawFlag, type FlagMood } from './flags';

const SS = 2; // supersampling of the texture
export class FlagView {
  readonly image: Phaser.GameObjects.Image;
  private tex: Phaser.Textures.CanvasTexture;
  private t = Math.random() * 6;
  private since = 99;
  private dead = false;

  constructor(private scene: Phaser.Scene, private key: string, private color: string, private glyph: string, private mood: FlagMood, x: number, y: number, depth: number, size: number) {
    this.tex = scene.textures.createCanvas(key, FLAG_W * SS, FLAG_H * SS)!;
    this.image = scene.add.image(x, y, key).setOrigin(16 / FLAG_W, (FLAG_H - 6) / FLAG_H).setScale(size / FLAG_H / SS).setDepth(depth);
    this.paint();
  }
  setMood(mood: FlagMood) { this.mood = mood; this.since = 99; }
  /** Rises from the ground with a bounce. */
  raise() {
    const k = this.image.scaleY;
    this.image.setScale(this.image.scaleX, k * 0.05);
    this.scene.tweens.add({ targets: this.image, scaleY: k, duration: 900, ease: 'back.out' });
  }
  private paint() {
    const c = this.tex.getContext();
    c.setTransform(SS, 0, 0, SS, 0, 0);
    c.clearRect(0, 0, FLAG_W, FLAG_H);
    drawFlag(c, { color: this.color, glyph: this.glyph, mood: this.mood, t: this.t });
    this.tex.refresh();
  }
  update(dtMs: number) {
    if (this.dead) return;
    this.t += dtMs / 1000;
    this.since += dtMs;
    if (this.since >= 33) { this.since = 0; this.paint(); }
  }
  destroy() {
    this.dead = true;
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
