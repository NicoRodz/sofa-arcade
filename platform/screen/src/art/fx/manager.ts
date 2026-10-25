// Generated particle/prop textures and the juice manager (particles, floating numbers, shake).
import Phaser from 'phaser';
import { C, FONT, hexNum } from '../tokens';

// R7: screen shake is light and can be switched off (key S on the screen); the choice is remembered.
const SHAKE_KEY = 'pg.shake';

let shakeEnabled = true;
try {
  shakeEnabled = localStorage.getItem(SHAKE_KEY) !== '0';
} catch {
  /* storage blocked: shake stays on */
}

export const shakeOn = () => shakeEnabled;

export function toggleShake(): boolean {
  shakeEnabled = !shakeEnabled;
  try {
    localStorage.setItem(SHAKE_KEY, shakeEnabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  return shakeEnabled;
}

export const confettiColors = [0xe63b2e, 0x2f7de1, 0x3fa34d, 0xffc21a, 0x8e5cd9, 0xff7a1a, 0xff5fa2, 0x1fb5a8];

export interface TextOpts {
  size?: number;
  color?: string;
  stroke?: number;
  depth?: number;
}

export function makeText(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontStyle: 'bold',
      fontSize: `${o.size ?? 48}px`,
      color: o.color ?? C.cream,
      stroke: C.ink,
      strokeThickness: o.stroke ?? Math.max(4, Math.round((o.size ?? 48) / 8)),
      resolution: 2,
    })
    .setOrigin(0.5)
    .setDepth(o.depth ?? 2000);
}

