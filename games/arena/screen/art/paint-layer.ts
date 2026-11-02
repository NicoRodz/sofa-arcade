// The paint on the floor: one image per painted tile, from two baked tile textures. ORANGE is dotted and BLUE is striped, so the teams differ without colour
// (colour-blind players); both tint the cream floor a little transparent, so the grout still shows. A tile's image changes only when its paint does.
import type Phaser from 'phaser';
import type { Ctx } from '@pichi/screen-kit/art';
import { MAP_H, MAP_W } from '../../map';
import { BAKE } from './floor-bake';
import { A, TEAM_HEX } from './palette';

const KEY = ['mz_paint_0', 'mz_paint_1'] as const;

/** The indices of the tiles whose paint is not what the layer shows: the only ones to touch. Pure. */
export function changedTiles(shown: ArrayLike<number>, paint: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < paint.length; i++) if (shown[i] !== paint[i]) out.push(i);
  return out;
}

function bakeTile(c: Ctx, team: number, px: number) {
  c.fillStyle = TEAM_HEX[team]!;
  c.globalAlpha = 0.86;
  c.fillRect(0, 0, px, px);
  c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,0.62)';
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  if (team === 0) {
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        // dots, 14 px apart: they line up across neighbour tiles
        c.beginPath();
        c.arc(7 + i * 14, 7 + j * 14, 3.4, 0, Math.PI * 2);
        c.fill();
      }
  } else {
    c.lineWidth = 5;
    c.save();
    c.beginPath();
    c.rect(0, 0, px, px);
    c.clip();
    for (let k = -px; k < 2 * px; k += 14) {
      // diagonal stripes that continue over the neighbour tiles
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k - px, px);
      c.stroke();
    }
    c.restore();
  }
  c.strokeStyle = team === 0 ? A.orangeDark : A.blueDark; // a darker edge: the splash of a tile
  c.globalAlpha = 0.5;
  c.lineWidth = 2;
  c.strokeRect(1, 1, px - 2, px - 2);
  c.globalAlpha = 1;
}

export function bakePaintTextures(scene: Phaser.Scene, px: number): void {
  KEY.forEach((key, team) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, px * BAKE, px * BAKE);
    if (!tex) throw new Error(`texture ${key} not created`);
    const c = tex.getContext();
    c.scale(BAKE, BAKE);
    bakeTile(c, team, px);
    tex.refresh();
  });
}

export class PaintLayer {
  private images: (Phaser.GameObjects.Image | undefined)[] = [];
  private shown = new Int8Array(MAP_W * MAP_H).fill(-1);

  constructor(
    private scene: Phaser.Scene,
    private x0: number,
    private y0: number,
    private px: number,
  ) {
    bakePaintTextures(scene, px);
  }

  sync(paint: Int8Array): void {
    for (const i of changedTiles(this.shown, paint)) {
      const team = paint[i]!;
      this.shown[i] = team;
      let im = this.images[i];
      if (team < 0) {
        im?.setVisible(false);
        continue;
      }
      if (!im) {
        const [tx, ty] = [i % MAP_W, Math.floor(i / MAP_W)];
        im = this.scene.add
          .image(this.x0 + tx * this.px, this.y0 + ty * this.px, KEY[0])
          .setOrigin(0, 0)
          .setScale(1 / BAKE)
          .setDepth(-1);
        this.images[i] = im;
      }
      im.setTexture(KEY[team % 2]!).setVisible(true);
    }
  }
}
