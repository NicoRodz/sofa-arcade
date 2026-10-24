// Generated particle/prop textures and the juice manager (particles, floating numbers, shake).
import Phaser from 'phaser';
import { C, FONT, hexNum } from './tokens';
import { circle, drawOutlined, makeTex, rr, star, vgrad } from './gfx';

export function buildFxTextures(scene: Phaser.Scene) {
  makeTex(scene, 'fx_dot', { w: 12, h: 12 }, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); });
  makeTex(scene, 'fx_flour', { w: 10, h: 10 }, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); });
  makeTex(scene, 'fx_star', { w: 30, h: 30 }, (c) => { drawOutlined(c, () => star(c, 0, 0, 12, 5.2), C.cheese, { lw: 2.5 }); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(-3, -3, 2, 0, Math.PI * 2); c.fill(); });
  makeTex(scene, 'fx_smoke', { w: 40, h: 40 }, (c) => {
    const g = c.createRadialGradient(0, 0, 1, 0, 0, 14);
    g.addColorStop(0, 'rgba(200,192,184,0.95)'); g.addColorStop(0.7, 'rgba(190,182,174,0.55)'); g.addColorStop(1, 'rgba(190,182,174,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill();
  });
  makeTex(scene, 'fx_confetti', { w: 12, h: 14 }, (c) => { c.fillStyle = '#fff'; rr(c, -3, -5, 6, 10, 1); c.fill(); });
  makeTex(scene, 'fx_ring', { w: 72, h: 72 }, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.stroke(); });
  makeTex(scene, 'fx_glow', { w: 80, h: 80 }, (c) => {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 38);
    g.addColorStop(0, 'rgba(255,200,80,0.85)'); g.addColorStop(0.5, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,90,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.fill();
  });
  for (const [i, h] of [[0, 30], [1, 38], [2, 26]] as const) {
    makeTex(scene, `flame_${i}`, { w: 30, h: 46, ox: 15, oy: 44 }, (c) => {
      const f = (s: number, col: string) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-12 * s, -4 * s, -10 * s, -h * 0.55 * s, -2 * s, -h * s);
        c.bezierCurveTo(0 * s, -h * 0.6 * s, 10 * s, -h * 0.55 * s, 12 * s, -4 * s); c.bezierCurveTo(9 * s, 2 * s, -9 * s, 2 * s, 0, 0); c.closePath(); c.fill();
      };
      f(1, C.fire); f(0.66, C.fire2); f(0.34, '#FFF3B0');
      c.strokeStyle = 'rgba(120,30,0,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-12, -4, -10, -h * 0.55, -2, -h); c.bezierCurveTo(0, -h * 0.6, 10, -h * 0.55, 12, -4); c.stroke();
    });
  }
  makeTex(scene, 'knife', { w: 64, h: 24 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-8, -7); c.lineTo(22, -6); c.quadraticCurveTo(30, -2, 26, 4); c.lineTo(-8, 5); c.closePath(); }, vgrad(c, -7, 5, '#F2F6F8', C.steel2), { lw: 2.2, shadow: [0, 9, 22, 3] });
    drawOutlined(c, () => rr(c, -26, -6, 20, 11, 4), '#6B3F22', { lw: 2.2 });
    c.fillStyle = C.steel2; c.beginPath(); c.arc(-21, -0.5, 1.2, 0, Math.PI * 2); c.arc(-13, -0.5, 1.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-2, -4); c.lineTo(20, -4); c.stroke();
  });
  makeTex(scene, 'bell', { w: 72, h: 64, oy: 52 }, (c) => {
    c.fillStyle = 'rgba(60,30,10,0.28)'; c.beginPath(); c.ellipse(0, 3, 32, 6, 0, 0, Math.PI * 2); c.fill();
    drawOutlined(c, () => rr(c, -30, -8, 60, 11, 5), vgrad(c, -8, 3, '#FFD86B', '#D9A21F'), { lw: 3 });
    const dome = () => { c.beginPath(); c.moveTo(-25, -8); c.arc(0, -8, 25, Math.PI, 0); c.closePath(); };
    drawOutlined(c, dome, vgrad(c, -33, -8, '#FFE58A', '#E3A81C'), { lw: 3 });
    drawOutlined(c, circle(c, 0, -37, 5), '#FFD23F', { lw: 2.5 });
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3.5; c.beginPath(); c.arc(0, -8, 19, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  });
  makeTex(scene, 'arrow', { w: 60, h: 56 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-24, -9); c.lineTo(2, -9); c.lineTo(2, -21); c.lineTo(26, 0); c.lineTo(2, 21); c.lineTo(2, 9); c.lineTo(-24, 9); c.closePath(); }, vgrad(c, -21, 21, '#FF6A5A', C.tomato), { lw: 3.5 });
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-20, -6, 20, 3);
  });
  makeTex(scene, 'bar_bg', { w: 70, h: 18 }, (c) => { rr(c, -33, -7, 66, 14, 7); c.fillStyle = C.ink; c.fill(); c.fillStyle = 'rgba(255,255,255,0.12)'; rr(c, -30, -5, 60, 3, 1.5); c.fill(); });
  makeTex(scene, 'bar_fill', { w: 64, h: 12, ox: 0, oy: 6 }, (c) => { rr(c, 0, -4, 60, 8, 4); c.fillStyle = vgrad(c, -4, 4, '#FFFFFF', '#BFBFBF'); c.fill(); c.fillStyle = 'rgba(255,255,255,0.55)'; rr(c, 3, -3, 54, 2.4, 1.2); c.fill(); });
  makeTex(scene, 'coin', { w: 96, h: 96 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(2, 6, 42, 42, 0, 0, Math.PI * 2); c.fill();
    drawOutlined(c, circle(c, 0, 0, 40), vgrad(c, -40, 40, '#FFE46A', C.cheese2), { lw: 5 });
    c.strokeStyle = 'rgba(160,100,0,0.55)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.stroke();
    drawOutlined(c, () => star(c, 0, 1, 21, 9), '#FFF6C2', { lw: 3.5 });
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 35, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
  });
  makeTex(scene, 'clock_bg', { w: 112, h: 112 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, 7, 50, 50, 0, 0, Math.PI * 2); c.fill();
    drawOutlined(c, circle(c, 0, 0, 48), vgrad(c, -48, 48, '#FFFBF0', '#F1E3C6'), { lw: 5 });
  });
  makeTex(scene, 'panel_score', { w: 340, h: 92, ox: 0, oy: 46 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)'; rr(c, 4, -36, 316, 80, 40); c.fill();
    drawOutlined(c, () => rr(c, 2, -40, 316, 80, 40), vgrad(c, -40, 40, '#FFF8E6', '#F1E0BF'), { lw: 5 });
  });
  makeTex(scene, 'ticket_bg', { w: 140, h: 104, ox: 70, oy: 0 }, (c) => {
    const w = 128, h = 90, x0 = -w / 2;
    const path = () => {
      c.beginPath(); c.moveTo(x0 + 10, 0); c.lineTo(x0 + w - 10, 0); c.quadraticCurveTo(x0 + w, 0, x0 + w, 10); c.lineTo(x0 + w, h - 6);
      const n = 8, sw = w / n;
      for (let i = 0; i < n; i++) { const xr = x0 + w - i * sw; c.lineTo(xr - sw / 2, h + 4); c.lineTo(xr - sw, h - 6); }
      c.lineTo(x0, 10); c.quadraticCurveTo(x0, 0, x0 + 10, 0); c.closePath();
    };
    c.save(); c.translate(2, 6); path(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill(); c.restore();
    drawOutlined(c, path, vgrad(c, 0, h, '#FFF9EA', '#F6E8CB'), { lw: 3.5 });
    c.fillStyle = 'rgba(255,255,255,0.65)'; rr(c, x0 + 8, 3, w - 16, 3, 1.5); c.fill();
  });
}

