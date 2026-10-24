// Versus HUD (F4): the scoreboard plates (score, handicap, streak, golden orders won), the golden order card on the barrier, the end
// reveal and the little notices (a chef dropped, the handicap changed). The order queues of each kitchen stay in hud.ts.
import Phaser from 'phaser';
import type { Game, Recipe } from '@party/shared/game';
import type { TeamInfo } from '@party/shared/teams';
import { VIP_TTL_MS } from '@party/shared/versus';
import { kText, scoreHidden, vipView } from '@party/shared/versusReport';
import { tipMultiplier } from '@party/shared/game';
import { C, H, OX, OY, TILE, W, hexNum, timerColor } from './tokens';
import { R } from './gfx';
import { foodKey } from './food';
import { Bar, place } from './stations';
import { makeText } from './fx';
import { VS_PLATE, vipCardAt } from './layout';

const D = 2000;
const chipLeft = (x0: number, mirror: boolean) => (mirror ? x0 + VS_PLATE.w - 16 - 128 : x0 + 16); // the streak and golden-order chips sit on the outer side of the plate
const rrect = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number) => g.fillRoundedRect(x, y, w, h, r);

interface Plate {
  g: Phaser.GameObjects.Graphics; // the plate itself (static)
  chips: Phaser.GameObjects.Graphics; // streak and golden-order chips (redrawn when they change)
  name: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
  k: Phaser.GameObjects.Text;
  streak: Phaser.GameObjects.Text;
  flame: Phaser.GameObjects.Image;
  vips: Phaser.GameObjects.Text;
  crown: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Graphics;
  shown: number; last: number; chipKey: string;
  x0: number; mirror: boolean;
}
interface Notice { text: Phaser.GameObjects.Text; ms: number }

export class VersusHud {
  private plates: Plate[] = [];
  private card: Phaser.GameObjects.Container;
  private cardBar: Bar;
  private cardPizza: Phaser.GameObjects.Image;
  private cardShown = false;
  private cardRecipe: Recipe | null = null;
  private announce?: Phaser.GameObjects.Text;
  private notices: Notice[] = [];
  private revealed = false;
  private winner: number | null = null;
  private t = 0;

