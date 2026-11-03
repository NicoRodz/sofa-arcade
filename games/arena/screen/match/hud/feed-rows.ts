// Draws the top feed (top-feed.ts): one row per team beside its percentage, "[icon] Nico tomó el Ventilador · sopla las piñatas lejos de ti" on a dark pill with the team's stripe.
// Two Text objects per row (who in the team's light colour, the legend in cream); the pill and the icon go on the graphics the HUD gives it. Nothing here reads the sim.
import type Phaser from 'phaser';
import { FONT } from '@pichi/screen-kit/art';
import { drawIcon } from '../../art/glyphs';
import { FEED_SIZE, HUD } from '../layout';
import { TEAM_COLOR } from '../scene-body';
import { entryMotion, type Entry } from './top-feed';

const HEX = ['#FFB81C', '#6EC6FF']; // lighter than the team colours: they sit on a dark pill and must read from the couch
const ROWS = [HUD.feed0!, HUD.feed1!];
const ICON_R = 13;
const PAD = 10; // inside the pill, round the icon and the text
const SEP = 14; // between who and the legend

export class FeedRows {
  private who: Phaser.GameObjects.Text[];
  private legend: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    const text = (color: string) =>
      scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: `${FEED_SIZE}px`, color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 })
        .setOrigin(0, 0.5)
        .setDepth(26);
    this.who = [0, 1].map((t) => text(HEX[t]!));
    this.legend = [0, 1].map(() => text('#f3e9d2'));
  }

  clear(): void {
    for (const t of [...this.who, ...this.legend]) t.setText('');
  }

  draw(g: Phaser.GameObjects.Graphics, entries: readonly (Entry | null)[]): void {
    this.clear();
    entries.forEach((e, t) => {
      if (!e) return;
      const r = ROWS[t]!;
      const { slide, alpha } = entryMotion(e.age);
      const who = this.who[t]!.setText(e.who);
      const leg = this.legend[t]!.setText(`· ${e.legend}`);
      const natural = PAD * 2 + ICON_R * 2 + 8 + who.width + SEP + leg.width;
      const k = Math.min(1, r.w / natural); // a long line shrinks to fit its row, never overflows
      const x = r.x + slide;
      const cy = r.y + r.h / 2;
      const h = r.h - 3;
      g.fillStyle(0x24160f, 0.9 * alpha).fillRoundedRect(x, cy - h / 2, natural * k, h, 9);
      g.fillStyle(TEAM_COLOR[t]!, alpha).fillRoundedRect(x, cy - h / 2, 7, h, { tl: 9, bl: 9, tr: 0, br: 0 });
      const ix = x + (PAD + 4 + ICON_R) * k;
      if (alpha > 0.5) drawIcon(g, e.kind, ix, cy, ICON_R * k); // the icon has no alpha: it goes before the pill is gone
      const wx = x + (PAD + 4 + ICON_R * 2 + 8) * k;
      who.setPosition(wx, cy).setScale(k).setAlpha(alpha);
      leg
        .setPosition(wx + (who.width + SEP) * k, cy)
        .setScale(k)
        .setAlpha(alpha);
    });
  }
}
