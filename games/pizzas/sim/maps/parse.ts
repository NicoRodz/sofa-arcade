// Map parser and grid geometry: tile letters to typed tiles, floor regions, spawn tiles.
import type { Grid, Pos, StationKind, Tile } from './types';
import { surfaceTile } from '../surfaces/legend';
import { mechLetterId, mechTile } from '../mech/letters';
import type { MechOpts } from '../mech/ids';

export const MAP_W = 16;
export const MAP_H = 9;

// # wall, . floor, S spawn (floor), ~ water, C counter, 1/2 ingredient crates, K board (stretch/cut),
// O oven, P tray pile, E delivery counter, X trash, 3 cheese crate (Margarita), U dirty-plate return, L sink,
// R sauce pot, H pass-through hatch (a counter drawn as a hatch),
// Y catapult (VERSUS maps only, the sabotage launcher: parseMap refuses it unless the caller says the map is a versus one).
// Surface tiles (surfaces/legend.ts, coop maps only): i ice, and the arrows of a floor belt.
// Design legend (15-mapas.md) -> this code: T->C, M->1, R->2, Q->3, C (table)->K, H->O; the rest is the same.
const STATIONS: Record<string, { station: StationKind; crate: number }> = {
  '1': { station: 'crate', crate: 0 },
  '2': { station: 'crate', crate: 1 },
  '3': { station: 'crate', crate: 2 },
  '5': { station: 'crate', crate: 4 }, // the basil crate: it garnishes a plate that holds a baked Margarita, it never hands out an item
  '4': { station: 'crate', crate: 3 }, // the second topping crate (a map with two toppings on its card)
  K: { station: 'board', crate: 0 },
  O: { station: 'pot', crate: 0 },
  P: { station: 'plates', crate: 0 },
  E: { station: 'window', crate: 0 },
  C: { station: 'counter', crate: 0 },
  X: { station: 'trash', crate: 0 },
  U: { station: 'dirty', crate: 0 },
  L: { station: 'sink', crate: 0 },
  R: { station: 'saucepot', crate: 0 }, // the sauce pot of the Marinara de la nonna: chopped tomato in, hold Picar to stir, sauce out
  H: { station: 'counter', crate: 1 }, // the pass-through hatch: a counter for the sim (crate 1 only tells the art to draw the hatch)
};
const VERSUS_ONLY: Record<string, { station: StationKind; crate: number }> = { Y: { station: 'catapult', crate: 0 } };
export const STATION_CHAR: Record<string, string> = {
  crate0: '1',
  crate1: '2',
  crate2: '3',
  crate3: '4',
  crate4: '5',
  board: 'K',
  pot: 'O',
  plates: 'P',
  window: 'E',
  counter: 'C',
  trash: 'X',
  dirty: 'U',
  sink: 'L',
  saucepot: 'R',
  counter1: 'H',
  catapult: 'Y',
};

/** `versus`: the tile letters that only exist in versus maps (Y, the catapult) are accepted. A coop map refuses them. */
export function parseTile(c: string, versus = false, mech?: MechOpts): Tile | null {
  if (c === '#') return { kind: 'wall' };
  if (c === '.') return { kind: 'floor', spawn: false };
  if (c === 'S') return { kind: 'floor', spawn: true };
  if (c === '~') return { kind: 'water' };
  const s = STATIONS[c] ?? (versus ? VERSUS_ONLY[c] : undefined);
  return s ? { kind: 'station', ...s } : (surfaceTile(c, versus) ?? mechTile(c, versus, mech));
}

/** `mech`: the mechanics that are on; the letter of one that is off is a load error (never a floor tile). */
export function parseMap(rows: readonly string[], versus = false, mech?: MechOpts): Grid {
  if (rows.length !== MAP_H) throw new Error(`map needs ${MAP_H} rows, got ${rows.length}`);
  return rows.map((row, y) => {
    if (row.length !== MAP_W) throw new Error(`row ${y} needs ${MAP_W} columns, got ${row.length}`);
    return [...row].map((c, x) => {
      const t = parseTile(c, versus, mech);
      if (!t) {
        const need = mechLetterId(c);
        throw new Error(
          `unknown tile '${c}' at (${x}, ${y})${c in VERSUS_ONLY ? ': only a versus map has it' : need ? `: it needs the flag mech.${need} (coop maps only)` : ''}`,
        );
      }
      return t;
    });
  });
}

export const isFloor = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'floor';
export const isStation = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'station';
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
export const posKey = (x: number, y: number) => `${x},${y}`;

export function floorComponents(g: Grid, skip?: string): { comp: number[][]; count: number } {
  const comp = g.map((row) => row.map(() => -1));
  let count = 0;
  g.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (!isFloor(g, x, y) || comp[y]![x]! >= 0 || posKey(x, y) === skip) return;
      const stack: Pos[] = [[x, y]];
      comp[y]![x] = count;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx,
            ny = cy + dy;
          if (isFloor(g, nx, ny) && comp[ny]![nx]! < 0 && posKey(nx, ny) !== skip) {
            comp[ny]![nx] = count;
            stack.push([nx, ny]);
          }
        }
      }
      count++;
    }),
  );
  return { comp, count };
}

// One spawn tile per slot: the S tiles in reading order, taking turns between floor regions so split maps get
// players on both sides, then the free floor nearest to a spawn (BFS) for extra players.
export function spawnPoints(g: Grid, count: number, order?: readonly Pos[]): [number, number][] {
  const { comp } = floorComponents(g);
  const groups = new Map<number, [number, number][]>();
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn) groups.set(comp[y]![x]!, [...(groups.get(comp[y]![x]!) ?? []), [x, y]]);
    }),
  );
  const lists = [...groups.entries()].sort((p, q) => p[0] - q[0]).map(([, l]) => l);
  let base: [number, number][] = [];
  for (let i = 0; base.length < lists.reduce((n, l) => n + l.length, 0); i++) for (const l of lists) if (l[i]) base.push(l[i]!);
  if (order) base = order.filter(([x, y]) => g[y]?.[x]?.kind === 'floor').map(([x, y]): [number, number] => [x, y]);
  if (!base.length) return [];
  const used = new Set(base.map(([x, y]) => `${x},${y}`));
  const out = base.slice(0, count);
  for (let k = base.length; out.length < count; k++) {
    const [sx, sy] = base[k % base.length]!;
    const seen = new Set([`${sx},${sy}`]);
    const queue: [number, number][] = [[sx, sy]];
    let found: [number, number] | null = null;
    for (let i = 0; i < queue.length && !found; i++) {
      const [x, y] = queue[i]!;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy,
          key = `${nx},${ny}`;
        if (seen.has(key) || !isFloor(g, nx, ny)) continue;
        seen.add(key);
        if (!used.has(key)) {
          found = [nx, ny];
          break;
        }
        queue.push([nx, ny]);
      }
    }
    if (!found) break;
    used.add(`${found[0]},${found[1]}`);
    out.push(found);
  }
  return out;
}
