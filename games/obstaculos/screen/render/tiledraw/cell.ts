// Draws one cell: picks the drawer by tile kind.
import { type CellCtx, type Ctx, terrainMask } from './base';
import { drawTerrain } from './terrain';
import { drawBelt, drawCrumble, drawLadder, drawOneWay, drawSpikes, drawTrampoline } from './platforms';
import { drawCrystal, drawDoor, drawIce } from './blocks';
import { T, tileAt, type Biome, type TileGrid } from '../../../index';
import { PALETTES } from '../biome';

export function drawCell(c: Ctx, g: TileGrid, x: number, y: number, px: number, py: number, biome: Biome, seed: number) {
  const kind = tileAt(g, x, y);
  if (kind === T.Empty || kind === T.Liquid || kind === T.Object) return;
  const k: CellCtx = { g, x, y, px, py, mask: kind === T.Solid ? terrainMask(g, x, y) : 0, biome, pal: PALETTES[biome], seed };
  switch (kind) {
    case T.Solid:
      drawTerrain(c, k);
      break;
    case T.OneWay:
      drawOneWay(c, k);
      break;
    case T.Ladder:
      drawLadder(c, k);
      break;
    case T.Spikes:
      drawSpikes(c, k);
      break;
    case T.Crumble:
      drawCrumble(c, k);
      break;
    case T.BeltL:
      drawBelt(c, k, -1);
      break;
    case T.BeltR:
      drawBelt(c, k, 1);
      break;
    case T.Trampoline:
      drawTrampoline(c, k);
      break;
    case T.Door:
      drawDoor(c, k);
      break;
    case T.Ice:
      drawIce(c, k);
      break;
    case T.Crystal:
      drawCrystal(c, k, false);
      break;
    case T.CrystalLit:
      drawCrystal(c, k, true);
      break;
  }
}
