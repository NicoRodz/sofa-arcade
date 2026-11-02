// The drawing frame every scene layer receives: the Graphics to draw on and where the board sits (origin and tile size in pixels).
import type Phaser from 'phaser';

export interface Frame {
  g: Phaser.GameObjects.Graphics;
  over?: Phaser.GameObjects.Graphics; // drawn above the avatars (the sprites hide what is drawn on `g` over a head); without it, `g`
  x0: number;
  y0: number;
  px: number;
}

/** The same frame drawing above the avatars. */
export const onTop = (f: Frame): Frame => ({ ...f, g: f.over ?? f.g });
