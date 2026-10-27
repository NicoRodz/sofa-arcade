// Top strip: order tickets, round clock, team score; plus the big centre banners (countdown, time up).
import type Phaser from 'phaser';
import type { Game } from '../../sim/overcooked';
import type { Recipe } from '../../sim/recipes/defs';
import type { TeamInfo } from '@pichi/core/lobby/teams';
import { C, H, W, hexNum, timerColor } from '@pichi/screen-kit/art/tokens';
import { R } from '@pichi/screen-kit/art/gfx';
import { Bar, place } from './stations';
import { recipeParts } from './food/ticket';
import { birthdayParts, trayParts, type Tray } from './food/ticket-tray';
import { MARGIN_MS } from '../../sim/recipes/bandeja';
import { cardIntro } from './food/card-intro';
import { makeText } from '@pichi/screen-kit/art/fx';
import { MAX_TICKETS, TICKET_SHAKE_AT, TICKET_WIDTH, VS_TICKET_MAX_X, clockText, ticketXs } from './layout';
import { VersusHud } from './versus-hud';

const TICKET_W = TICKET_WIDTH;

// Versus: who plays for whom and the host's options for the round (the sim does not need them, the HUD does).
// school: the Cocina escuela (no clock, no score, no order strip: the TV overlay of screen/src/tutorial draws the checks instead)
export interface RoundView {
  teams: readonly TeamInfo[] | null;
  hiddenScore: boolean;
  school?: true;
}
const NO_VIEW: RoundView = { teams: null, hiddenScore: false };
// Twin queues share order ids, so a ticket is keyed by team too (team 0 / coop: the order id itself).
export const ticketKey = (order: number, team = 0) => team * 1_000_000 + order;