export class Fx {
  private chopDough: Phaser.GameObjects.Particles.ParticleEmitter;
  private chopTomato: Phaser.GameObjects.Particles.ParticleEmitter;
  private chopCheese: Phaser.GameObjects.Particles.ParticleEmitter;
  private flour: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private foam: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private puff: Phaser.GameObjects.Particles.ParticleEmitter;
  private soot: Phaser.GameObjects.Particles.ParticleEmitter;
  private steam: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene) {
    const mk = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = 1200) =>
      scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
    const bit = (tint: number) => ({
      lifespan: 400,
      speed: { min: 80, max: 160 },
      angle: { min: -170, max: -10 },
      gravityY: 400,
      scale: { start: 0.9, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint,
    });
    this.chopDough = mk('fx_dot', bit(hexNum(C.dough)));
    this.chopTomato = mk('fx_dot', bit(hexNum(C.tomato)));
    this.chopCheese = mk('fx_dot', bit(hexNum(C.cheese)));
    this.dust = mk('fx_dot', { ...bit(0xffffff), speed: { min: 40, max: 90 }, lifespan: 300 });
    this.foam = mk('fx_ring', {
      lifespan: 650,
      speed: { min: 30, max: 90 },
      angle: { min: -160, max: -20 },
      gravityY: -40,
      scale: { start: 0.12, end: 0.28 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0x9be0ff],
    });
    this.flour = mk('fx_flour', {
      lifespan: 500,
      speed: { min: 60, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0.4 },
      alpha: { start: 0.8, end: 0 },
    });
    this.confetti = mk('fx_confetti', {
      lifespan: 1300,
      speed: { min: 180, max: 420 },
      angle: { min: -140, max: -40 },
      gravityY: 620,
      rotate: { start: 0, end: 540 },
      scale: { start: 1.2, end: 0.9 },
      alpha: { start: 1, end: 0, ease: 'cubic.in' },
      tint: confettiColors,
    });
    this.stars = mk('fx_star', {
      lifespan: 700,
      speed: { min: 90, max: 200 },
      angle: { min: -150, max: -30 },
      gravityY: 300,
      rotate: { start: 0, end: 200 },
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 },
    });
    this.smoke = mk(
      'fx_smoke',
      {
        lifespan: 1400,
        speedY: { min: -50, max: -28 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.6, end: 0 },
      },
      1100,
    );
    this.puff = mk(
      'fx_smoke',
      {
        lifespan: 480,
        speed: { min: 20, max: 60 },
        angle: { min: 180, max: 360 },
        scale: { start: 0.55, end: 1.2 },
        alpha: { start: 0.75, end: 0 },
        tint: 0xa88d68,
      },
      90,
    );
    // burn.ts: soot from a burnt pizza (dark, slow, tall), the steam when a fire goes out
    this.soot = mk(
      'fx_smoke',
      {
        lifespan: 1900,
        speedY: { min: -80, max: -40 },
        speedX: { min: -18, max: 18 },
        scale: { start: 0.8, end: 2.4 },
        alpha: { start: 0.95, end: 0 },
        tint: [0x2b221f, 0x1c1614, 0x3a2f2a],
      },
      1500,
    );
    this.steam = mk(
      'fx_smoke',
      {
        lifespan: 1100,
        speedY: { min: -90, max: -50 },
        speedX: { min: -30, max: 30 },
        scale: { start: 0.5, end: 1.7 },
        alpha: { start: 0.8, end: 0 },
        tint: 0xffffff,
      },
      1195,
    );
    this.sparks = mk('fx_dot', {
      lifespan: 900,
      speedY: { min: -60, max: -30 },
      speedX: { min: -14, max: 14 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff8a1f, 0xffc93c],
    });
  }

  chop(x: number, y: number, type: number) {
    (type === 0 ? this.chopDough : type === 1 ? this.chopTomato : this.chopCheese).explode(6, x, y);
  }
  dustPoof(x: number, y: number) {
    this.dust.explode(5, x, y);
  }
  bubbles(x: number, y: number) {
    this.foam.explode(5, x, y);
  }
  flourPuff(x: number, y: number) {
    this.flour.explode(10, x, y);
  }
  confettiBurst(x: number, y: number) {
    this.confetti.explode(30, x, y);
  }
  starBurst(x: number, y: number, n = 5) {
    this.stars.explode(n, x, y);
  }
  smokePuff(x: number, y: number) {
    this.smoke.explode(1, x, y);
  }
  ember(x: number, y: number) {
    this.sparks.explode(1, x, y);
  }
  sootPuff(x: number, y: number, n = 1) {
    this.soot.explode(n, x, y);
  }
  steamPuff(x: number, y: number, n = 6) {
    this.steam.explode(n, x, y);
  }
  /** One puff of extinguisher foam flying from (x, y) to (tx, ty), growing and fading: the stream is a few of these a frame apart. */
  spray(x: number, y: number, tx: number, ty: number) {
    const p = this.scene.add
      .image(x, y, 'fx_smoke')
      .setTint(Phaser.Math.RND.pick([0xffffff, 0xd6f0ff, 0x9fdcf5]))
      .setDepth(2450)
      .setScale(0.45)
      .setAlpha(1);
    const jx = (Math.random() - 0.5) * 26,
      jy = (Math.random() - 0.5) * 26;
    this.scene.tweens.add({
      targets: p,
      x: tx + jx,
      y: ty + jy,
      scale: 1.2 + Math.random() * 0.5,
      alpha: 0,
      duration: 380,
      ease: 'cubic.out',
      onComplete: () => p.destroy(),
    });
  }

  ring(x: number, y: number, color: number, from = 0.4, to = 1.6) {
    const r = this.scene.add.image(x, y, 'fx_ring').setTint(color).setDepth(1150).setScale(from);
    this.scene.tweens.add({ targets: r, scale: to, alpha: 0, duration: 450, ease: 'cubic.out', onComplete: () => r.destroy() });
  }

  // "+20": pop 1.4 -> 1 in 120 ms, rise 60 px in 800 ms, then fade
  float(x: number, y: number, text: string, color: string, size = 48) {
    const t = makeText(this.scene, x, y, text, { size, color, depth: 2400 }).setScale(1.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'back.out' });
    this.scene.tweens.add({ targets: t, y: y - 60, duration: 800, ease: 'cubic.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 600, duration: 300, onComplete: () => t.destroy() });
  }

  // Short grey puffs left behind by a dash, pushed against the run direction
  dashDust(x: number, y: number) {
    this.puff.explode(2, x, y - 6);
    this.dust.explode(3, x, y);
  } // brown-grey: the floor is cream
  shake(ms: number, amp: number) {
    if (shakeOn()) this.scene.cameras.main.shake(ms, amp);
  }
}
