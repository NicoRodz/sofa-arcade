// The v2 mutation (design section 5): stations that move. The map carries DATA (`MapDef.mutation`: at, warn, revertAt, ops); the generator rolls it, the sim only applies it, so it never touches the RNG.
// The change is atomic in the tick `at` (ops in list order). A station travels with its whole state (the same index: items, baking, fire, kneading progress). A chef using it simply finds nothing in front next tick (the progress stays
// in the station, and the chop is recomputed every tick); a chef or a loose item on a tile that stops being floor goes to the nearest free floor tile (breadth first, ties N-E-S-O; chefs by id, then items by id). Implemented by T1a.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { mutationValidate } from '../../validate/mech/mutation';
import { mutationStamp } from '../../gen/stamps/mutation';
import { newSurfaceState } from '../../surfaces/config';
import { parseTile } from '../../maps';
import type { Game, Station } from '../../round/state';
import { TICK_MS } from '../../round/state';
import { applyRows, type MutationV2, type Op } from './ops';
import { refeed } from '../woodOven/state';
import { scanHandles, setHandles } from '../kneader/state';
import { emitMech } from '../kneader/call';

interface Live {
  m: MutationV2;
  inverse: readonly Op[];
  rows: string[]; // the letters of the map as they stand now (for the tiles of the event)
  tick: number;
  phase: 0 | 1 | 2 | 3; // 0 waiting, 1 warned, 2 applied, 3 reverted
}
export const liveOf = (g: Game): Live | undefined => g.mech?.ext?.mutation as Live | undefined;

/** createGame hands the module its data (before mechStart). */
export function armMutation(g: Game, m: MutationV2, inverse: readonly Op[], rows: readonly string[]) {
  g.mech!.ext = { ...g.mech!.ext, mutation: { m, inverse, rows: [...rows], tick: 0, phase: 0 } satisfies Live };
}

const NESW = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const stationAt = (g: Game, x: number, y: number): Station | undefined => g.stations.find((s) => s.tx === x && s.ty === y);
const plainFloor = (g: Game, x: number, y: number) => {
  const t = g.grid[y]?.[x];
  return t?.kind === 'floor' && !t.mech;
};
/** The nearest plain floor tile from (x, y): breadth first over the map, neighbours in N-E-S-O order. */
function nearestFree(g: Game, x: number, y: number): [number, number] | null {
  const seen = new Set<number>([y * 16 + x]);
  const q: [number, number][] = [[x, y]];
  for (let i = 0; i < q.length; i++) {
    const [cx, cy] = q[i]!;
    if (plainFloor(g, cx, cy) && (cx !== x || cy !== y)) return [cx, cy];
    for (const [dx, dy] of NESW) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= 16 || ny >= 9 || seen.has(ny * 16 + nx)) continue;
      seen.add(ny * 16 + nx);
      q.push([nx, ny]);
    }
  }
  return null;
}

/** One op on the live round. */
function applyOp(g: Game, op: Op) {
  const [kind, a, b] = op;
  const tile = (x: number, y: number) => g.grid[y]![x]!;
  if (kind === 'tile') {
    const t = parseTile(b as string, false, g.flags?.mech);
    if (!t) return;
    g.grid[a[1]]![a[0]] = t;
    if (t.kind === 'station')
      g.stations.push({
        kind: t.station,
        tx: a[0],
        ty: a[1],
        crate: t.crate,
        item: null,
        progress: 0,
        inputs: [],
        done: false,
        count: 0,
        clean: 0,
        owner: 0,
      });
    if ((b as string) === 'i' || '→←↑↓'.includes(b as string)) g.surf ??= newSurfaceState(); // ice and belts only act in a round that has `surf`
    return;
  }
  const p = b as readonly [number, number];
  const sa = stationAt(g, a[0], a[1]),
    sb = stationAt(g, p[0], p[1]);
  const ta = tile(a[0], a[1]),
    tb = tile(p[0], p[1]);
  g.grid[p[1]]![p[0]] = ta;
  g.grid[a[1]]![a[0]] = kind === 'swap' ? tb : { kind: 'floor', spawn: false };
  if (sa) Object.assign(sa, { tx: p[0], ty: p[1] });
  if (sb && kind === 'swap') Object.assign(sb, { tx: a[0], ty: a[1] });
}

function relocate(g: Game): number {
  let moved = 0;
  for (const p of [...g.players.values()].sort((u, v) => u.id - v.id)) {
    const x = Math.floor(p.x),
      y = Math.floor(p.y);
    if (g.grid[y]?.[x]?.kind === 'floor') continue;
    const to = nearestFree(g, x, y);
    if (!to) continue;
    Object.assign(p, { x: to[0] + 0.5, y: to[1] + 0.5, vx: 0, vy: 0 });
    moved++;
  }
  for (const f of [...g.floor].sort((u, v) => u.id - v.id)) {
    if (g.grid[f.ty]?.[f.tx]?.kind === 'floor') continue;
    const to = nearestFree(g, f.tx, f.ty);
    if (!to) continue;
    f.tx = to[0];
    f.ty = to[1];
    moved++;
  }
  return moved;
}

/** After stations moved: the kneader's handles and the bellows' oven follow the new positions; the oil layer forgets what a station now covers. */
function rescan(g: Game) {
  g.stations.forEach((s, i) => s.kind === 'kneader' && g.mech!.kneader && setHandles(g, i, scanHandles(g, s)));
  if (g.flags?.mech.woodOven) refeed(g);
  if (g.mech!.tile)
    for (let i = 0; i < 144; i++) if (g.mech!.tile[i] && g.grid[Math.floor(i / 16)]?.[i % 16]?.kind !== 'floor') g.mech!.tile[i] = 0;
}

function run(g: Game, live: Live, ops: readonly Op[], id: string) {
  const before = live.rows;
  for (const op of ops) applyOp(g, op);
  live.rows = applyRows(before, ops);
  const moved = relocate(g);
  rescan(g);
  const tiles = live.rows.flatMap((r, y) => [...r].flatMap((c, x) => (c !== before[y]![x] ? [{ x, y, to: c }] : [])));
  emitMech(g, 'mutate:apply', { id, tiles, moved });
}

export const mutationModule: MechModule = {
  ...noopHooks,
  id: 'mutation',
  tanda: 'T1a',
  validate: mutationValidate,
  stamp: mutationStamp,
  mutation(g) {
    const live = liveOf(g);
    if (!live) return;
    const { m } = live;
    live.tick++;
    if (live.phase === 0 && live.tick >= m.at - m.warn) {
      live.phase = 1;
      const dests = m.ops.map((op) => op[2]);
      emitMech(g, 'mutate:warn', {
        id: 'mutation2',
        title: '¡SE REORDENA LA COCINA!',
        blurb: 'Las estaciones cambian de lugar',
        inMs: Math.round(m.warn * TICK_MS),
        dests,
      });
    }
    if (live.phase === 1 && live.tick >= m.at) {
      live.phase = 2;
      run(g, live, m.ops, 'mutation2');
    }
    if (live.phase === 2 && m.revertAt !== null && live.tick >= m.revertAt) {
      live.phase = 3;
      run(g, live, live.inverse, 'mutation2:revert');
    }
  },
  hashExtra(g) {
    const live = liveOf(g);
    return live ? [live.tick, live.phase] : [];
  },
};
