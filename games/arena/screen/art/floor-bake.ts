// The floor of the match as ONE texture: the wooden frame of the board, the cream tiles and the furniture, baked into a canvas the first time a map shows
// and shown as a single Image (a 27x15 grid is 405 tiles, and the scene used to redraw them all every frame). Baked at 2x, so the 4K screen (renderScale 2)
// shows it at one texel per pixel. The key carries the map's hash: a new map bakes its own, and the previous one is dropped.
import type Phaser from 'phaser';
import { rr, type Ctx } from '@pichi/screen-kit/art';
import { MAP_H, MAP_W, hashMap, type TileMap } from '../../map';
import { drawPiece } from './furniture-draw';
import { planFurniture } from './furniture-plan';
import { A } from './palette';

export const FRAME = 18; // logical px of wooden frame around the floor
export const BAKE = 2; // texels per logical px

const keyOf = (map: TileMap): string => `mz_floor_${hashMap(map).toString(16)}`;

function paintFloor(c: Ctx, map: TileMap, px: number) {
  const W = MAP_W * px,
    H = MAP_H * px;
  c.fillStyle = A.frame; // the frame: wood with a light top edge and a dark inner lip
  rr(c, -FRAME, -FRAME, W + 2 * FRAME, H + 2 * FRAME, 16);
  c.fill();
  c.strokeStyle = A.frameLight;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-FRAME + 10, -FRAME + 2);
  c.lineTo(W + FRAME - 10, -FRAME + 2);
  c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(-4, -4, W + 8, H + 8);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      c.fillStyle = (x + y) % 2 ? A.tileA : A.tileB;
      c.fillRect(x * px, y * px, px, px);
      c.strokeStyle = A.grout;
      c.lineWidth = 1.5;
      c.strokeRect(x * px + 0.75, y * px + 0.75, px - 1.5, px - 1.5);
      c.fillStyle = 'rgba(255,255,255,0.55)'; // a tile is a little bevelled
      c.fillRect(x * px + 2, y * px + 2, px - 4, 2);
    }
  for (const piece of planFurniture(map)) drawPiece(c, piece, 0, 0, px);
}

/** The key of the baked floor of `map`, baking it if it is not there; textures of other maps are removed. */
export function floorTexture(scene: Phaser.Scene, map: TileMap, px: number): string {
  const key = keyOf(map);
  if (scene.textures.exists(key)) return key;
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('mz_floor_')) scene.textures.remove(k);
  const w = MAP_W * px + 2 * FRAME,
    h = MAP_H * px + 2 * FRAME;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * BAKE), Math.ceil(h * BAKE));
  if (!tex) throw new Error(`texture ${key} not created`);
  const c = tex.getContext();
  c.scale(BAKE, BAKE);
  c.translate(FRAME, FRAME);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paintFloor(c, map, px);
  tex.refresh();
  return key;
}
