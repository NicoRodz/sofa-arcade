// Juice: dust, bursts, rings, confetti, floating words, shake. Particle emitters live in the world layer, so they follow the zoomed camera.
import Phaser from 'phaser';
import { C, FONT, CHEFS, hexNum, confettiColorsOf } from './fxtokens';

export class ObstFx {
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private bits: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Layer) {
    const mk = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => { const e = scene.add.particles(0, 0, key, { emitting: false, ...cfg }); layer.add(e); return e; };
    this.dust = mk('fx_dot', { lifespan: 380, speed: { min: 30, max: 110 }, angle: { min: 190, max: 350 }, gravityY: 60, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.8, end: 0 }, tint: 0xf5ead2 });
    this.bits = mk('fx_dot', { lifespan: 650, speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, gravityY: 700, scale: { start: 1.3, end: 0.3 }, alpha: { start: 1, end: 0 } });
    this.confetti = mk('fx_confetti', { lifespan: 1700, speed: { min: 200, max: 560 }, angle: { min: -150, max: -30 }, gravityY: 700, rotate: { start: 0, end: 540 }, scale: { start: 1.3, end: 1 }, alpha: { start: 1, end: 0, ease: 'cubic.in' }, tint: confettiColorsOf() });
    this.stars = mk('fx_star', { lifespan: 800, speed: { min: 100, max: 260 }, angle: { min: -160, max: -20 }, gravityY: 380, rotate: { start: 0, end: 240 }, scale: { start: 0.9, end: 0.15 }, alpha: { start: 1, end: 0 } });
    this.sparks = mk('fx_dot', { lifespan: 420, speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 }, scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xffd27a, 0xff8a1f] });
  }

  puff(x: number, y: number, n = 5) { this.dust.explode(n, x, y); }
  burst(x: number, y: number, slot: number, n = 16) { this.bits.setParticleTint(hexNum(CHEFS[slot % 8]!.color)); this.bits.explode(n, x, y); this.stars.explode(4, x, y); }
  confettiAt(x: number, y: number, n = 40) { this.confetti.explode(n, x, y); }
  starBurst(x: number, y: number, n = 6) { this.stars.explode(n, x, y); }
  spark(x: number, y: number, n = 6) { this.sparks.explode(n, x, y); }

  ring(x: number, y: number, color: number, from = 0.4, to = 1.8) {
    const r = this.scene.add.image(x, y, 'fx_ring').setTint(color).setScale(from);
    this.layer.add(r);
    this.scene.tweens.add({ targets: r, scale: to, alpha: 0, duration: 450, ease: 'cubic.out', onComplete: () => r.destroy() });
  }
  float(x: number, y: number, text: string, color: string, size = 30) {
    const t = this.scene.add.text(x, y, text, { fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: C.ink, strokeThickness: Math.max(4, Math.round(size / 7)), resolution: 2 }).setOrigin(0.5).setScale(1.4);
    this.layer.add(t);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'back.out' });
    this.scene.tweens.add({ targets: t, y: y - 56, duration: 900, ease: 'cubic.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 300, onComplete: () => t.destroy() });
  }
  // A wind streak: a thin white line that drifts `dir` and fades (campaign dynamic 8).
  streak(x: number, y: number, dir: number, len = 90) {
    const g = this.scene.add.graphics();
    g.lineStyle(3, 0xffffff, 0.85); g.lineBetween(0, 0, dir * len, 0); g.setPosition(x, y);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, x: x + dir * 260, alpha: 0, duration: 520, ease: 'sine.out', onComplete: () => g.destroy() });
  }
  shake(ms: number, amp: number) { this.scene.cameras.main.shake(ms, amp); }
  destroy() { for (const e of [this.dust, this.bits, this.confetti, this.stars, this.sparks]) e.destroy(); }
}
