// The dynamic layer of the sauce pot ('R'): the chopped tomato inside, the stir bar, the finished sauce, and the scorch when it sticks. It borrows the optional
// fields of the station view (bar, minis, donePizza) so stations.ts does not grow; `place` and `Bar` come in as arguments (this file never imports stations.ts: no cycle).
import type Phaser from 'phaser';
import type { Station } from '../../../sim/overcooked';
import { C, TILE } from '@pichi/screen-kit/art/tokens';
import { foodKey } from '../food';

type Img = Phaser.GameObjects.Image;
interface BarLike {
  root: Phaser.GameObjects.Container;
  set(v: number, color: string): void;
}
export interface SauceHost {
  st: Station;
  cx: number;
  cy: number;
  bar?: BarLike;
  minis?: Img[];
  donePizza?: Img;
}
type Place = (scene: Phaser.Scene, key: string, x: number, y: number, k?: number) => Img;
type MakeBar = new (scene: Phaser.Scene, w?: number) => BarLike;

export function attachSaucepot(scene: Phaser.Scene, v: SauceHost, Bar: MakeBar, place: Place) {
  const d = 100 + v.cy + TILE * 0.5;
  v.bar = new Bar(scene, 62);
  v.bar.root.setPosition(v.cx, v.cy - TILE * 0.4).setDepth(3000);
  v.minis = [
    place(scene, foodKey('tomato_cut'), v.cx, v.cy + TILE * 0.05, 0.6)
      .setDepth(d - 2)
      .setVisible(false),
  ];
  v.donePizza = place(scene, foodKey('sauce_blob'), v.cx, v.cy + TILE * 0.05, 0.75)
    .setDepth(d - 2)
    .setVisible(false);
}

export function updateSaucepot(v: SauceHost, stirring: boolean, t: number) {
  const st = v.st;
  const mixing = st.inputs.length > 0 && !st.done; // a tomato is in, the sauce is not ready
  v.minis![0]!.setVisible(mixing).setAngle(stirring ? Math.sin(t / 60) * 12 : 0);
  v.donePizza!.setVisible(st.done).setTint(st.burnt ? 0x4a2a1a : 0xffffff); // stuck sauce is dark
  v.bar!.root.setVisible(mixing && st.progress > 0);
  if (mixing) v.bar!.set(st.progress, C.tomato);
}
