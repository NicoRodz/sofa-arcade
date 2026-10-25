// Darkness of a level with a lantern (campaign dynamic 10): a low-resolution canvas the size of the picture (its world rectangle), black with a soft hole of `radius` px around
// every lantern and a faint small one around every player (so the one without the lantern is never lost). Redrawn every frame; at 320x180 it costs nothing and the stretch
// hides the resolution under the gradients.
import type Phaser from 'phaser';
import { TILE } from '@party/shared/obstaculos';

const TW = 320, TH = 180;
const PLAYER_LIGHT_TILES = 1.5;
let instances = 0;

export class DarkLayer {
  private key = `ob_dark_${++instances}`;
  private img: Phaser.GameObjects.Image;
  private tex: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    const tex = scene.textures.createCanvas(this.key, TW, TH);
    if (!tex) throw new Error('dark texture not created');
    this.tex = tex;
    this.img = scene.add.image(0, 0, this.key).setOrigin(0, 0).setVisible(false);
    layer.add(this.img);
  }

  // rect: the visible world rectangle; lights and players in world px (players: the centre of the body).
  update(rect: { x: number; y: number; w: number; h: number }, dark: { radius: number; lights: { x: number; y: number }[] } | null, players: readonly { x: number; y: number }[], t: number): void {
    if (!dark) { this.img.setVisible(false); return; }
    const c = this.tex.getContext(), sx = TW / rect.w, sy = TH / rect.h;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, TW, TH);
    c.fillStyle = 'rgba(4,6,20,0.93)';
    c.fillRect(0, 0, TW, TH);
    c.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a: number) => {
      const px = (x - rect.x) * sx, py = (y - rect.y) * sy, pr = r * sx;
      if (px < -pr || py < -pr * (sy / sx) || px > TW + pr || py > TH + pr * (sy / sx)) return;
      c.save(); c.translate(px, py); c.scale(1, sy / sx);
      const g = c.createRadialGradient(0, 0, pr * 0.15, 0, 0, pr);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.62, `rgba(0,0,0,${a * 0.9})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, pr, 0, Math.PI * 2); c.fill(); c.restore();
    };
    for (const p of players) hole(p.x, p.y, PLAYER_LIGHT_TILES * TILE, 0.55);
    const flicker = 1 + Math.sin(t * 7) * 0.012 + Math.sin(t * 17.3) * 0.008;
    for (const l of dark.lights) hole(l.x, l.y, dark.radius * flicker, 1);
    c.globalCompositeOperation = 'source-over';
    // a warm tint inside each lantern's circle
    for (const l of dark.lights) {
      const px = (l.x - rect.x) * sx, py = (l.y - rect.y) * sy, pr = dark.radius * sx;
      c.save(); c.translate(px, py); c.scale(1, sy / sx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, pr);
      g.addColorStop(0, 'rgba(255,190,90,0.16)'); g.addColorStop(1, 'rgba(255,190,90,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, pr, 0, Math.PI * 2); c.fill(); c.restore();
    }
    this.tex.refresh();
    this.img.setVisible(true).setPosition(rect.x, rect.y).setDisplaySize(rect.w, rect.h);
  }

  destroy(): void { this.img.destroy(); this.tex.destroy(); }
}
