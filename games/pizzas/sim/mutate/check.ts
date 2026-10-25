// The validator of a mutation: the map must be solvable BEFORE and AFTER (every station reachable, the recipe completable, belts that feed somewhere),
// and the diff must stay inside what the sim can apply in one tick: floor stays floor (ice, belt) or becomes a counter; spawn tiles, stations, walls and water never change.
import { parseMap, parseTile, type MapDef } from '../maps';
import { validateMap } from '../validate';
import { rowsAfter, type Mutation } from './plan';

export function mutationProblems(map: MapDef, m: Mutation): string[] {
  const errors: string[] = [];
  const before = parseMap(map.rows);
  const seen = new Set<string>();
  for (const t of m.tiles) {
    const at = `tile (${t.x}, ${t.y})`;
    const old = before[t.y]?.[t.x];
    const next = parseTile(t.to);
    if (seen.has(`${t.x},${t.y}`)) errors.push(`${at} changes twice`);
    seen.add(`${t.x},${t.y}`);
    if (!old) errors.push(`${at} is outside the map`);
    else if (!next) errors.push(`${at} becomes an unknown letter '${t.to}'`);
    else if (old.kind !== 'floor') errors.push(`${at} is a ${old.kind}: only floor can change`);
    else if (old.spawn) errors.push(`${at} is a spawn tile`);
    else if (next.kind !== 'floor' && !(next.kind === 'station' && next.station === 'counter')) errors.push(`${at} becomes a ${next.kind}`);
  }
  if (errors.length) return errors;
  const side = (label: string, rows: readonly string[]) => validateMap({ ...map, rows }).errors.map((e) => `${label}: ${e}`);
  return [...side('before', map.rows), ...side('after', rowsAfter(map.rows, m))];
}
