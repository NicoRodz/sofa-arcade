// A text pinned over a tile for the arts that repaint every frame ("Mantén B" over a broken bridge). One Text per (scene, key), made once, moved and shown by `tileLabel`, hidden by `hideLabels`
// (call it at the top of the frame, then `tileLabel` for each one still wanted). The texts go away with the scene's children.
import type Phaser from 'phaser';
import { makeText } from '@pichi/screen-kit/art/fx';

const pool = new WeakMap<Phaser.Scene, Map<string, Phaser.GameObjects.Text>>();

export function hideLabels(scene: Phaser.Scene, prefix: string) {
  for (const [k, t] of pool.get(scene) ?? []) if (k.startsWith(prefix)) t.setVisible(false);
}
export function tileLabel(scene: Phaser.Scene, key: string, text: string, x: number, y: number, size: number, color: string, depth = 1910) {
  let m = pool.get(scene);
  if (!m) pool.set(scene, (m = new Map()));
  let t = m.get(key);
  if (!t || !t.scene) m.set(key, (t = makeText(scene, x, y, text, { size, color, stroke: 7, depth })));
  t.setText(text).setPosition(x, y).setVisible(true);
}
