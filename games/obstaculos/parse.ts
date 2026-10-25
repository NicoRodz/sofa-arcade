// ASCII rows -> ParsedLevel. Pure; never throws: problems go to `errors` (the F2b linter and the tests read them).
import { MAX_PLAYERS_OBST, MIN_PLAYERS } from './constants';
import { MARKER_CHARS, T, TILE_CHARS, isActivator, isLegendChar, isObjective, type Marker, type TileKind } from './legend';
import type { Cell, EntityParam, LevelDef, Rect } from './types';

// All the cells that share one activator/objective letter form one object (plan §9).
export interface LevelObject {
  char: string;
  cells: Cell[];
  bounds: Rect;
  param?: EntityParam;
}

export interface ParsedLevel {
  def: LevelDef;
  w: number;
  h: number;
  tiles: Uint8Array; // row-major, h * w, base tile kinds (FreeSolid still unresolved, see buildGrid in sim/tiles.ts)
  markers: Record<Marker, Cell[]>; // each list in reading order (rows top to bottom, then columns)
  objects: Record<string, LevelObject>;
  errors: string[];
}

const emptyMarkers = (): Record<Marker, Cell[]> => ({
  spawn: [],
  checkpoint: [],
  goal: [],
  star: [],
  ring: [],
  box: [],
  heavyBox: [],
  key: [],
  pickaxe: [],
  lantern: [],
  bungee: [],
});

export function parseLevel(def: LevelDef): ParsedLevel {
  const errors: string[] = [];
  const rows = def.rows;
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (h === 0 || w === 0) errors.push('empty rows');
  const tiles = new Uint8Array(w * h);
  const markers = emptyMarkers();
  const objects: Record<string, LevelObject> = {};

  rows.forEach((row, y) => {
    if (row.length !== w) errors.push(`row ${y}: width ${row.length}, expected ${w}`);
    for (let x = 0; x < Math.min(row.length, w); x++) {
      const c = row[x]!;
      if (!isLegendChar(c)) {
        errors.push(`row ${y} col ${x}: unknown char '${c}'`);
        continue;
      }
      const kind = TILE_CHARS[c];
      if (kind !== undefined) {
        tiles[y * w + x] = kind;
        continue;
      }
      const marker = MARKER_CHARS[c];
      if (marker) {
        markers[marker].push({ x, y });
        continue;
      }
      tiles[y * w + x] = T.Object; // a-f / A-F
      (objects[c] ??= { char: c, cells: [], bounds: { x, y, w: 1, h: 1 } }).cells.push({ x, y });
    }
  });

  for (const o of Object.values(objects)) {
    const xs = o.cells.map((c) => c.x),
      ys = o.cells.map((c) => c.y);
    const x0 = Math.min(...xs),
      y0 = Math.min(...ys);
    o.bounds = { x: x0, y: y0, w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1 };
  }

  if (markers.spawn.length !== 1) errors.push(`want exactly one S, found ${markers.spawn.length}`);
  if (markers.goal.length !== 1) errors.push(`want exactly one G, found ${markers.goal.length}`);

  // params <-> letters
  const params = def.params ?? {};
  for (const ch of Object.keys(objects)) {
    const p = params[ch];
    if (!p) {
      errors.push(`letter '${ch}' has no params entry`);
      continue;
    }
    objects[ch]!.param = p;
    if (isActivator(ch) && p.kind !== 'plate' && p.kind !== 'lever' && p.kind !== 'target')
      errors.push(`'${ch}' is an activator: want plate, lever or target, got ${p.kind}`);
    if (isObjective(ch) && (p.kind === 'plate' || p.kind === 'lever' || p.kind === 'target'))
      errors.push(`'${ch}' is an objective: got ${p.kind}`);
  }
  for (const [ch, p] of Object.entries(params)) {
    if (!objects[ch]) {
      errors.push(`params entry '${ch}' has no cells in the grid`);
      continue;
    }
    if ((p.kind === 'plate' || p.kind === 'lever' || p.kind === 'target') && !objects[p.opens])
      errors.push(`'${ch}' opens '${p.opens}', which is not in the grid`);
    if ((p.kind === 'plate' || p.kind === 'lever' || p.kind === 'target') && !isObjective(p.opens))
      errors.push(`'${ch}' opens '${p.opens}': must be an objective letter A-F`);
    if (p.kind === 'balance') {
      const q = params[p.partner];
      if (!q || q.kind !== 'balance' || q.partner !== ch)
        errors.push(`'${ch}' balance partner '${p.partner}' is not a balance pointing back`);
    }
    if (p.kind === 'sinker' && !(p.travel > 0)) errors.push(`'${ch}' sinker travel must be > 0`);
    if (p.kind === 'geyser' && !(p.periodSec > (p.activeSec ?? 0.5) + 1 && (p.activeSec ?? 0.5) > 0))
      errors.push(`'${ch}' geyser: want 0 < activeSec and periodSec > activeSec + 1 (the warning second)`);
    if (p.kind === 'plate' && typeof p.weight === 'number' && !(Number.isInteger(p.weight) && p.weight >= 1))
      errors.push(`'${ch}' plate weight must be an integer >= 1`);
  }

  // level-level checks
  if (!(def.players.min >= MIN_PLAYERS && def.players.max <= MAX_PLAYERS_OBST && def.players.min <= def.players.max))
    errors.push(`players ${def.players.min}-${def.players.max} outside ${MIN_PLAYERS}-${MAX_PLAYERS_OBST}`);
  if (!(def.parSec > 0)) errors.push('parSec must be > 0');
  const inside = (r: Rect) => r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
  def.cameraZones?.forEach((z, i) => {
    if (!inside(z)) errors.push(`cameraZones[${i}] outside the grid`);
  });
  const wd = def.wind;
  if (wd) {
    if (!(wd.gustSec > 0 && wd.periodSec > wd.gustSec)) errors.push('wind: want 0 < gustSec < periodSec');
    if (wd.dir !== 1 && wd.dir !== -1) errors.push('wind: dir must be 1 or -1');
    if (wd.zone && !inside(wd.zone)) errors.push('wind: zone outside the grid');
  }
  def.enemies?.forEach((e, i) => {
    if (!inside({ x: e.x, y: e.y, w: 1, h: 1 }) || !(e.range >= 0)) errors.push(`enemies[${i}] outside the grid or with a negative range`);
  });
  def.hints?.forEach((hint, i) => {
    if (!inside({ x: hint.x, y: hint.y, w: 1, h: 1 })) errors.push(`hints[${i}] outside the grid`);
  });

  return { def, w, h, tiles, markers, objects, errors };
}

// Convenience for tests and tools that want a hard failure.
export function parseLevelStrict(def: LevelDef): ParsedLevel {
  const p = parseLevel(def);
  if (p.errors.length) throw new Error(`level ${def.id}: ${p.errors.join('; ')}`);
  return p;
}

export const kindAt = (p: ParsedLevel, x: number, y: number): TileKind =>
  x < 0 || y < 0 || x >= p.w || y >= p.h ? T.Empty : (p.tiles[y * p.w + x]! as TileKind);
