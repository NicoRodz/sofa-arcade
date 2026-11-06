// The pieces the station layer is built from: `place` (an image sized to the art grid), the progress `Bar`, and the `View` of one station
// (split from stations.ts, moved verbatim; stations.ts re-exports place and Bar).
import type Phaser from 'phaser';
import type { Station } from '../../sim/overcooked';
import { R, U, hexNum, texSize } from '@pichi/screen-kit/art';

export function place(scene: Phaser.Scene, key: string, x: number, y: number, k = 1): Phaser.GameObjects.Image {
  const t = texSize(key)!;
  return scene.add
    .image(x, y, key)
    .setOrigin(t.ox / t.w, t.oy / t.h)
    .setScale((U / t.r) * k);
}

export class Bar {
  readonly root: Phaser.GameObjects.Container;
  private fill: Phaser.GameObjects.Image;
  private bg: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, w = 60) {
    this.bg = scene.add.image(0, 0, 'bar_bg').setScale((w + 6) / 66 / R);
    this.fill = scene.add
      .image(-w / 2, 0, 'bar_fill')
      .setOrigin(0, 0.5)
      .setScale(w / 60 / R);
    this.root = scene.add.container(0, 0, [this.bg, this.fill]).setVisible(false);
  }
  set(v: number, color: string) {
    const c = Math.max(0, Math.min(1, v));
    this.fill.setCrop(0, 0, 60 * R * c, 12 * R).setTint(hexNum(color));
    this.fill.setVisible(c > 0.001);
  }
}

export interface View {
  st: Station;
  idx: number;
  cx: number;
  cy: number; // tile centre, logical px
  itemImg?: Phaser.GameObjects.Image;
  itemKey: string;
  bar?: Bar;
  knife?: Phaser.GameObjects.Image;
  flames?: Phaser.GameObjects.Image[];
  glow?: Phaser.GameObjects.Image;
  rawPizza?: Phaser.GameObjects.Image;
  donePizza?: Phaser.GameObjects.Image;
  minis?: Phaser.GameObjects.Image[];
  ring?: Phaser.GameObjects.Graphics;
  bell?: Phaser.GameObjects.Image;
  dirtyStack?: Phaser.GameObjects.Image[]; // dirty plates waiting (return window) or to wash (sink)
  cleanStack?: Phaser.GameObjects.Image[]; // clean plates on the sink
  badge?: Phaser.GameObjects.Text; // main count
  badge2?: Phaser.GameObjects.Text; // sink: clean count
  count?: number;
  count2?: number;
  arrow?: Phaser.GameObjects.Image;
  foldArrow?: Phaser.GameObjects.Image; // oven: the fold arrow that invites Picar when the dough and tomato can be folded into a calzone
  wasDone: boolean;
  emberT: number;
  smokeT: number;
  flick: number;
  chopping: boolean;
}
