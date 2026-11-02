// The drawing frame every scene layer receives: the Graphics to draw on and where the board sits (origin and tile size in pixels).
import type Phaser from 'phaser';

export interface Frame {
  g: Phaser.GameObjects.Graphics;
  x0: number;
  y0: number;
  px: number;
}
