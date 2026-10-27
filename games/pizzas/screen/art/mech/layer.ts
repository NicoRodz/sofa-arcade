// One Graphics layer per (scene, name): the arts that draw every frame with `draw(scene, game, t)` clear and refill theirs. Depth is over the floor and under stations, items and chefs unless said.
import type Phaser from 'phaser';

const layers = new WeakMap<Phaser.Scene, Map<string, Phaser.GameObjects.Graphics>>();
export function layer(scene: Phaser.Scene, name: string, depth = 1.55): Phaser.GameObjects.Graphics {
  let m = layers.get(scene);
  if (!m) layers.set(scene, (m = new Map()));
  let l = m.get(name);
  if (!l || !l.scene) {
    l = scene.add.graphics().setDepth(depth);
    m.set(name, l);
  }
  return l;
}
export type Draw = (scene: Phaser.Scene, g: import('../../../sim/overcooked').Game, t: number) => void;