interface Ticket {
  id: number;
  team: number;
  vip: boolean;
  bg: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Graphics; // the golden border of a VIP order
  root: Phaser.GameObjects.Container;
  bar: Bar;
  tray?: Tray; // a Bandeja: its three plates
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
  readonly vs: VersusHud | null; // versus: the scoreboard, the golden order card and the notices
  readonly expired = new Set<number>(); // ticket keys (see ticketKey) of the orders that ran out of patience

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: RoundView = NO_VIEW,
  ) {
    const D = 2000;
    this.clockImg = scene.add
      .image(W / 2, 52, 'clock_bg')
      .setScale((88 / 96 / R) * 1.0)
      .setDepth(D);
    this.clockG = scene.add.graphics().setDepth(D + 1);
    this.clockTxt = makeText(scene, W / 2, 54, '3:00', { size: 28, color: C.ink, stroke: 0, depth: D + 2 });
    this.panel = scene.add
      .image(1552, 52, 'panel_score')
      .setOrigin(0, 0.5)
      .setScale(1 / R)
      .setDepth(D);
    this.coin = scene.add
      .image(1600, 52, 'coin')
      .setScale(84 / 96 / R)
      .setDepth(D + 1);
    this.scoreTxt = makeText(scene, 1770, 54, '0', { size: 56, color: C.ink, stroke: 0, depth: D + 2 });
    this.dim = scene.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.35)
      .setDepth(1900)
      .setVisible(false);
    // R15: the tip multiplier, left of the score. Hidden at x1.
    this.streakBg = scene.add.graphics();
    const label = makeText(scene, 0, -19, 'RACHA', { size: 15, color: C.cream, stroke: 3, depth: 0 });
    this.streakTxt = makeText(scene, 0, 8, 'x2', { size: 40, color: C.cream, stroke: 6, depth: 0 });
    this.streakBox = scene.add
      .container(1462, 52, [this.streakBg, label, this.streakTxt])
      .setDepth(D + 1)
      .setVisible(false);
    this.vs = game.versus ? new VersusHud(scene, game, view) : null;
    if (this.vs) for (const o of [this.panel, this.coin, this.scoreTxt]) o.setVisible(false); // the coop score panel gives way to one plate per team
    if (view.school) for (const o of [this.clockImg, this.clockG, this.clockTxt, this.panel, this.coin, this.scoreTxt]) o.setVisible(false); // the school has no clock and no score
  }

  // R15: pops when the multiplier goes up, shakes and drops out when the streak is lost.
  streak(n: number, mult: number) {
    const was = this.streakMult;
    this.streakMult = mult;
    const box = this.streakBox;
    this.scene.tweens.killTweensOf(box);
    if (n === 0) {
      if (was > 1)
        this.scene.tweens.add({
          targets: box,
          angle: { from: -9, to: 9 },
          duration: 60,
          yoyo: true,
          repeat: 3,
          onComplete: () => {
            box.setVisible(false).setAngle(0);
          },
        });
      return;
    }
    if (mult < 2) {
      box.setVisible(false);
      return;
    }
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

  private makeTicket(id: number, recipe: Recipe, team: number, vip: boolean, birthday = false, parts?: readonly Recipe[]): Ticket {
    const tray = parts && trayParts(this.scene, parts);
    const s = this.scene;
    const bg = s.add
      .image(0, 0, 'ticket_bg')
      .setOrigin(0.5, 0)
      .setScale(1 / R);
    const bar = new Bar(s, 100);
    bar.root.setPosition(0, 17);
    const num = makeText(s, -48, 74, `#${id + 1}`, { size: 14, color: C.muted, stroke: 0, depth: 0 });
    bar.root.setVisible(true);
    const frame = s.add.graphics().setVisible(vip);
    frame.lineStyle(7, hexNum(C.cheese2), 1).strokeRoundedRect(-62, 3, 124, 96, 10);
    frame.lineStyle(3, hexNum(C.cheese), 1).strokeRoundedRect(-62, 3, 124, 96, 10);
    const extra = birthday ? birthdayParts(s, frame) : []; // the "Pedido de cumpleaños" (midround.ts): a pink ticket with a pink frame, a balloon and what it pays
    const root = s.add
      .container(W + 200, 6, [bg, frame, bar.root, ...(tray ? tray.objects : recipeParts(s, recipe)), num, ...extra])
      .setDepth(2100 + id * 0.001);
    root.setAngle((id % 3) - 1);
    if (vip) bg.setTint(hexNum(C.cheese));
    else if (birthday) bg.setTint(0xffc9e2);
    const t: Ticket = { id, team, vip, bg, frame, root, bar, ...(tray ? { tray } : {}), x: NaN, enter: { v: 0 }, leaving: false };
    s.tweens.add({ targets: t.enter, v: 1, duration: 300, ease: 'back.out' });
    return t;
  }

  private leave(t: Ticket, how: 'deliver' | 'expire') {
    t.leaving = true;
    const r = t.root;
    if (how === 'deliver') {
      this.scene.tweens.add({ targets: r, y: r.y - 120, alpha: 0, duration: 450, ease: 'cubic.in', onComplete: () => r.destroy() });
    } else {
      r.each((o: Phaser.GameObjects.GameObject) => {
        if ((o as Phaser.GameObjects.Image).setTint && o.type === 'Image') (o as Phaser.GameObjects.Image).setTint(hexNum(C.danger));
      });
      this.scene.tweens.add({
        targets: r,
        y: r.y + 280,
        angle: r.angle + 35,
        alpha: 0,
        duration: 650,
        ease: 'cubic.in',
        onComplete: () => r.destroy(),
      });
    }
  }

  orderWarning(key: number) {
    const t = this.tickets.get(key);
    if (t) this.scene.tweens.add({ targets: t.root, scale: 1.12, duration: 110, yoyo: true, repeat: 1 });
  }
  clockPulse() {
    this.pulse = 1.15;
  }
  ticketCenter(key: number) {
    const t = this.tickets.get(key);
    return t ? { x: t.root.x, y: t.root.y + 60 } : { x: 400, y: 120 };
  }

  private banner_(text: string, size: number, color: string, hold: number, out = 400) {
    this.banner?.destroy();
    const b = makeText(this.scene, W / 2, H / 2 - 20, text, { size, color, stroke: Math.round(size / 13), depth: 2600 })
      .setScale(2)
      .setAlpha(0);
    this.banner = b;
    this.scene.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 300, ease: 'back.out' });
    this.scene.tweens.add({
      targets: b,
      scale: 1.35,
      alpha: 0,
      delay: 300 + hold,
      duration: out,
      ease: 'cubic.in',
      onComplete: () => {
        b.destroy();
        if (this.banner === b) this.banner = undefined;
      },
    });
  }
  private intro?: Phaser.GameObjects.Container; // the card of the day, shown under the countdown
  countdown(n: number) {
    if (n > 0 && this.game.rec && !this.intro) {
      this.intro = cardIntro(this.scene, this.game.rec, this.game.difficulty);
      this.scene.tweens.add({ targets: this.intro, alpha: 1, duration: 250 });
    }
    if (n > 0) {
      this.dim.setVisible(true).setAlpha(0.35);
      this.banner_(String(n), 240, C.cream, 300, 400);
    } else {
      this.banner_('¡A COCINAR!', 150, C.tomato, 450, 400);
      this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 500, onComplete: () => this.dim.setVisible(false) });
      if (this.intro) {
        const i = this.intro;
        this.intro = undefined;
        this.scene.tweens.add({ targets: i, alpha: 0, y: i.y + 60, delay: 400, duration: 400, onComplete: () => i.destroy() });
      }
    }
  }
  timeUp() {
    this.banner_('¡TIEMPO!', 210, C.tomato, 450, 300);
  }

  update(dtMs: number) {
    this.t += dtMs;
    if (this.view.school) return; // no tickets, no clock, no score
    const g = this.game;
    // tickets: one strip in coop; versus has one per team (the right one mirrored), each with its own queue
    const vs = g.versus;
    const queues = vs ? g.teams.map((t) => ({ team: t.id, orders: t.orders })) : [{ team: 0, orders: g.orders }];
    const live = new Set<number>();
    for (const q of queues)
      for (const o of q.orders.slice(0, MAX_TICKETS)) {
        const key = ticketKey(o.id, q.team);
        live.add(key);
        if (!this.tickets.has(key)) this.tickets.set(key, this.makeTicket(o.id, o.recipe, q.team, !!o.vip, !!o.birthday, o.parts));
      }
    for (const [key, t] of this.tickets) {
      if (!live.has(key) && !t.leaving) {
        this.leave(t, this.expired.has(key) ? 'expire' : 'deliver');
      }
      if (t.leaving && !t.root.active) this.tickets.delete(key);
    }
    for (const q of queues) {
      const shown = q.orders.slice(0, MAX_TICKETS);
      const base = vs ? ticketXs(shown.length, 28, VS_TICKET_MAX_X) : ticketXs(shown.length);
      const xs = vs && q.team === 1 ? base.map((x) => W - x - TICKET_W) : base;
      shown.forEach((o, i) => {
        const t = this.tickets.get(ticketKey(o.id, q.team))!;
        const target = xs[i]!;
        t.x = Number.isNaN(t.x) ? target : t.x + (target - t.x) * Math.min(1, dtMs / 90);
        const left = (o.expiresAt - g.time) / g.params.orderTtlMs;
        t.bar.set(left, timerColor(left));
        t.tray?.set(o.served, o.firstAt === undefined ? null : o.firstAt + MARGIN_MS[g.difficulty] - g.time);
        if (t.vip !== !!o.vip) {
          t.vip = !!o.vip;
          t.frame.setVisible(t.vip);
          if (t.vip) t.bg.setTint(hexNum(C.cheese));
          else t.bg.clearTint();
        } // the golden order turns normal when the rival wins it
        const shake = left < TICKET_SHAKE_AT ? Math.sin(this.t / 28 + o.id) * 2.2 : 0;
        const slide = (1 - t.enter.v) * 480 * (vs && q.team === 1 ? -1 : 1);
        t.root.x = t.x + TICKET_W / 2 + slide + shake;
      });
    }
    // clock
    const total = g.params.roundMs;
    const left = g.countdown > 0 ? total : Math.max(0, total - g.time);
    const frac = left / total;
    const sec = Math.ceil(left / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.clockTxt.setText(clockText(left));
    }
    this.pulse += (1 - this.pulse) * Math.min(1, dtMs / 120);
    const danger = left <= 10_000 && g.countdown <= 0;
    const col = danger ? C.danger : timerColor(frac * 1.6 > 1 ? 1 : frac * 1.6);
    this.clockTxt.setColor(danger ? C.danger : C.ink);
    this.clockImg.setScale((88 / 96 / R) * this.pulse);
    this.clockTxt.setScale(this.pulse);
    const cg = this.clockG;
    cg.clear();
    cg.lineStyle(9, 0x2b1b17, 0.14).strokeCircle(W / 2, 52, 36);
    if (frac > 0.002) {
      cg.lineStyle(9, hexNum(col), 1);
      cg.beginPath();
      cg.arc(W / 2, 52, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      cg.strokePath();
    }
    // score
    if (vs) this.vs!.update(dtMs, left, g.countdown <= 0);
    else if (g.score !== this.lastScore) {
      if (g.score > this.lastScore) {
        const o = { k: 1.25 };
        this.scene.tweens.add({
          targets: o,
          k: 1,
          duration: 220,
          ease: 'back.out',
          onUpdate: () => {
            this.coin.setScale((84 / 96 / R) * o.k);
            this.scoreTxt.setScale(o.k);
          },
        });
      }
      this.lastScore = g.score;
    }
    if (!vs) {
      this.shown += (g.score - this.shown) * Math.min(1, dtMs / 160);
      if (Math.abs(g.score - this.shown) < 0.5) this.shown = g.score;
      this.scoreTxt.setText(String(Math.round(this.shown)));
    }
  }

  destroy() {
    for (const t of this.tickets.values()) t.root.destroy();
    this.tickets.clear();
    this.intro?.destroy();
    for (const o of [
      this.clockG,
      this.clockImg,
      this.clockTxt,
      this.coin,
      this.scoreTxt,
      this.panel,
      this.dim,
      this.banner,
      this.streakBox,
    ])
      o?.destroy();
    this.vs?.destroy();
  }
}
