// Versus HUD (F4): the scoreboard plates (score, handicap, streak, golden orders won), the golden order card on the barrier, the end
// reveal and the little notices (a chef dropped, the handicap changed). The order queues of each kitchen stay in hud.ts.
import type Phaser from 'phaser';
import type { TeamInfo } from '@pichi/core/lobby';
import { VIP_TTL_MS } from '../../../sim/versus/versus';
import { kText, scoreHidden, vipView } from '../../../sim/versus/report';
import { tipMultiplier, type Game, type Recipe } from '../../../sim/overcooked';
import { C, H, TILE, W, hexNum, timerColor, R } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';
import { foodKey, type FoodKind } from '../food';
import { RECIPE_PIZZA } from '../food/recipes';
import { RECIPE_DEFS } from '../../../sim/recipes/defs';
import { Bar, place } from '../stations';
import { makeText } from '@pichi/screen-kit/art/fx';
import { VS_PLATE, vipCardAt } from './layout';
import { D, buildPlate, drawChips, type Plate } from './versus-plate';
import { buildTab, drawTab, type SabTab } from './versus-sab-tab';

interface Notice {
  text: Phaser.GameObjects.Text;
  ms: number;
}
export class VersusHud {
  private plates: Plate[] = [];
  private card: Phaser.GameObjects.Container;
  private cardBar: Bar;
  private cardPizza: Phaser.GameObjects.Image;
  private cardShown = false;
  private cardRecipe: Recipe | null = null;
  private cardName!: Phaser.GameObjects.Text; // the recipe of the golden order, in words under its picture
  private announce?: Phaser.GameObjects.Text;
  private notices: Notice[] = [];
  private tabs: SabTab[] = [];
  private revealed = false;
  private winner: number | null = null;
  private t = 0;

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: { teams: readonly TeamInfo[] | null; hiddenScore: boolean },
  ) {
    for (const t of game.teams) this.plates.push(buildPlate(this.scene, this.view, t.id));
    if (game.sab) for (const t of game.teams) this.tabs.push(buildTab(this.scene, t.id));
    const k = game.kitchens;
    const centres = k
      ? k.regions.map((r) => {
          let sx = 0,
            sy = 0,
            n = 0;
          k.comp.forEach((row, y) =>
            row.forEach((c, x) => {
              if (c === r) {
                sx += x + 0.5;
                sy += y + 0.5;
                n++;
              }
            }),
          );
          return { x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
        })
      : [
          { x: 4, y: 4.5 },
          { x: 12, y: 4.5 },
        ];
    const at = vipCardAt(centres, 16, 9);
    const cx = OX + at.x * TILE,
      cy = OY + at.y * TILE;
    // the golden order card: sits on the barrier, between the two kitchens
    const bg = scene.add.graphics();
    bg.fillStyle(0x2b1b17, 0.3).fillRoundedRect(-98, -52, 204, 118, 22);
    bg.fillStyle(hexNum(C.cheese2), 1).fillRoundedRect(-102, -60, 204, 118, 22);
    bg.fillStyle(hexNum(C.cheese), 1).fillRoundedRect(-96, -54, 192, 106, 18);
    bg.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(-102, -60, 204, 118, 22);
    bg.fillStyle(0xffffff, 0.35).fillRoundedRect(-84, -50, 168, 8, 4);
    const label = makeText(scene, 0, -34, 'PEDIDO DORADO', { size: 22, color: C.ink, stroke: 0, depth: 0 });
    this.cardPizza = place(scene, foodKey('pizza_done'), -44, 4, 1.05).setScale(1.05 / R);
    this.cardName = makeText(scene, -44, 33, '', { size: 14, color: C.ink, stroke: 0, depth: 0 });
    const mult = makeText(scene, 42, 2, '×2', { size: 54, color: C.tomato, stroke: 8, depth: 0 });
    this.cardBar = new Bar(scene, 150);
    this.cardBar.root.setPosition(0, 40).setVisible(true);
    this.card = scene.add
      .container(cx, cy, [bg, label, this.cardPizza, this.cardName, mult, this.cardBar.root])
      .setDepth(1500)
      .setVisible(false)
      .setScale(0);
  }

  update(dtMs: number, leftMs: number, running: boolean) {
    this.t += dtMs;
    const g = this.game;
    if (g.sab)
      this.tabs.forEach((tab, i) =>
        drawTab(this.scene, g, this.view, tab, i, (n, info) =>
          this.notice(`${info?.name ?? `Equipo ${n + 1}`}: ¡bolsa de basura lista!`, info ? this.light(info.color) : C.cream),
        ),
      );
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
      drawChips(this.scene, p, t.streak, tipMultiplier(t.streak, g.params.tune), t.vips);
    });
    this.updateCard();
    this.updateGlow();
    for (const n of this.notices) {
      n.ms -= dtMs;
      if (n.ms < 400) n.text.setAlpha(Math.max(0, n.ms / 400));
    }
    for (const n of this.notices.filter((x) => x.ms <= 0)) n.text.destroy();
    this.notices = this.notices.filter((x) => x.ms > 0);
    this.notices.forEach((n, i) => n.text.setY(150 + i * 40));
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
      this.scene.tweens.add({
        targets: this.card,
        scale: 0,
        duration: 260,
        ease: 'back.in',
        onComplete: () => {
          if (!this.cardShown) this.card.setVisible(false);
        },
      });
    }
    if (!v) return;
    if (v.recipe !== this.cardRecipe) {
      this.cardRecipe = v.recipe;
      this.cardPizza.setTexture(foodKey(RECIPE_PIZZA[v.recipe] as FoodKind));
      this.cardName.setText(RECIPE_DEFS[v.recipe].name.toUpperCase());
    }
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
    this.pop(
      tie ? '¡Pedido dorado para los dos!' : `¡Pedido dorado para ${info?.name ?? `el equipo ${team + 1}`}!`,
      info ? this.light(info.color) : C.cheese,
      1.5,
    );
    const p = this.plates[team];
    if (p) this.scene.tweens.add({ targets: [p.vips, p.chips], scale: { from: 1.3, to: 1 }, duration: 300, ease: 'back.out' });
  }
  /** The rival won it: this team's golden order is a normal one now. */
  vipLost(team: number) {
    const p = this.plates[team];
    if (!p) return;
    const t = makeText(this.scene, p.x0 + VS_PLATE.w / 2, VS_PLATE.y + VS_PLATE.h + 26, 'Dorado perdido', {
      size: 24,
      color: '#C9BBA7',
      depth: D + 3,
    });
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
    const t = makeText(this.scene, W / 2, H / 2 + 70, text, { size: 58, color, stroke: 10, depth: 2650 })
      .setScale(1.8)
      .setAlpha(0);
    this.announce = t;
    this.scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'back.out' });
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      y: t.y - 30,
      delay: 260 + holdS * 1000,
      duration: 380,
      ease: 'cubic.in',
      onComplete: () => {
        t.destroy();
        if (this.announce === t) this.announce = undefined;
      },
    });
  }
  // team colours are dark (they have to stay apart from the chefs'): on the dark HUD text a lighter tone of the same hue reads better
  private light(hex: string): string {
    const n = hexNum(hex),
      r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
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
      if (i === winner)
        this.scene.tweens.add({ targets: p.crown, y: p.crown.y - 8, yoyo: true, repeat: -1, duration: 500, ease: 'sine.inOut' });
      else if (winner !== null) {
        p.g.setAlpha(0.7);
        p.name.setAlpha(0.7);
        p.score.setAlpha(0.7);
      }
    });
  }
  private updateGlow() {
    this.plates.forEach((p, i) => {
      const on = this.revealed && i === this.winner;
      p.glow.setVisible(on);
      if (!on) return;
      const { x0 } = p,
        { w, h, y } = VS_PLATE,
        a = 0.55 + Math.sin(this.t / 160) * 0.3;
      p.glow
        .clear()
        .lineStyle(10, hexNum(C.cheese), a)
        .strokeRoundedRect(x0 - 6, y - 6, w + 12, h + 12, 26);
    });
  }

  destroy() {
    for (const p of this.plates)
      for (const o of [p.g, p.chips, p.name, p.score, p.k, p.streak, p.flame, p.vips, p.crown, p.glow]) o.destroy();
    this.plates = [];
    for (const t of this.tabs) for (const o of [t.g, t.bag, t.n, t.label]) o.destroy();
    this.tabs = [];
    this.card.destroy();
    this.announce?.destroy();
    for (const n of this.notices) n.text.destroy();
    this.notices = [];
  }
}
