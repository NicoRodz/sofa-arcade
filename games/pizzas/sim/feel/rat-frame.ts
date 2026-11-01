// VERSUS_V3: the rat's tie-breaks in the canonical frame. Three of the rat's choices break a tie by an order or a handedness: the BFS (the first of DIRS between equal paths), the side of the
// jump (left of the heading first) and the angle of the burst (+30 degrees first). Kitchen 1 is the canonical frame; kitchen 0 is its image under sigma, and an image reorders the
// directions and, under a reflection, swaps left and right. So the view of kitchen 0 carries this frame: its DIRS are the image of the canonical ones and `flip` mirrors the two sides.
import { DIRS, MAP_H, MAP_W } from '../maps';
import { SIGMAS, type Sigma } from '../maps/symmetry';
import type { SigmaName } from '../maps';

export interface RatFrame {
  dirs: readonly (readonly [number, number])[]; // the four directions in the order the BFS tries them
  flip: boolean; // a reflection: "left" of the canonical frame is "right" here
}

/** The frame a team's rat reasons in: kitchen 1 (and any round with no sigma) keeps the canonical one. */
export function ratFrame(sigma: SigmaName | undefined, team: number): RatFrame | undefined {
  if (!sigma || team !== 0) return undefined;
  const s: Sigma = SIGMAS[sigma];
  const [ox, oy] = s(0, 0, MAP_W, MAP_H),
    [ex, ey] = s(1, 0, MAP_W, MAP_H),
    [fx, fy] = s(0, 1, MAP_W, MAP_H);
  const a = [ex - ox, ey - oy],
    b = [fx - ox, fy - oy]; // the images of the two axes
  return {
    dirs: DIRS.map(([dx, dy]) => [dx * a[0]! + dy * b[0]!, dx * a[1]! + dy * b[1]!] as const),
    flip: a[0]! * b[1]! - a[1]! * b[0]! < 0,
  };
}