  constructor(private scene: Phaser.Scene, private game: Game, private view: { teams: readonly TeamInfo[] | null; hiddenScore: boolean }) {
    for (const t of game.teams) this.plates.push(this.buildPlate(t.id));
    const k = game.kitchens;
    const centres = k ? k.regions.map((r) => {
      let sx = 0, sy = 0, n = 0;
      k.comp.forEach((row, y) => row.forEach((c, x) => { if (c === r) { sx += x + 0.5; sy += y + 0.5; n++; } }));
      return { x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
    }) : [{ x: 4, y: 4.5 }, { x: 12, y: 4.5 }];
    const at = vipCardAt(centres, 16, 9);
    const cx = OX + at.x * TILE, cy = OY + at.y * TILE;
    // the golden order card: sits on the barrier, between the two kitchens
    const bg = scene.add.graphics();
    bg.fillStyle(0x2b1b17, 0.3).fillRoundedRect(-98, -52, 204, 118, 22);
    bg.fillStyle(hexNum(C.cheese2), 1).fillRoundedRect(-102, -60, 204, 118, 22);
    bg.fillStyle(hexNum(C.cheese), 1).fillRoundedRect(-96, -54, 192, 106, 18);
    bg.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(-102, -60, 204, 118, 22);
    bg.fillStyle(0xffffff, 0.35).fillRoundedRect(-84, -50, 168, 8, 4);
    const label = makeText(scene, 0, -34, 'PEDIDO DORADO', { size: 22, color: C.ink, stroke: 0, depth: 0 });
    this.cardPizza = place(scene, foodKey('pizza_done'), -44, 4, 1.05).setScale(1.05 / R);
    const mult = makeText(scene, 42, 2, '×2', { size: 54, color: C.tomato, stroke: 8, depth: 0 });
    this.cardBar = new Bar(scene, 150); this.cardBar.root.setPosition(0, 40).setVisible(true);
    this.card = scene.add.container(cx, cy, [bg, label, this.cardPizza, mult, this.cardBar.root]).setDepth(1500).setVisible(false).setScale(0);
  }

  private buildPlate(id: number): Plate {
    const s = this.scene, info = this.view.teams?.[id];
    const { w, h, y, x } = VS_PLATE;
    const x0 = x[id] ?? x[0], mirror = id === 1;
    const col = hexNum(info?.color ?? '#888888');
    const g = s.add.graphics().setDepth(D);
    g.fillStyle(0x2b1b17, 0.3); rrect(g, x0 - 2, y + 6, w, h, 20);
    g.fillStyle(col, 1); rrect(g, x0, y, w, h, 20);
    g.fillStyle(0x000000, 0.18); rrect(g, x0, y + h * 0.62, w, h * 0.38, 20);
    g.fillStyle(col, 1); g.fillRect(x0 + 4, y + h * 0.62, w - 8, 10);
    g.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(x0, y, w, h, 20);
    g.fillStyle(0xffffff, 0.26); rrect(g, x0 + 14, y + 5, w - 28, 7, 3);
    // name and chips hug the outer edge, the score and the handicap face the clock: "▲ Picantes 340 | 2:15 | 410 Frescos ●"
    const outer = mirror ? x0 + w - 16 : x0 + 16, inner = mirror ? x0 + 16 : x0 + w - 16;
    const oo = mirror ? 1 : 0, io = mirror ? 0 : 1;
    const icon = `${info?.icon ?? ''}`;
    const name = makeText(s, outer, y + 25, `${icon} ${info?.name ?? `Equipo ${id + 1}`}`, { size: 26, color: C.cream, stroke: 5, depth: D + 2 }).setOrigin(oo, 0.5);
    const score = makeText(s, inner, y + 62, '0', { size: 48, color: C.cream, stroke: 7, depth: D + 2 }).setOrigin(io, 0.5);
    const k = makeText(s, inner, y + 25, '', { size: 24, color: C.cheese, stroke: 5, depth: D + 2 }).setOrigin(io, 0.5);
    const chipX = chipLeft(x0, mirror);
    const chips = s.add.graphics().setDepth(D + 1);
    const flame = place(s, 'flame_1', chipX + 14, y + 74, 1).setScale(0.3 / R).setDepth(D + 2).setVisible(false);
    const streak = makeText(s, chipX + 46, y + 61, '', { size: 24, color: C.cream, stroke: 4, depth: D + 2 });
    const vips = makeText(s, chipX + 106, y + 61, '', { size: 24, color: C.cheese, stroke: 4, depth: D + 2 });
    const crown = makeText(s, mirror ? x0 + w + 4 : x0 - 4, y + 14, '👑', { size: 40, depth: D + 4 }).setVisible(false).setAngle(mirror ? 16 : -16); // on the outer top corner of the plate
    const glow = s.add.graphics().setDepth(D - 1).setVisible(false);
    return { g, chips, name, score, k, streak, flame, vips, crown, glow, shown: 0, last: 0, chipKey: '', x0, mirror };
  }

  update(dtMs: number, leftMs: number, running: boolean) {
    this.t += dtMs;
    const g = this.game;
    const hide = !this.revealed && !g.over && scoreHidden(this.view.hiddenScore, running, leftMs);
    g.teams.forEach((t, i) => {
      const p = this.plates[i]!;
      if (t.score > p.last) {
        const o = { v: 1.25 };
        this.scene.tweens.add({ targets: o, v: 1, duration: 220, ease: 'back.out', onUpdate: () => p.score.setScale(o.v) });
      }
      p.last = t.score;
      p.shown += (t.score - p.shown) * Math.min(1, dtMs / 160);
      if (Math.abs(t.score - p.shown) < 0.5) p.shown = t.score;
      p.score.setText(hide ? '???' : String(Math.round(p.shown)));
      p.k.setText(kText(t.k));
      this.drawChips(p, t.streak, tipMultiplier(t.streak, g.params.tune), t.vips);
    });
    this.updateCard();
    this.updateGlow();
    for (const n of this.notices) { n.ms -= dtMs; if (n.ms < 400) n.text.setAlpha(Math.max(0, n.ms / 400)); }
    for (const n of this.notices.filter((x) => x.ms <= 0)) n.text.destroy();
    this.notices = this.notices.filter((x) => x.ms > 0);
    this.notices.forEach((n, i) => n.text.setY(150 + i * 40));
  }

  // The streak chip shows the tip multiplier the next delivery earns (dim at x1: nothing running) and the golden orders won are stars.
  private drawChips(p: Plate, streak: number, mult: number, vips: number) {
    const key = `${streak}|${mult}|${vips}`;
    if (key === p.chipKey) return;
    p.chipKey = key;
    const { y, h } = VS_PLATE;
    const chipX = chipLeft(p.x0, p.mirror);
    const g = p.chips; g.clear();
    const hot = mult >= 2;
    const col = mult >= 4 ? C.tomato : mult === 3 ? C.fire : C.cheese2;
    g.fillStyle(0x000000, hot ? 0.0 : 0.22); rrect(g, chipX, y + h - 36, 64, 28, 14);
    if (hot) { g.fillStyle(hexNum(col), 1); rrect(g, chipX, y + h - 36, 64, 28, 14); g.lineStyle(3, hexNum(C.ink), 1).strokeRoundedRect(chipX, y + h - 36, 64, 28, 14); }
    g.fillStyle(0x000000, vips ? 0 : 0.22); rrect(g, chipX + 72, y + h - 36, 56, 28, 14);
    if (vips) { g.fillStyle(hexNum(C.cheese2), 1); rrect(g, chipX + 72, y + h - 36, 56, 28, 14); g.lineStyle(3, hexNum(C.ink), 1).strokeRoundedRect(chipX + 72, y + h - 36, 56, 28, 14); }
    p.flame.setVisible(hot).setAlpha(1);
    p.streak.setText(`x${mult}`).setAlpha(hot ? 1 : 0.55).setColor(C.cream).setX(chipX + (hot ? 40 : 32));
    p.vips.setText(vips ? `★${vips}` : '★').setAlpha(vips ? 1 : 0.5).setColor(vips ? C.ink : C.cream).setX(chipX + 100);
    if (hot) this.scene.tweens.add({ targets: p.streak, scale: { from: 1.4, to: 1 }, duration: 240, ease: 'back.out' });
    if (vips) this.scene.tweens.add({ targets: p.vips, scale: { from: 1.4, to: 1 }, duration: 240, ease: 'back.out' });
  }

  private updateCard() {
    const g = this.game;
    const v = g.countdown > 0 || g.over ? null : vipView(g, VIP_TTL_MS);
    if (v && !this.cardShown) {
      this.cardShown = true;
      this.card.setVisible(true);
      this.scene.tweens.killTweensOf(this.card);
      this.scene.tweens.add({ targets: this.card, scale: 1, duration: 360, ease: 'back.out' });
    } else if (!v && this.cardShown) {
      this.cardShown = false;
      this.scene.tweens.killTweensOf(this.card);
      this.scene.tweens.add({ targets: this.card, scale: 0, duration: 260, ease: 'back.in', onComplete: () => { if (!this.cardShown) this.card.setVisible(false); } });
    }
    if (!v) return;
    if (v.recipe !== this.cardRecipe) { this.cardRecipe = v.recipe; this.cardPizza.setTexture(foodKey(v.recipe === 'margarita' ? 'pizza_done_q' : 'pizza_done')); }
    this.cardBar.set(v.fraction, timerColor(v.fraction));
    this.card.setAngle(Math.sin(this.t / 300) * (v.fraction < 0.25 ? 3 : 1.2));
  }

  /** The golden order appeared in every queue. */
  vipNew() {
    this.pop('¡Pedido dorado!', C.cheese, 0.8);
  }
  /** A team delivered it first: the whole screen says who. */
  vipWon(team: number, tie: boolean) {
    const info = this.view.teams?.[team];
    this.pop(tie ? '¡Pedido dorado para los dos!' : `¡Pedido dorado para ${info?.name ?? `el equipo ${team + 1}`}!`, info ? this.light(info.color) : C.cheese, 1.5);
    const p = this.plates[team];
    if (p) this.scene.tweens.add({ targets: [p.vips, p.chips], scale: { from: 1.3, to: 1 }, duration: 300, ease: 'back.out' });
  }
  /** The rival won it: this team's golden order is a normal one now. */
  vipLost(team: number) {
    const p = this.plates[team];
    if (!p) return;
    const t = makeText(this.scene, p.x0 + VS_PLATE.w / 2, VS_PLATE.y + VS_PLATE.h + 26, 'Dorado perdido', { size: 24, color: '#C9BBA7', depth: D + 3 });
    this.scene.tweens.add({ targets: t, y: t.y + 24, alpha: 0, duration: 1400, ease: 'cubic.out', onComplete: () => t.destroy() });
  }

  /** A short line under the HUD (a chef dropped, the handicap changed...). At most three at once. */
  notice(text: string, color: string = C.cream) {
    const t = makeText(this.scene, W / 2, 150, text, { size: 30, color, stroke: 6, depth: D + 5 }).setScale(1.3);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'back.out' });
    this.notices.push({ text: t, ms: 3200 });
    while (this.notices.length > 3) this.notices.shift()!.text.destroy();
  }

  private pop(text: string, color: string, holdS: number) {
    this.announce?.destroy();
    const t = makeText(this.scene, W / 2, H / 2 + 70, text, { size: 58, color, stroke: 10, depth: 2650 }).setScale(1.8).setAlpha(0);
    this.announce = t;
    this.scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'back.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 260 + holdS * 1000, duration: 380, ease: 'cubic.in', onComplete: () => { t.destroy(); if (this.announce === t) this.announce = undefined; } });
  }
  // team colours are dark (they have to stay apart from the chefs'): on the dark HUD text a lighter tone of the same hue reads better
  private light(hex: string): string {
    const n = hexNum(hex), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.55));
    return `#${[m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  /** The round is over: the scoreboard shows the real numbers (it was ??? for the last seconds) and the winner's plate lights up. */
  reveal(winner: number | null) {
    this.revealed = true;
    this.winner = winner;
    this.plates.forEach((p, i) => {
      this.scene.tweens.add({ targets: p.score, scale: { from: 1.6, to: 1 }, duration: 420, ease: 'back.out', delay: i * 160 });
      p.crown.setVisible(i === winner);
      if (i === winner) this.scene.tweens.add({ targets: p.crown, y: p.crown.y - 8, yoyo: true, repeat: -1, duration: 500, ease: 'sine.inOut' });
      else if (winner !== null) { p.g.setAlpha(0.7); p.name.setAlpha(0.7); p.score.setAlpha(0.7); }
    });
  }
  private updateGlow() {
    this.plates.forEach((p, i) => {
      const on = this.revealed && i === this.winner;
      p.glow.setVisible(on);
      if (!on) return;
      const { x0 } = p, { w, h, y } = VS_PLATE, a = 0.55 + Math.sin(this.t / 160) * 0.3;
      p.glow.clear().lineStyle(10, hexNum(C.cheese), a).strokeRoundedRect(x0 - 6, y - 6, w + 12, h + 12, 26);
    });
  }

  destroy() {
    for (const p of this.plates) for (const o of [p.g, p.chips, p.name, p.score, p.k, p.streak, p.flame, p.vips, p.crown, p.glow]) o.destroy();
    this.plates = [];
    this.card.destroy();
    this.announce?.destroy();
    for (const n of this.notices) n.text.destroy();
    this.notices = [];
  }
}
