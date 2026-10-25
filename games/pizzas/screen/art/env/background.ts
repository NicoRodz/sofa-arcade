// Kitchen environment: floor, walls, benches and the static body of every station, baked into ONE canvas texture.
import type Phaser from 'phaser';
import type { Grid } from '../../../sim/maps';
import { H, OX, OY, TILE, U, W, floorPair } from '@pichi/screen-kit/art/tokens';
import { outerWall, floorPass, waterPass, masses } from './floor';
import { crate, board, oven, plates } from './work-stations';
import { trashCan, catapult, dirtyReturn, sinkStation, windowStation } from './service-stations';

const BG_R = 1.5;

export function buildBackground(scene: Phaser.Scene, g: Grid, mapId: string, seedN: number, topping = 2): Phaser.GameObjects.Image {
  // topping: what the cheese crate holds this round (2 cheese, 3 pepperoni, 4 mushroom)
  const key = `bg_${scene.textures.getTextureKeys().filter((k) => k.startsWith('bg_')).length}_${Date.now() % 100000}`;
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('bg_')) scene.textures.remove(k);
  const tex = scene.textures.createCanvas(key, Math.ceil(W * BG_R), Math.ceil(H * BG_R))!;
  const c = tex.getContext();
  c.scale(BG_R, BG_R);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  outerWall(c);
  c.save();
  c.translate(OX, OY);
  c.scale(U, U);
  // clip the playfield so soft shadows never spill into the wall
  floorPass(c, g, floorPair(mapId, seedN));
  waterPass(c, g);
  masses(c, g);
  g.forEach((row, ty) =>
    row.forEach((t, tx) => {
      if (t.kind !== 'station') return;
      const x0 = tx * 120,
        y0 = ty * 120;
      if (t.station === 'crate') crate(c, x0, y0, t.crate === 2 ? topping : t.crate);
      else if (t.station === 'board') board(c, x0, y0, tx, ty);
      else if (t.station === 'pot') oven(c, x0, y0);
      else if (t.station === 'plates') plates(c, x0, y0);
      else if (t.station === 'window') windowStation(c, x0, y0);
      else if (t.station === 'trash') trashCan(c, x0, y0);
      else if (t.station === 'catapult') catapult(c, x0, y0);
      else if (t.station === 'dirty') dirtyReturn(c, x0, y0);
      else if (t.station === 'sink') sinkStation(c, x0, y0);
    }),
  );
  c.restore();
  // soft vignette
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  tex.refresh();
  return scene.add
    .image(0, 0, key)
    .setOrigin(0, 0)
    .setScale(1 / BG_R)
    .setDepth(0);
}

export const tileCenter = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
