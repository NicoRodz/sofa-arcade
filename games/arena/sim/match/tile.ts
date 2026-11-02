// The tile a body stands on. A body is 16 units wide, so its centre sits exactly on a tile edge once per tile: there the tile is the one it is heading into
// (`face`, its last heading), which is the same rule on both sides of the map: the round mirrors left-right exactly.
import { TILE } from '../grid/config';
import { LEFT, UP, type Dir } from '../grid/dir';
import type { GridBody } from '../grid/state';

const axis = (v: number, back: boolean): number => {
  const t = Math.floor(v / TILE);
  return v % TILE === 0 && back ? t - 1 : t;
};

export const bodyTile = (b: Pick<GridBody, 'x' | 'y'>, face: Dir): [number, number] => [axis(b.x, face === LEFT), axis(b.y, face === UP)];
