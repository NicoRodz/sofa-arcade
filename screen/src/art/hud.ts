// Top strip: order tickets, round clock, team score; plus the big centre banners (countdown, time up).
import Phaser from 'phaser';
import type { Game } from '@party/shared/game';
import { C, H, W, hexNum, timerColor } from './tokens';
import { R } from './gfx';
import { foodKey } from './food';
import { Bar, place } from './stations';
import { makeText } from './fx';
import { TICKET_WIDTH, clockText, ticketXs } from './layout';

const TICKET_W = TICKET_WIDTH;

interface Ticket {
  id: number;
  root: Phaser.GameObjects.Container;
  bar: Bar;
  x: number; // current left edge, smoothed
  enter: { v: number };
  leaving: boolean;
}

export class Hud {
  private tickets = new Map<number, Ticket>();
  private clockG: Phaser.GameObjects.Graphics;
  private clockImg: Phaser.GameObjects.Image;
  private clockTxt: Phaser.GameObjects.Text;
  private coin: Phaser.GameObjects.Image;
  private scoreTxt: Phaser.GameObjects.Text;
  private shown = 0;
  private lastScore = 0;
  private panel: Phaser.GameObjects.Image;
  private dim: Phaser.GameObjects.Rectangle;
  private banner?: Phaser.GameObjects.Text;
  private streakBox: Phaser.GameObjects.Container;
  private streakBg: Phaser.GameObjects.Graphics;
  private streakTxt: Phaser.GameObjects.Text;
  private streakMult = 1;
  private t = 0;
  private lastSecond = -1;
  private pulse = 1;
  readonly expired = new Set<number>();

