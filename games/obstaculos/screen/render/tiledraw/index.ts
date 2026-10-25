// Pure canvas drawing of one tile (no Phaser): autotiling by the 4-bit mask of solid neighbours plus per-biome decoration.
// Everything is drawn in world px with (x, y) the cell's top-left. Cells are drawn with a 0.5 px overlap so chunks have no seams.
export { type CellCtx, type Ctx, E_, N_, S_, W_, cellRand, terrainMask } from './base';
export { drawCrystal, drawDoor, drawIce } from './blocks';
export { drawCell } from './cell';
export { drawBelt, drawCrumble, drawLadder, drawOneWay, drawSpikes, drawTrampoline } from './platforms';
export { drawTerrain } from './terrain';
