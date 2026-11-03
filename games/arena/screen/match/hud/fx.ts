// The couch layer of the HUD (PR1): a 1-tile icon with a team halo over whoever played a sabotage (1 s), one pill per team in the HUD strip ("AZUL 3 → MAREO", never over the
// floor), the "+X %" right after a team's percentage (what it gained in the last 2 s) and a flash on the floor bar where it grew. Everything is read from the TV's feed (feed.ts) and the state; nothing here touches the sim.
import type Phaser from 'phaser';
import { FONT } from '@pichi/screen-kit/art';
import { MAP_W } from '../../../map';
import { isHidden, shownCounts, type ManchazoState } from '../../../sim';
import { drawIcon } from '../../art/glyphs';
import { BAR_H, BAR_Y, HUD, POP_SIZE, PX, X0, Y0 } from '../layout';
import { TEAM_COLOR } from '../scene-body';
import type { Frame } from '../scene-frame';
import { Banners, BANNER_TICKS, ICON_TICKS } from './banners';
import { playCues } from './cues';
import type { Feed } from './feed';

const HEX = ['#FFB81C', '#6EC6FF']; // lighter than the team colours: the "+X %" sits on the dark background and must stay readable from the couch
const GAP = 16; // between a percentage and its "+X %"
export const POP_TICKS = 70;
const FLASH_TICKS = 24;
const ICON_R = PX * 0.5; // 1 tile across: big enough to read, small enough not to cover the neighbours
const ICON_UP = 112; // the icon's centre over the body's: clear of the number chip above the head
const PILLS = [HUD.pillLeft!, HUD.pillRight!];
const ease = (t: number) => 1 - (1 - Math.min(1, t)) ** 3;

export class HudFx {
  private pills: Phaser.GameObjects.Text[];
  private pops: Phaser.GameObjects.Text[];
  private banners: Banners;

  constructor(scene: Phaser.Scene, teamName: (team: number) => string) {
    this.banners = new Banners(teamName);
    const text = (rect: { x: number; y: number }, size: number, team: number, ox: number, stroke: number) =>
      scene.add
        .text(rect.x, rect.y, '', {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color: HEX[team]!,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: stroke,
        })
        .setOrigin(ox, 0)
        .setDepth(26);
    this.pills = [0, 1].map((t) => text(PILLS[t]!, 30, t, 0, 4).setColor('#ffffff').setOrigin(0.5, 0.5).setDepth(26));
    this.pops = [0, 1].map((t) => text({ x: 0, y: HUD.pctLeft!.y + 4 }, POP_SIZE, t, t === 0 ? 0 : 1, 7).setStroke('#24160f', 7));
  }

  /** Every frame; `feed` null (no round) hides everything. `f.over` is the layer above the avatars; `pct` are the two percentage texts the "+X %" sits next to. */
  update(f: Frame, s: ManchazoState | null, feed: Feed | null, pct: readonly Phaser.GameObjects.Text[]) {
    this.pills.forEach((t) => t.setText(''));
    this.pops.forEach((t) => t.setText(''));
    if (!s || !feed) return;
    const fresh = feed.fresh();
    this.banners.push(fresh);
    playCues(fresh); // the sound layer's hook (cues.ts); nothing is connected yet
    const tick = s.grid.tick;
    const g = f.over ?? f.g;
    this.drawIcons(g, s, feed, tick);
    this.drawPills(g, tick);
    this.drawSwings(g, s, feed, tick, pct);
  }

  private drawIcons(g: Phaser.GameObjects.Graphics, s: ManchazoState, feed: Feed, tick: number) {
    for (let k = feed.log.length - 1; k >= 0; k--) {
      const e = feed.log[k]!;
      const age = tick - e.tick;
      if (age >= ICON_TICKS) break;
      const b = s.grid.bodies[e.type === 'fired' ? e.body : -1];
      if (e.type !== 'fired' || !b || age < 0) continue;
      const x = X0 + (b.x * PX) / 16;
      const y = Math.max(Y0 + ICON_R + 16, Y0 + (b.y * PX) / 16 - ICON_UP);
      const pop = ease(age / 8);
      const fade = age > ICON_TICKS - 12 ? (ICON_TICKS - age) / 12 : 1;
      const col = TEAM_COLOR[e.team % 2]!;
      const r = ICON_R * (0.4 + 0.6 * pop);
      g.fillStyle(col, 0.35 * fade).fillCircle(x, y, r + 10 + 4 * Math.sin(age / 5)); // the halo of the team
      g.lineStyle(6, col, fade).strokeCircle(x, y, r + 4);
      g.lineStyle(3, 0xffffff, fade).strokeCircle(x, y, r + 8);
      drawIcon(g, e.kind, x, y, r, tick / 6);
    }
  }

  private drawPills(g: Phaser.GameObjects.Graphics, tick: number) {
    this.banners.visible(tick).forEach((p, t) => {
      if (!p) return;
      const r = PILLS[t]!;
      const slide = (1 - ease(p.age / 8)) * 24 * (t === 0 ? -1 : 1);
      const a = p.age > BANNER_TICKS - 12 ? (BANNER_TICKS - p.age) / 12 : 1;
      const [x, y] = [r.x + r.w / 2 + slide, r.y + r.h / 2];
      g.fillStyle(0x24160f, 0.78 * a).fillRoundedRect(x - r.w / 2, y - r.h / 2, r.w, r.h, 14);
      g.lineStyle(5, TEAM_COLOR[t]!, a).strokeRoundedRect(x - r.w / 2, y - r.h / 2, r.w, r.h, 14);
      this.pills[t]!.setText(p.text)
        .setPosition(x, y)
        .setAlpha(a)
        .setScale(Math.min(1, (r.w - 24) / this.pills[t]!.width));
    });
  }

  /** The "+X %" right after the team's percentage (what it gained over the last 2 s, feed.gain) and a flash on the floor bar over the share it just won. */
  private drawSwings(g: Phaser.GameObjects.Graphics, s: ManchazoState, feed: Feed, tick: number, pct: readonly Phaser.GameObjects.Text[]) {
    const seen = [false, false];
    const w = MAP_W * PX;
    for (let k = feed.log.length - 1; k >= 0; k--) {
      const e = feed.log[k]!;
      const age = tick - e.tick;
      if (age >= POP_TICKS) break;
      if (e.type !== 'swing' || seen[e.team] || age < 0) continue;
      seen[e.team] = true;
      const pop = this.pops[e.team]!;
      const gain = Math.round(feed.gain(e.team));
      const grow = 1 + 0.4 * (1 - ease(age / 10));
      const p = pct[e.team]!;
      if (gain >= 1)
        pop
          .setText(`+${gain} %`)
          .setPosition(e.team === 0 ? p.x + p.width + GAP : p.x - p.width - GAP, p.y + 4)
          .setScale(grow)
          .setAlpha(age > POP_TICKS - 12 ? (POP_TICKS - age) / 12 : 1);
      if (age < FLASH_TICKS && !isHidden(s)) {
        const bw = (w * e.pp) / 100;
        const own = Math.min(w, (w * shownCounts(s)[e.team]!) / s.match.paintable);
        const edge = e.team === 0 ? X0 + own : X0 + w - own;
        const x = e.team === 0 ? edge - bw : edge;
        g.fillStyle(0xffffff, 0.85 * (1 - age / FLASH_TICKS)).fillRect(x, BAR_Y, bw, BAR_H);
      }
    }
  }
}
