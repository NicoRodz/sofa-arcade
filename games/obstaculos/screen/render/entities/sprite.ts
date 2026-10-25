// What the entity layer keeps per entity, and the helpers every drawer shares.
import type Phaser from 'phaser';
import { R, texSize } from '@pichi/screen-kit/art/gfx';

export const at = (scene: Phaser.Scene, key: string) => {
  const t = texSize(key)!;
  return scene.add
    .image(0, 0, key)
    .setOrigin(t.ox / t.w, t.oy / t.h)
    .setScale(1 / R);
};

export interface Sprite {
  kind: string;
  objs: Phaser.GameObjects.GameObject[];
  gfx?: Phaser.GameObjects.Graphics;
  text?: Phaser.GameObjects.Text;
  sig: string;
  shown: number;
  seen: boolean;
  flag?: Phaser.GameObjects.Image;
  halo?: Phaser.GameObjects.Image;
}

// Clears the sprite's Graphics for a new signature; null when nothing changed (nothing to redraw).
export function redraw(sp: Sprite, sig: string): Phaser.GameObjects.Graphics | null {
  if (!sp.gfx || sp.sig === sig) return null;
  sp.sig = sig;
  sp.gfx.clear();
  return sp.gfx;
}
