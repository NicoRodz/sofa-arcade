// HUD on its own camera (never zoomed): level card, clock with par bar, lives, stars, who is in the goal, arrows for players out of
// the picture (with the countdown to their bubble) and the big banners.
import Phaser from 'phaser';
import { SILVER_PAR_MULT } from '@party/shared/obstaculos';
import { C, CHEFS, FONT, H, W, hexNum } from '../../../art/tokens';
import { BIOME_NAME, type WorldView } from './view';
import { arrowPoint, VIEW_H, VIEW_W } from './camera';

const INK = 0x2b1b17, CREAM = 0xfff4e0;
export interface ArrowInfo { id: number; slot: number; dirX: number; dirY: number; seconds: number; limit: number }

export const clockText = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const medalFor = (timeSec: number, parSec: number): 'gold' | 'silver' | 'bronze' => (timeSec <= parSec ? 'gold' : timeSec <= parSec * SILVER_PAR_MULT ? 'silver' : 'bronze');
export const MEDAL_COLORS = { gold: 0xffc21a, silver: 0xc9d3da, bronze: 0xcd7f32 } as const;

export class ObstHud {
  private text: Record<string, Phaser.GameObjects.Text> = {};
  private panels: Phaser.GameObjects.Graphics;
  private dyn: Phaser.GameObjects.Graphics;
  private arrows: Phaser.GameObjects.Graphics;
  private badges = new Map<number, Phaser.GameObjects.Image>();
  private bannerTxt?: Phaser.GameObjects.Text;
  private bannerT = 0; private bannerMs = 0;
  private lastClock = -1; private lastGoalKey = '';
  private t = 0;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Layer, private w: WorldView) {
    this.panels = scene.add.graphics(); this.dyn = scene.add.graphics(); this.arrows = scene.add.graphics();
    layer.add([this.panels, this.dyn, this.arrows]);
    const mk = (key: string, x: number, y: number, size: number, color: string, ox = 0.5, oy = 0.5) => {
      const t = scene.add.text(x, y, '', { fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color, resolution: 2 }).setOrigin(ox, oy);
      layer.add(t); this.text[key] = t; return t;
    };
    mk('lvl', 40, 30, 17, '#8A7461', 0, 0.5); mk('name', 40, 62, 31, C.ink, 0, 0.5);
    mk('clock', W / 2, 38, 48, C.ink); mk('par', W / 2, 78, 17, '#8A7461');
    mk('lives', 1536, 40, 34, C.ink, 0, 0.5); mk('stars', 1668, 40, 34, C.ink, 0, 0.5); mk('goal', 1790, 30, 16, '#8A7461', 0.5, 0.5);
    this.drawPanels();
    this.text.lvl!.setText(`NIVEL ${w.hud.levelIndex + 1}/${w.hud.levelCount} · ${BIOME_NAME[w.level.def.biome].toUpperCase()}`);
    this.text.name!.setText(w.level.def.name);
    this.text.par!.setText(`PAR ${clockText(w.level.def.parSec)}`);
  }

  private pill(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(x + 2, y + 5, w, h, h / 2.4);
    g.fillStyle(INK, 1); g.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, h / 2.4 + 3);
    g.fillStyle(CREAM, 1); g.fillRoundedRect(x, y, w, h, h / 2.4);
    g.fillStyle(0xffffff, 0.5); g.fillRoundedRect(x + 14, y + 4, w - 28, 4, 2);
  }
  private drawPanels() {
    const g = this.panels;
    this.pill(g, 24, 12, 400, 80);
    this.pill(g, W / 2 - 110, 8, 220, 92);
    this.pill(g, 1456, 12, 440, 80);
    // heart and star icons
    g.fillStyle(INK, 1); this.heart(g, 1500, 52, 19); g.fillStyle(0xe63b2e, 1); this.heart(g, 1500, 52, 14.5);
    g.fillStyle(INK, 1); this.star(g, 1636, 51, 19, 8.5); g.fillStyle(0xffc21a, 1); this.star(g, 1636, 51, 14.5, 6.2);
  }
  private heart(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number) {
    g.fillCircle(cx - s * 0.5, cy - s * 0.25, s * 0.56); g.fillCircle(cx + s * 0.5, cy - s * 0.25, s * 0.56);
    g.fillTriangle(cx - s * 1.03, cy - s * 0.05, cx + s * 1.03, cy - s * 0.05, cx, cy + s * 0.95);
  }
  private star(g: Phaser.GameObjects.Graphics, cx: number, cy: number, ro: number, ri: number) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? ri : ro; pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
    g.fillPoints(pts, true);
  }

  banner(text: string, color: string, ms = 1600, size = 112) {
    this.bannerTxt?.destroy();
    const t = this.scene.add.text(W / 2, H * 0.4, text, { fontFamily: FONT, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: C.ink, strokeThickness: Math.round(size / 7), resolution: 2, align: 'center' }).setOrigin(0.5).setScale(1.5).setAlpha(0);
    this.layer.add(t);
    this.bannerTxt = t; this.bannerT = 0; this.bannerMs = ms;
  }

  update(dtMs: number, arrows: readonly ArrowInfo[], inGoalIds: ReadonlySet<number>, slots: readonly { id: number; slot: number; inGoal: boolean; connected: boolean }[]) {
    this.t += dtMs / 1000;
    const w = this.w, hud = w.hud;
    const sec = Math.floor(hud.timeSec);
    if (sec !== this.lastClock) { this.lastClock = sec; this.text.clock!.setText(clockText(sec)); }
    // medal colour of the clock
    const medal = medalFor(hud.timeSec, w.level.def.parSec);
    this.text.clock!.setColor(medal === 'gold' ? C.ink : medal === 'silver' ? '#6C7A84' : '#A0602A');
    this.text.lives!.setText(hud.lives === Infinity ? '∞' : `${hud.lives}`);
    this.text.stars!.setText(`${hud.starsTaken}/${w.level.markers.star.length}`);
    // par bar under the clock text
    const d = this.dyn; d.clear();
    const bx = W / 2 - 88, by = 94, bw = 176, frac = Math.min(1, hud.timeSec / (w.level.def.parSec * SILVER_PAR_MULT));
    d.fillStyle(INK, 0.2); d.fillRoundedRect(bx, by - 3, bw, 6, 3);
    d.fillStyle(MEDAL_COLORS[medal], 1); d.fillRoundedRect(bx, by - 3, Math.max(6, bw * frac), 6, 3);
    d.fillStyle(INK, 1); d.fillRect(bx + bw / SILVER_PAR_MULT - 1.5, by - 7, 3, 14); // par tick
    // who is in the goal
    const connected = slots.filter((s) => s.connected);
    const inside = connected.filter((s) => inGoalIds.has(s.id)).length;
    const key = `${inside}/${connected.length}`;
    if (key !== this.lastGoalKey) { this.lastGoalKey = key; this.text.goal!.setText(`EN LA META ${key}`); }
    const n = connected.length, gx0 = 1790 - (n * 24) / 2 + 12;
    connected.forEach((s, i) => {
      const x = gx0 + i * 24, y = 68, on = inGoalIds.has(s.id);
      d.fillStyle(INK, 1); d.fillCircle(x, y, 10.5);
      d.fillStyle(on ? hexNum(CHEFS[s.slot % 8]!.color) : 0xd8cdbb, 1); d.fillCircle(x, y, 7.8);
      if (on) { d.fillStyle(0xffffff, 0.6); d.fillCircle(x - 2.4, y - 2.6, 2.2); }
    });
    // arrows for players out of the picture
    const a = this.arrows; a.clear();
    const live = new Set<number>();
    for (const ar of arrows) {
      live.add(ar.id);
      const p = arrowPoint(ar.dirX, ar.dirY, VIEW_W, VIEW_H, 70);
      const prog = Math.min(1, ar.seconds / Math.max(0.1, ar.limit));
      const urgent = prog > 0.66;
      const pulse = 1 + Math.sin(this.t * (urgent ? 14 : 6)) * (urgent ? 0.14 : 0.06);
      const col = hexNum(CHEFS[ar.slot % 8]!.color);
      // arrowhead pointing outwards
      const ax = p.x + Math.cos(p.angle) * 34, ay = p.y + Math.sin(p.angle) * 34, nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      const tri = [new Phaser.Math.Vector2(ax + Math.cos(p.angle) * 16, ay + Math.sin(p.angle) * 16), new Phaser.Math.Vector2(ax + nx * 16, ay + ny * 16), new Phaser.Math.Vector2(ax - nx * 16, ay - ny * 16)];
      a.fillStyle(INK, 1); a.fillTriangle(tri[0]!.x + Math.cos(p.angle) * 3, tri[0]!.y + Math.sin(p.angle) * 3, tri[1]!.x + nx * 3, tri[1]!.y + ny * 3, tri[2]!.x - nx * 3, tri[2]!.y - ny * 3);
      a.fillStyle(col, 1); a.fillTriangle(tri[0]!.x, tri[0]!.y, tri[1]!.x, tri[1]!.y, tri[2]!.x, tri[2]!.y);
      // countdown ring around the badge
      a.lineStyle(7, INK, 0.9); a.beginPath(); a.arc(p.x, p.y, 25 * pulse, 0, Math.PI * 2); a.strokePath();
      a.lineStyle(5, urgent ? 0xe63b2e : 0xffffff, 1); a.beginPath(); a.arc(p.x, p.y, 25 * pulse, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, prog), false); a.strokePath();
      let b = this.badges.get(ar.id);
      if (!b) { b = this.scene.add.image(0, 0, `ex_badge_${ar.slot % 8}`).setScale(1 / 2); this.layer.add(b); this.badges.set(ar.id, b); }
      b.setVisible(true).setPosition(p.x, p.y).setScale((1 / 2) * 1.45 * pulse);
    }
    for (const [id, b] of this.badges) if (!live.has(id)) b.setVisible(false);
    // banner
    if (this.bannerTxt) {
      this.bannerT += dtMs;
      const k = Math.min(1, this.bannerT / 220), out = Math.max(0, (this.bannerT - (this.bannerMs - 350)) / 350);
      this.bannerTxt.setAlpha(Math.min(k, 1 - out)).setScale(1 + 0.5 * (1 - easeBack(k)));
      if (this.bannerT >= this.bannerMs) { this.bannerTxt.destroy(); this.bannerTxt = undefined; }
    }
  }
  destroy() {
    for (const t of Object.values(this.text)) t.destroy();
    this.panels.destroy(); this.dyn.destroy(); this.arrows.destroy();
    for (const b of this.badges.values()) b.destroy();
    this.bannerTxt?.destroy();
  }
}
const easeBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