  constructor(private scene: Phaser.Scene, private game: Game) {
    const D = 2000;
    this.clockImg = scene.add.image(W / 2, 52, 'clock_bg').setScale(88 / 96 / R * 1.0).setDepth(D);
    this.clockG = scene.add.graphics().setDepth(D + 1);
    this.clockTxt = makeText(scene, W / 2, 54, '3:00', { size: 28, color: C.ink, stroke: 0, depth: D + 2 });
    this.panel = scene.add.image(1552, 52, 'panel_score').setOrigin(0, 0.5).setScale(1 / R).setDepth(D);
    this.coin = scene.add.image(1600, 52, 'coin').setScale(84 / 96 / R).setDepth(D + 1);
    this.scoreTxt = makeText(scene, 1770, 54, '0', { size: 56, color: C.ink, stroke: 0, depth: D + 2 });
    this.dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35).setDepth(1900).setVisible(false);
    // R15: the tip multiplier, left of the score. Hidden at x1.
    this.streakBg = scene.add.graphics();
    const label = makeText(scene, 0, -19, 'RACHA', { size: 15, color: C.cream, stroke: 3, depth: 0 });
    this.streakTxt = makeText(scene, 0, 8, 'x2', { size: 40, color: C.cream, stroke: 6, depth: 0 });
    this.streakBox = scene.add.container(1462, 52, [this.streakBg, label, this.streakTxt]).setDepth(D + 1).setVisible(false);
  }

  // R15: pops when the multiplier goes up, shakes and drops out when the streak is lost.
  streak(n: number, mult: number) {
    const was = this.streakMult;
    this.streakMult = mult;
    const box = this.streakBox;
    this.scene.tweens.killTweensOf(box);
    if (n === 0) {
      if (was > 1) this.scene.tweens.add({ targets: box, angle: { from: -9, to: 9 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => { box.setVisible(false).setAngle(0); } });
      return;
    }
    if (mult < 2) { box.setVisible(false); return; }
    const col = mult >= 4 ? C.tomato : mult === 3 ? C.fire : C.cheese2;
    this.streakTxt.setText(`x${mult}`);
    const g = this.streakBg;
    g.clear();
    g.fillStyle(0x2b1b17, 0.28).fillRoundedRect(-62, -26, 128, 60, 28);
    g.fillStyle(hexNum(col), 1).fillRoundedRect(-64, -30, 128, 60, 28);
    g.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(-64, -30, 128, 60, 28);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-52, -25, 104, 7, 3);
    box.setVisible(true).setAngle(0).setScale(1.5);
    this.scene.tweens.add({ targets: box, scale: 1, duration: 260, ease: 'back.out' });
  }

  private makeTicket(id: number, recipe: 'marinara' | 'margarita'): Ticket {
    const s = this.scene;
    const bg = s.add.image(0, 0, 'ticket_bg').setOrigin(0.5, 0).setScale(1 / R);
    const bar = new Bar(s, 100); bar.root.setPosition(0, 17);
    const q = recipe === 'margarita'; // Margarita: three ingredient icons, the pizza with cheese
    const pizza = place(s, foodKey(q ? 'pizza_done_q' : 'pizza_done'), -27, 57, 1);
    const dough = place(s, foodKey('dough_str'), 30, q ? 35 : 46, 1);
    const tomato = place(s, foodKey('tomato_cut'), 30, q ? 58 : 72, 1);
    const cheese = q ? place(s, foodKey('cheese_cut'), 30, 81, 1) : null;
    const num = makeText(s, -48, 74, `#${id + 1}`, { size: 14, color: C.muted, stroke: 0, depth: 0 });
    pizza.setScale(0.86 / R); dough.setScale((q ? 0.42 : 0.5) / R); tomato.setScale((q ? 0.44 : 0.52) / R); cheese?.setScale(0.42 / R);
    bar.root.setVisible(true);
    const root = s.add.container(W + 200, 6, [bg, bar.root, pizza, dough, tomato, ...(cheese ? [cheese] : []), num]).setDepth(2100 + id * 0.001);
    root.setAngle((id % 3) - 1);
    const t: Ticket = { id, root, bar, x: NaN, enter: { v: 0 }, leaving: false };
    s.tweens.add({ targets: t.enter, v: 1, duration: 300, ease: 'back.out' });
    return t;
  }

  private leave(t: Ticket, how: 'deliver' | 'expire') {
    t.leaving = true;
    const r = t.root;
    if (how === 'deliver') {
      this.scene.tweens.add({ targets: r, y: r.y - 120, alpha: 0, duration: 450, ease: 'cubic.in', onComplete: () => r.destroy() });
    } else {
      r.each((o: Phaser.GameObjects.GameObject) => { if ((o as Phaser.GameObjects.Image).setTint && o.type === 'Image') (o as Phaser.GameObjects.Image).setTint(hexNum(C.danger)); });
      this.scene.tweens.add({ targets: r, y: r.y + 280, angle: r.angle + 35, alpha: 0, duration: 650, ease: 'cubic.in', onComplete: () => r.destroy() });
    }
  }

  orderWarning(id: number) {
    const t = this.tickets.get(id);
    if (t) this.scene.tweens.add({ targets: t.root, scale: 1.12, duration: 110, yoyo: true, repeat: 1 });
  }
  clockPulse() { this.pulse = 1.15; }
  ticketCenter(id: number) { const t = this.tickets.get(id); return t ? { x: t.root.x, y: t.root.y + 60 } : { x: 400, y: 120 }; }

  private banner_(text: string, size: number, color: string, hold: number, out = 400) {
    this.banner?.destroy();
    const b = makeText(this.scene, W / 2, H / 2 - 20, text, { size, color, stroke: Math.round(size / 13), depth: 2600 }).setScale(2).setAlpha(0);
    this.banner = b;
    this.scene.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 300, ease: 'back.out' });
    this.scene.tweens.add({ targets: b, scale: 1.35, alpha: 0, delay: 300 + hold, duration: out, ease: 'cubic.in', onComplete: () => { b.destroy(); if (this.banner === b) this.banner = undefined; } });
  }
  countdown(n: number) {
    if (n > 0) { this.dim.setVisible(true).setAlpha(0.35); this.banner_(String(n), 240, C.cream, 300, 400); }
    else {
      this.banner_('¡A COCINAR!', 150, C.tomato, 450, 400);
      this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 500, onComplete: () => this.dim.setVisible(false) });
    }
  }
  timeUp() { this.banner_('¡TIEMPO!', 210, C.tomato, 450, 300); }

  update(dtMs: number) {
    this.t += dtMs;
    const g = this.game;
    // tickets
    const live = g.orders.map((o) => o.id);
    for (const o of g.orders) if (!this.tickets.has(o.id)) this.tickets.set(o.id, this.makeTicket(o.id, o.recipe));
    for (const [id, t] of this.tickets) {
      if (!live.includes(id) && !t.leaving) { this.leave(t, this.expired.has(id) ? 'expire' : 'deliver'); }
      if (t.leaving && !t.root.active) this.tickets.delete(id);
    }
    const xs = ticketXs(live.length);
    live.forEach((id, i) => {
      const t = this.tickets.get(id)!, o = g.orders[i]!;
      const target = xs[i]!;
      t.x = Number.isNaN(t.x) ? target : t.x + (target - t.x) * Math.min(1, dtMs / 90);
      const left = (o.expiresAt - g.time) / g.params.orderTtlMs;
      t.bar.set(left, timerColor(left));
      const shake = left < 0.25 ? Math.sin(this.t / 28 + id) * 2.2 : 0;
      t.root.x = t.x + TICKET_W / 2 + (1 - t.enter.v) * 480 + shake;
    });
    // clock
    const total = g.params.roundMs;
    const left = g.countdown > 0 ? total : Math.max(0, total - g.time);
    const frac = left / total;
    const sec = Math.ceil(left / 1000);
    if (sec !== this.lastSecond) { this.lastSecond = sec; this.clockTxt.setText(clockText(left)); }
    this.pulse += (1 - this.pulse) * Math.min(1, dtMs / 120);
    const danger = left <= 10_000 && g.countdown <= 0;
    const col = danger ? C.danger : timerColor(frac * 1.6 > 1 ? 1 : frac * 1.6);
    this.clockTxt.setColor(danger ? C.danger : C.ink);
    this.clockImg.setScale((88 / 96 / R) * this.pulse); this.clockTxt.setScale(this.pulse);
    const cg = this.clockG; cg.clear();
    cg.lineStyle(9, 0x2b1b17, 0.14).strokeCircle(W / 2, 52, 36);
    if (frac > 0.002) {
      cg.lineStyle(9, hexNum(col), 1); cg.beginPath(); cg.arc(W / 2, 52, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false); cg.strokePath();
    }
    // score
    if (g.score !== this.lastScore) {
      if (g.score > this.lastScore) {
        const o = { k: 1.25 };
        this.scene.tweens.add({ targets: o, k: 1, duration: 220, ease: 'back.out', onUpdate: () => { this.coin.setScale((84 / 96 / R) * o.k); this.scoreTxt.setScale(o.k); } });
      }
      this.lastScore = g.score;
    }
    this.shown += (g.score - this.shown) * Math.min(1, dtMs / 160);
    if (Math.abs(g.score - this.shown) < 0.5) this.shown = g.score;
    this.scoreTxt.setText(String(Math.round(this.shown)));
  }

  destroy() {
    for (const t of this.tickets.values()) t.root.destroy();
    this.tickets.clear();
    for (const o of [this.clockG, this.clockImg, this.clockTxt, this.coin, this.scoreTxt, this.panel, this.dim, this.banner, this.streakBox]) o?.destroy();
  }
}
