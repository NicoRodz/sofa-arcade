// Map solvability: floor regions, the zone graph over passing counters, recipe legs, spawns per zone, and a fixed map against its own metadata.
import { MAP_H, MAP_W, floorComponents, parseMap, posKey, type Grid, type MapDef, type Pos } from '../maps';
import { accessTiles, hasCheese, hasSink, keysOf, legsOf, stationsOf, type StationKey } from './stations';
import { cardFor } from '../recipes/cards';
import { cardProblems } from '../recipes/card-check';
import { puestoProblems } from '../puestos';
import { surfaceProblems } from './surfaces';

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

export function validate(g: Grid): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const a = analyze(g);
  if (!a.spawns.some((n) => n > 0)) errors.push('no spawn');
  const comps = new Map<StationKey, number[]>();
  const used = new Set<number>();
  for (const key of keysOf(g)) {
    const list = stationsOf(g, key);
    if (!list.length) {
      errors.push(`missing station ${key}`);
      comps.set(key, []);
      continue;
    }
    const cs: number[] = [];
    for (const [x, y] of list) {
      const acc = accessTiles(g, x, y);
      if (!acc.length) errors.push(`station ${key} at (${x}, ${y}) has no floor next to it`);
      for (const [ax, ay] of acc) {
        cs.push(a.comp[ay]![ax]!);
        used.add(a.comp[ay]![ax]!);
      }
    }
    comps.set(key, cs);
  }
  for (const c of used) if (!a.spawns[c]) errors.push(`floor region ${c} holds recipe stations but no spawn`);
  for (const [from, to] of legsOf(g)) {
    const zs = new Set((comps.get(to) ?? []).map((c) => a.zone[c]));
    if (!(comps.get(from) ?? []).some((c) => zs.has(a.zone[c]))) errors.push(`no route ${from} -> ${to}`);
  }
  return { ok: !errors.length, errors };
}

// Fewest players that can still finish the recipe: the smallest set of floor regions whose stations cover every recipe
// station kind (items cross regions through counters, but somebody has to stand at each station).
export function minPlayers(g: Grid): number {
  const a = analyze(g);
  const regions: Set<StationKey>[] = Array.from({ length: a.count }, () => new Set());
  const needed = new Set<StationKey>();
  for (const key of keysOf(g))
    for (const [x, y] of stationsOf(g, key)) {
      needed.add(key);
      for (const [ax, ay] of accessTiles(g, x, y)) regions[a.comp[ay]![ax]!]!.add(key);
    }
  const ids = regions.map((_r, i) => i).filter((i) => regions[i]!.size);
  let best = ids.length;
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const size = ids.filter((_v, k) => mask & (1 << k)).length;
    if (size >= best) continue;
    const got = new Set<StationKey>();
    ids.forEach((id, k) => {
      if (mask & (1 << k)) regions[id]!.forEach((key) => got.add(key));
    });
    if ([...needed].every((k) => got.has(k))) best = size;
  }
  return Math.max(1, best);
}

export const floorTiles = (g: Grid) => g.reduce((n, row) => n + row.filter((t) => t.kind === 'floor').length, 0);
export const spawnTiles = (g: Grid): Pos[] => {
  const out: Pos[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn) out.push([x, y]);
    }),
  );
  return out;
};
export const FLOOR_PER_PLAYER = 7; // design: at least 7 floor tiles per player at the map's maximum

// A fixed map against its own metadata: solvable, one spawn per player of its maximum, range and minDuro consistent.
export function validateMap(m: MapDef): { ok: boolean; errors: string[] } {
  if (m.rows.length !== MAP_H || m.rows.some((r) => r.length !== MAP_W)) return { ok: false, errors: ['bad size'] };
  const g = parseMap(m.rows);
  const errors = [...validate(g).errors];
  const card = cardFor(m.id);
  if (card) errors.push(...cardProblems(card, g)); // the recipes of the map's card: every station they need, reachable
  if (!(m.nMin >= 2 && m.nMin <= m.nMax && m.nMax <= 8)) errors.push(`range ${m.nMin}-${m.nMax} is not within 2..8`);
  if (m.minDuro > m.nMin) errors.push(`minDuro ${m.minDuro} is above nMin ${m.nMin}`);
  const mp = minPlayers(g);
  if (mp !== m.minDuro) errors.push(`minDuro is ${m.minDuro} but the recipe needs ${mp} floor regions`);
  const s = spawnTiles(g);
  if (s.length < m.nMax) errors.push(`${s.length} spawns for up to ${m.nMax} players`);
  if (m.spawns) {
    const key = (p: Pos) => posKey(...p);
    const set = new Set(s.map(key));
    if (!m.spawns.every((p) => set.has(key(p))) || new Set(m.spawns.map(key)).size !== m.spawns.length)
      errors.push('explicit spawn order does not match the S tiles');
  }
  errors.push(...puestoProblems(m));
  errors.push(...surfaceProblems(g));
  if (floorTiles(g) < FLOOR_PER_PLAYER * m.nMax)
    errors.push(`${floorTiles(g)} floor tiles for ${m.nMax} players (want ${FLOOR_PER_PLAYER} each)`);
  return { ok: !errors.length, errors };
}

// Share of one pizza's actions (picks, board work, oven loads and takes, plate, delivery, washing) that each floor region
// receives. A station touching two regions (a counter or an oven in a wall) splits its share. Design: a region with a spawn
// must get at least 15% or its players have nothing to do.
export const MIN_ZONE_SHARE = 0.15;
export function zoneShares(g: Grid): number[] {
  const a = analyze(g);
  const ingredients = hasCheese(g) ? 3 : 2;
  const actions: [StationKey, number][] = [
    ['1', 1],
    ['2', 1],
    ...(hasCheese(g) ? ([['3', 1]] as [StationKey, number][]) : []),
    ['K', 2 * ingredients],
    ['O', ingredients + 1],
    ['P', 1],
    ['E', 1],
    ...(hasSink(g)
      ? ([
          ['U', 1],
          ['L', 3],
        ] as [StationKey, number][])
      : []),
  ];
  const w = Array<number>(a.count).fill(0);
  for (const [key, weight] of actions) {
    const list = stationsOf(g, key);
    for (const [x, y] of list) {
      const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => a.comp[ay]![ax]!))];
      for (const c of comps) w[c]! += weight / list.length / comps.length;
    }
  }
  const total = w.reduce((n, v) => n + v, 0) || 1;
  return w.map((v) => v / total);
}
export const zoneShareProblems = (g: Grid): string[] => {
  const a = analyze(g),
    shares = zoneShares(g);
  return shares.flatMap((sh, c) =>
    a.spawns[c]! > 0 && a.count > 1 && sh < MIN_ZONE_SHARE
      ? [`region ${c} gets ${(sh * 100).toFixed(0)}% of the actions (< ${MIN_ZONE_SHARE * 100}%)`]
      : [],
  );
};
