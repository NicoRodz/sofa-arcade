// The Pizzas playfield on the logical canvas: 16x9 tiles under the HUD strip. TILE and U are the canvas ones (platform tokens); the origin is this grid's.
import { gridTokens } from '@pichi/screen-kit/art';
import { COLS, ROWS } from '../../../sim';

export const { OX, OY } = gridTokens(COLS, ROWS);
