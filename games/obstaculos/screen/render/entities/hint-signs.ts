// World-space hint signs.
import type Phaser from 'phaser';
import { TILE } from '../../../index';
import { C, FONT } from '@pichi/screen-kit/art';

export class HintSigns {
  private items: { x: number; y: number; box: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; a: number }[] = [];
  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, hints: readonly { x: number; y: number; text: string }[]) {
    for (const h of hints) {
      const txt = scene.add
        .text((h.x + 0.5) * TILE, (h.y - 1.2) * TILE, h.text, {
          fontFamily: FONT,
          fontStyle: 'bold',
          fontSize: '26px',
          color: C.ink,
          align: 'center',
          resolution: 2,
          wordWrap: { width: 330 },
        })
        .setOrigin(0.5, 1);
      const box = scene.add.graphics();
      const w = txt.width + 36,
        hh = txt.height + 22,
        x = txt.x - w / 2,
        y = txt.y - hh + 10;
      box.fillStyle(0x2b1b17, 1);
      box.fillRoundedRect(x - 3, y - 3, w + 6, hh + 6, 16);
      box.fillStyle(0xfff4e0, 1);
      box.fillRoundedRect(x, y, w, hh, 13);
      box.fillTriangle(txt.x - 12, y + hh - 1, txt.x + 12, y + hh - 1, txt.x, y + hh + 16);
      box.lineStyle(3, 0x2b1b17, 1);
      box.lineBetween(txt.x - 12, y + hh + 1, txt.x, y + hh + 17);
      box.lineBetween(txt.x + 12, y + hh + 1, txt.x, y + hh + 17);
      txt.setPosition(txt.x, y + hh - 11);
      layer.add([box, txt]);
      box.setAlpha(0);
      txt.setAlpha(0);
      this.items.push({ x: (h.x + 0.5) * TILE, y: (h.y + 0.5) * TILE, box, txt, a: 0 });
    }
  }
  update(dt: number, players: readonly { x: number; y: number }[]) {
    for (const it of this.items) {
      const near = players.some((p) => Math.hypot(p.x - it.x, p.y - it.y) < 7 * TILE);
      it.a += ((near ? 1 : 0) - it.a) * Math.min(1, dt * 6);
      it.box.setAlpha(it.a);
      it.txt.setAlpha(it.a);
    }
  }
  destroy() {
    for (const it of this.items) {
      it.box.destroy();
      it.txt.destroy();
    }
  }
}
