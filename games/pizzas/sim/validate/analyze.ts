// Floor regions of a grid and the zones they form over passing counters. A leaf of the validators: the card check (recipes/card-check.ts) needs it and reachability.ts needs the card check.
import { floorComponents, type Grid, type Pos } from '../maps';
import { accessTiles } from './stations';

export interface Analysis {
  comp: number[][]; // floor component id per tile, -1 elsewhere
  count: number;
  spawns: number[]; // spawn tiles per component
  passes: { pos: Pos; comps: number[] }[]; // counters touching 2+ components: items cross there
  zone: number[]; // component -> zone id (components joined by passing counters share one)
}

export function analyze(g: Grid): Analysis {
  const { comp, count } = floorComponents(g);
  const spawns = Array<number>(count).fill(0);
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn) spawns[comp[y]![x]!]!++;
    }),
  );
  const passes: Analysis['passes'] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'station' || t.station !== 'counter') return;
      const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => comp[ay]![ax]!))];
      if (comps.length >= 2) passes.push({ pos: [x, y], comps });
    }),
  );
  const zone = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (zone[i] === i ? i : (zone[i] = find(zone[i]!)));
  for (const p of passes) for (const c of p.comps.slice(1)) zone[find(c)] = find(p.comps[0]!);
  return { comp, count, spawns, passes, zone: zone.map((_, i) => find(i)) };
}
