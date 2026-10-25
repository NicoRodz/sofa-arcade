// isometryCheck (design pizzas-modalidades-coop-versus §2, validator step 1): does a kitchen map look the same from both sides?
// A map is a list of equal-length strings; sigma maps a tile to its twin on the other half. The versus validator (F3) builds on this.
export type Pos = [number, number];
export type Sigma = (x: number, y: number, w: number, h: number) => Pos;

export const SIGMAS = {
  mirrorX: (x, y, w) => [w - 1 - x, y], // left-right reflection
  mirrorY: (x, y, _w, h) => [x, h - 1 - y], // top-bottom reflection
  rot180: (x, y, w, h) => [w - 1 - x, h - 1 - y],
} as const satisfies Record<string, Sigma>;

export interface IsometryReport {
  valid: boolean; // sigma stays inside the map and is its own inverse (a real isometry of the grid)
  s: number; // share of tiles whose type equals the type of their twin, 0..1 (a mirror map needs 1)
  mismatches: Pos[]; // tiles whose twin differs, in reading order
}

/**
 * `same` decides when two tiles count as the same type (default: the same character); a design with start tiles marked per
 * side ("a"/"b") passes a comparison that reads both as one type.
 */
export function isometryCheck(
  rows: readonly string[],
  sigma: Sigma,
  same: (a: string, b: string) => boolean = (a, b) => a === b,
): IsometryReport {
  const h = rows.length,
    w = rows[0]?.length ?? 0;
  if (!h || !w || rows.some((r) => r.length !== w)) throw new RangeError('map must be a non-empty rectangle');
  let valid = true,
    match = 0;
  const mismatches: Pos[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [tx, ty] = sigma(x, y, w, h);
      const inside = Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && tx < w && ty >= 0 && ty < h;
      if (!inside) {
        valid = false;
        continue;
      }
      const [bx, by] = sigma(tx, ty, w, h);
      if (bx !== x || by !== y) valid = false;
      if (same(rows[y]![x]!, rows[ty]![tx]!)) match++;
      else mismatches.push([x, y]);
    }
  return { valid, s: match / (w * h), mismatches };
}
