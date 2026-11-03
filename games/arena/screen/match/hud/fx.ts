// The couch layer of the HUD (PR1): a 1-tile icon with a team halo over whoever played a sabotage (1 s), the top feed (what each team took or used, in the HUD strip, never over the
// floor: feed-rows.ts), the "+X %" right after a team's percentage (what it gained in the last 2 s) and a flash on the floor bar where it grew. Everything is read from the TV's feed (feed.ts) and the state; nothing here touches the sim.
import type Phaser from 'phaser';
import { FONT } from '@pichi/screen-kit/art';
import { MAP_W } from '../../../map';
import { isHidden, shownCounts, type ManchazoState } from '../../../sim';
import { drawIcon } from '../../art/glyphs';
import { BAR_H, BAR_Y, POP_SIZE, PX, X0, Y0 } from '../layout';
import { TEAM_COLOR } from '../scene-body';
import type { Frame } from '../scene-frame';
import { ICON_TICKS } from './banners';
import { playCues } from './cues';
import type { Feed } from './feed';
import { FeedRows } from './feed-rows';
import { topFeed } from './top-feed';

const HEX = ['#FFB81C', '#6EC6FF']; // lighter than the team colours: the "+X %" sits on the dark background and must stay readable from the couch
const GAP = 10; // between a percentage and its "+X %"
export const POP_TICKS = 70;
const FLASH_TICKS = 24;
const ICON_R = PX * 0.5; // 1 tile across: big enough to read, small enough not to cover the neighbours
const ICON_UP = 112; // the icon's centre over the body's: clear of the number chip above the head
const ease = (t: number) => 1 - (1 - Math.min(1, t)) ** 3;

export class HudFx {
  private pops: Phaser.GameObjects.Text[];
  private rows: FeedRows;

  constructor(
    scene: Phaser.Scene,
    private name: (slot: number) => string,
  ) {
    this.rows = new FeedRows(scene);
    const text = (size: number, team: number, stroke: number) =>
      scene.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color: HEX[team]!,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: stroke,
        })
        .setOrigin(0, 0.5)
        .setDepth(26);
    this.pops = [0, 1].map((t) => text(POP_SIZE, t, 6).setStroke('#24160f', 6));
  }

  /** Every frame; `feed` null (no round) hides everything. `f.over` is the layer above the avatars; `pct` are the two percentage texts the "+X %" sits next to. */
  update(f: Frame, s: ManchazoState | null, feed: Feed | null, pct: readonly Phaser.GameObjects.Text[]) {
    this.rows.clear();
    this.pops.forEach((t) => t.setText(''));
    if (!s || !feed) return;
    const fresh = feed.fresh();
    playCues(fresh); // the sound layer's hook (cues.ts); nothing is connected yet
    const tick = s.grid.tick;
    const g = f.over ?? f.g;
    this.drawIcons(g, s, feed, tick);
    this.rows.draw(g, topFeed(feed, tick, this.name));
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
          .setPosition(p.x + p.width + GAP, p.y)
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
