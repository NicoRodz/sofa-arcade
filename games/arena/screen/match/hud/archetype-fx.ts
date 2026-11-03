// Draws the map's name over the middle of the floor at the start of the round (archetype-banner.ts says what and how big): the PR1 pill look (dark rounded box, gold
// outline, bold white text with a black stroke) at 150 px, so it reads from the couch. 90 ticks, then it is gone and the floor is clear.
import type Phaser from 'phaser';
import { FONT, W } from '@pichi/screen-kit/art';
import { MAP_H } from '../../../map';
import type { ManchazoState } from '../../../sim';
import { PX, Y0 } from '../layout';
import { archetypeBanner } from './archetype-banner';

const BOX_H = 300;
const GOLD = 0xffd23f;

export class ArchetypeFx {
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const text = (size: number, stroke: number, color: string) => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: stroke,
    });
    this.g = scene.add.graphics().setDepth(38);
    this.title = scene.add
      .text(0, 0, '', text(150, 14, '#ffffff'))
      .setOrigin(0.5)
      .setDepth(39);
    this.sub = scene.add
      .text(0, 0, '', text(40, 6, '#f3e9d2'))
      .setOrigin(0.5)
      .setDepth(39);
  }

  update(s: ManchazoState | null) {
    this.g.clear();
    const b = s ? archetypeBanner(s.grid.tick, s.mapArchetype) : null;
    this.title.setText(b?.title ?? '');
    this.sub.setText(b?.sub ?? '');
    if (!b) return;
    const [cx, cy] = [W / 2, Y0 + (MAP_H * PX) / 2];
    const w = Math.max(this.title.width * b.scale, this.sub.width) + 160;
    const h = BOX_H * (0.8 + 0.2 * (1 / b.scale) ** 2);
    this.g.fillStyle(0x24160f, 0.82 * b.alpha).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 28);
    this.g.lineStyle(8, GOLD, b.alpha).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 28);
    this.title
      .setPosition(cx, cy - 36)
      .setScale(b.scale)
      .setAlpha(b.alpha);
    this.sub.setPosition(cx, cy + 92).setAlpha(b.alpha);
  }
}
