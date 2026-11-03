// The couch layer of the HUD (PR1): the icon (1.5 tiles wide, team halo) over whoever played a sabotage, one banner pill per team ("AZUL 3 → MAREO"), the big "+X %" when a
// team's share jumps and a flash on the floor bar where it grew. Everything is read from the TV's feed (feed.ts) and the state; nothing here touches the sim.
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

const HEX = ['#E69F00', '#4aa8e0'];
export const POP_TICKS = 70;
const FLASH_TICKS = 24;
const ICON_R = PX * 0.75; // 1.5 tiles across
const ICON_UP = 131; // the icon's centre over the body's: clear of the number chip above the head
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
    this.pills = [0, 1].map((t) => text(PILLS[t]!, 40, t, 0, 0).setColor('#ffffff').setOrigin(0.5, 0.5).setDepth(26));
    this.pops = [0, 1].map((t) =>
      text(
        t === 0 ? { x: HUD.popLeft!.x, y: HUD.popLeft!.y } : { x: HUD.popRight!.x + HUD.popRight!.w, y: HUD.popRight!.y },
        POP_SIZE,
        t,
        t === 0 ? 0 : 1,
        8,
      ),
    );
  }

  /** Every frame; `feed` null (no round) hides everything. `f.over` is the layer above the avatars. */
  update(f: Frame, s: ManchazoState | null, feed: Feed | null) {
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
    this.drawSwings(g, s, feed, tick);
  }

  private drawIcons(g: Phaser.GameObjects.Graphics, s: ManchazoState, feed: Feed, tick: number) {
    for (let k = feed.log.length - 1; k >= 0; k--) {
      const e = feed.log[k]!;
      const age = tick - e.tick;
      if (age >= ICON_TICKS) break;
      const b = s.grid.bodies[e.type === 'fired' ? e.body : -1];
      if (e.type !== 'fired' || !b || age < 0) continue;
      const x = X0 + (b.x * PX) / 16;
      const y = Math.max(Y0 + ICON_R + 8, Y0 + (b.y * PX) / 16 - ICON_UP);
      const pop = ease(age / 8);
      const fade = age > ICON_TICKS - 20 ? (ICON_TICKS - age) / 20 : 1;
      const col = TEAM_COLOR[e.team % 2]!;
      const r = ICON_R * (0.4 + 0.6 * pop);
      g.fillStyle(col, 0.35 * fade).fillCircle(x, y, r + 20 + 8 * Math.sin(age / 5)); // the halo of the team
      g.lineStyle(10, col, fade).strokeCircle(x, y, r + 7);
      g.lineStyle(4, 0xffffff, fade).strokeCircle(x, y, r + 13);
      drawIcon(g, e.kind, x, y, r, tick / 6);
    }
  }

  private drawPills(g: Phaser.GameObjects.Graphics, tick: number) {
    this.banners.visible(tick).forEach((p, t) => {
      if (!p) return;
      const r = PILLS[t]!;
      const slide = (1 - ease(p.age / 8)) * 40 * (t === 0 ? -1 : 1);
      const a = p.age > BANNER_TICKS - 12 ? (BANNER_TICKS - p.age) / 12 : 1;
      const [x, y] = [r.x + r.w / 2 + slide, r.y + r.h / 2];
      g.fillStyle(0x24160f, 0.88 * a).fillRoundedRect(x - r.w / 2, y - r.h / 2, r.w, r.h, 16);
      g.lineStyle(7, TEAM_COLOR[t]!, a).strokeRoundedRect(x - r.w / 2, y - r.h / 2, r.w, r.h, 16);
      this.pills[t]!.setText(p.text)
        .setPosition(x, y)
        .setAlpha(a)
        .setScale(Math.min(1, (r.w - 28) / this.pills[t]!.width));
    });
  }

  /** The "+X %" next to the team's percentage and a flash on the floor bar over the share it just won. */
  private drawSwings(g: Phaser.GameObjects.Graphics, s: ManchazoState, feed: Feed, tick: number) {
    const seen = [false, false];
    const w = MAP_W * PX;
    for (let k = feed.log.length - 1; k >= 0; k--) {
      const e = feed.log[k]!;
      const age = tick - e.tick;
      if (age >= POP_TICKS) break;
      if (e.type !== 'swing' || seen[e.team] || age < 0) continue;
      seen[e.team] = true;
      const pop = this.pops[e.team]!;
      const grow = 1 + 0.5 * (1 - ease(age / 10));
      pop
        .setText(`+${Math.round(e.pp)} %`)
        .setScale(grow)
        .setAlpha(age > POP_TICKS - 20 ? (POP_TICKS - age) / 20 : 1);
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