// R7: screen shake is light and can be switched off (key S on the screen); the choice is remembered.
const SHAKE_KEY = 'pg.shake';
let shakeEnabled = true;
try { shakeEnabled = localStorage.getItem(SHAKE_KEY) !== '0'; } catch { /* storage blocked: shake stays on */ }
export const shakeOn = () => shakeEnabled;
export function toggleShake(): boolean {
  shakeEnabled = !shakeEnabled;
  try { localStorage.setItem(SHAKE_KEY, shakeEnabled ? '1' : '0'); } catch { /* ignore */ }
  return shakeEnabled;
}

export const confettiColors = [0xe63b2e, 0x2f7de1, 0x3fa34d, 0xffc21a, 0x8e5cd9, 0xff7a1a, 0xff5fa2, 0x1fb5a8];

export interface TextOpts { size?: number; color?: string; stroke?: number; depth?: number }
export function makeText(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT, fontStyle: 'bold', fontSize: `${o.size ?? 48}px`, color: o.color ?? C.cream,
    stroke: C.ink, strokeThickness: o.stroke ?? Math.max(4, Math.round((o.size ?? 48) / 8)), resolution: 2,
  }).setOrigin(0.5).setDepth(o.depth ?? 2000);
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

  constructor(private scene: Phaser.Scene) {
    const mk = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = 1200) =>
      scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
    const bit = (tint: number) => ({ lifespan: 400, speed: { min: 80, max: 160 }, angle: { min: -170, max: -10 }, gravityY: 400, scale: { start: 0.9, end: 0.3 }, alpha: { start: 1, end: 0 }, tint });
    this.chopDough = mk('fx_dot', bit(hexNum(C.dough)));
    this.chopTomato = mk('fx_dot', bit(hexNum(C.tomato)));
    this.chopCheese = mk('fx_dot', bit(hexNum(C.cheese)));
    this.dust = mk('fx_dot', { ...bit(0xffffff), speed: { min: 40, max: 90 }, lifespan: 300 });
    this.foam = mk('fx_ring', { lifespan: 650, speed: { min: 30, max: 90 }, angle: { min: -160, max: -20 }, gravityY: -40, scale: { start: 0.12, end: 0.28 }, alpha: { start: 0.9, end: 0 }, tint: [0xffffff, 0x9be0ff] });
    this.flour = mk('fx_flour', { lifespan: 500, speed: { min: 60, max: 100 }, angle: { min: 0, max: 360 }, scale: { start: 1.3, end: 0.4 }, alpha: { start: 0.8, end: 0 } });
    this.confetti = mk('fx_confetti', {
      lifespan: 1300, speed: { min: 180, max: 420 }, angle: { min: -140, max: -40 }, gravityY: 620, rotate: { start: 0, end: 540 },
      scale: { start: 1.2, end: 0.9 }, alpha: { start: 1, end: 0, ease: 'cubic.in' }, tint: confettiColors,
    });
    this.stars = mk('fx_star', { lifespan: 700, speed: { min: 90, max: 200 }, angle: { min: -150, max: -30 }, gravityY: 300, rotate: { start: 0, end: 200 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 1, end: 0 } });
    this.smoke = mk('fx_smoke', { lifespan: 1400, speedY: { min: -50, max: -28 }, speedX: { min: -10, max: 10 }, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.6, end: 0 } }, 1100);
    this.puff = mk('fx_smoke', { lifespan: 480, speed: { min: 20, max: 60 }, angle: { min: 180, max: 360 }, scale: { start: 0.55, end: 1.2 }, alpha: { start: 0.75, end: 0 }, tint: 0xa88d68 }, 90);
    this.sparks = mk('fx_dot', { lifespan: 900, speedY: { min: -60, max: -30 }, speedX: { min: -14, max: 14 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xff8a1f, 0xffc93c] });
  }

  chop(x: number, y: number, type: number) { (type === 0 ? this.chopDough : type === 1 ? this.chopTomato : this.chopCheese).explode(6, x, y); }
  dustPoof(x: number, y: number) { this.dust.explode(5, x, y); }
  bubbles(x: number, y: number) { this.foam.explode(5, x, y); }
  flourPuff(x: number, y: number) { this.flour.explode(10, x, y); }
  confettiBurst(x: number, y: number) { this.confetti.explode(30, x, y); }
  starBurst(x: number, y: number, n = 5) { this.stars.explode(n, x, y); }
  smokePuff(x: number, y: number) { this.smoke.explode(1, x, y); }
  ember(x: number, y: number) { this.sparks.explode(1, x, y); }

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
  dashDust(x: number, y: number) { this.puff.explode(2, x, y - 6); this.dust.explode(3, x, y); } // brown-grey: the floor is cream
  shake(ms: number, amp: number) { if (shakeOn()) this.scene.cameras.main.shake(ms, amp); }
}

