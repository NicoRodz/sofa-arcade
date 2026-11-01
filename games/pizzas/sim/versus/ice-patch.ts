// VERSUS_V3, the ice tiles of a versus kitchen (design 2b "hielo en versus"): a small patch of ice in the middle of each kitchen, the same patch in both (the second is the first one
// through sigma), so a versus map keeps being two equal halves. The versus maps themselves are untouched: the lobby applies this to the rows only when the round has `versusV3`.
import { MAP_H, MAP_W, type SigmaName } from '../maps';
import { ICE_CHAR } from '../surfaces/legend';
import { SIGMAS } from '../maps/symmetry';
import { usesSurfaces } from '../surfaces/legend';

const BLOCK = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const; // the patch is a 2x2 block (or what is left of it where a candidate is missing)

/**
 * `rows` with a patch of ice in each kitchen. A candidate is a plain floor tile ('.') with no start tile in its eight neighbours, and whose twin is
 * a candidate too. The patch grows from the candidate with the roomiest 2x2, then the nearest to the centre of its half (ties by (y, x)): `canonical` below is the half where a tile reads before its twin.
 * The same call on any rows gives the same rows; a map with no candidate comes back as it was.
 */
export function iceRows(rows: readonly string[], sigma: SigmaName): string[] {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const twin = (x: number, y: number) => SIGMAS[sigma](x, y, MAP_W, MAP_H);
  const canonical = (x: number, y: number) => {
    const [tx, ty] = twin(x, y);
    return ty > y || (ty === y && tx > x);
  };
  const open = (x: number, y: number) => at(x, y) === '.' && ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy) === 'S'));
  const cand = new Set<string>();
  const floor: [number, number][] = [];
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < (rows[y]?.length ?? 0); x++) {
      if (!canonical(x, y)) continue;
      if ('.S'.includes(at(x, y))) floor.push([x, y]);
      const [tx, ty] = twin(x, y);
      if (open(x, y) && open(tx, ty)) cand.add(`${x},${y}`);
    }
  if (!cand.size || !floor.length) return [...rows];
  const cx = floor.reduce((a, [x]) => a + x, 0) / floor.length,
    cy = floor.reduce((a, [, y]) => a + y, 0) / floor.length;
  const size = ([x, y]: [number, number]) => BLOCK.filter(([dx, dy]) => cand.has(`${x + dx},${y + dy}`)).length;
  const far = ([x, y]: [number, number]) => (x - cx) ** 2 + (y - cy) ** 2;
  const [ax, ay] = [...cand]
    .map((k) => k.split(',').map(Number) as [number, number])
    .sort((a, b) => size(b) - size(a) || far(a) - far(b) || a[1] - b[1] || a[0] - b[0])[0]!;
  const out = rows.map((r) => [...r]);
  for (const [dx, dy] of BLOCK) {
    if (!cand.has(`${ax + dx},${ay + dy}`)) continue;
    const [tx, ty] = twin(ax + dx, ay + dy);
    out[ay + dy]![ax + dx] = ICE_CHAR;
    out[ty]![tx] = ICE_CHAR;
  }
  return out.map((r) => r.join(''));
}

/** What the lobby gives createGame for the rows of a versus round: the map's own rows, or with the patch of ice (and the surfaces on) when the round has `versusV3`. */
export function iceRound(
  map: { rows: readonly string[]; sigma: SigmaName },
  versusV3: boolean,
): { rows: readonly string[]; surfaces: boolean } {
  const rows = versusV3 ? iceRows(map.rows, map.sigma) : map.rows;
  return { rows, surfaces: usesSurfaces(rows) };
}
