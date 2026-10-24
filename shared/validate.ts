// Map solvability: floor components, zone graph over passing counters, recipe legs, spawns per zone.
import { DIRS, isFloor, type Grid } from './maps';

export type StationKey = '1' | '2' | 'K' | 'O' | 'P' | 'E';
// 1 -> K, 2 -> K, K -> O (once per ingredient), P -> O, O -> E
export const RECIPE_LEGS: readonly (readonly [StationKey, StationKey])[] = [['1', 'K'], ['K', 'O'], ['2', 'K'], ['K', 'O'], ['P', 'O'], ['O', 'E']];
export const STATION_KEYS: readonly StationKey[] = ['1', '2', 'K', 'O', 'P', 'E'];

export type Pos = [number, number];
export const posKey = (x: number, y: number) => `${x},${y}`;

export function stationsOf(g: Grid, key: StationKey): Pos[] {
  const out: Pos[] = [];
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind !== 'station') return;
    const hit = key === '1' ? t.station === 'crate' && t.crate === 0
      : key === '2' ? t.station === 'crate' && t.crate === 1
      : key === 'K' ? t.station === 'board'
      : key === 'O' ? t.station === 'pot'
      : key === 'P' ? t.station === 'plates'
      : t.station === 'window';
    if (hit) out.push([x, y]);
  }));
  return out;
}

export function accessTiles(g: Grid, x: number, y: number): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of DIRS) if (isFloor(g, x + dx, y + dy)) out.push([x + dx, y + dy]);
  return out;
}

export interface Analysis {
  comp: number[][]; // floor component id per tile, -1 elsewhere
  count: number;
  spawns: number[]; // spawn tiles per component
  passes: { pos: Pos; comps: number[] }[]; // counters touching 2+ components: items cross there
  zone: number[]; // component -> zone id (components joined by passing counters share one)
}

export function floorComponents(g: Grid, skip?: string): { comp: number[][]; count: number } {
  const comp = g.map((row) => row.map(() => -1));
  let count = 0;
  g.forEach((row, y) => row.forEach((_t, x) => {
    if (!isFloor(g, x, y) || comp[y]![x]! >= 0 || posKey(x, y) === skip) return;
    const stack: Pos[] = [[x, y]];
    comp[y]![x] = count;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (isFloor(g, nx, ny) && comp[ny]![nx]! < 0 && posKey(nx, ny) !== skip) { comp[ny]![nx] = count; stack.push([nx, ny]); }
      }
    }
    count++;
  }));
  return { comp, count };
}

export function analyze(g: Grid): Analysis {
  const { comp, count } = floorComponents(g);
  const spawns = Array<number>(count).fill(0);
  g.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'floor' && t.spawn) spawns[comp[y]![x]!]!++; }));
  const passes: Analysis['passes'] = [];
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind !== 'station' || t.station !== 'counter') return;
    const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => comp[ay]![ax]!))];
    if (comps.length >= 2) passes.push({ pos: [x, y], comps });
  }));
  const zone = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (zone[i] === i ? i : (zone[i] = find(zone[i]!)));
  for (const p of passes) for (const c of p.comps.slice(1)) zone[find(c)] = find(p.comps[0]!);
  return { comp, count, spawns, passes, zone: zone.map((_, i) => find(i)) };
}

export function validate(g: Grid): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const a = analyze(g);
  if (!a.spawns.some((n) => n > 0)) errors.push('no spawn');
  const comps = new Map<StationKey, number[]>();
  const used = new Set<number>();
  for (const key of STATION_KEYS) {
    const list = stationsOf(g, key);
    if (!list.length) { errors.push(`missing station ${key}`); comps.set(key, []); continue; }
    const cs: number[] = [];
    for (const [x, y] of list) {
      const acc = accessTiles(g, x, y);
      if (!acc.length) errors.push(`station ${key} at (${x}, ${y}) has no floor next to it`);
      for (const [ax, ay] of acc) { cs.push(a.comp[ay]![ax]!); used.add(a.comp[ay]![ax]!); }
    }
    comps.set(key, cs);
  }
  for (const c of used) if (!a.spawns[c]) errors.push(`floor region ${c} holds recipe stations but no spawn`);
  for (const [from, to] of RECIPE_LEGS) {
    const zs = new Set((comps.get(to) ?? []).map((c) => a.zone[c]));
    if (!(comps.get(from) ?? []).some((c) => zs.has(a.zone[c]))) errors.push(`no route ${from} -> ${to}`);
  }
  return { ok: !errors.length, errors };
}
