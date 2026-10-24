// Terrain for one game state (which objectives are open), standing segments, and the reachability graph between them.
// Pioneer edges = what the first explorer can do (jumps, towers of k, throws, rope swings); follower edges add the planted
// partner's hand (plan §5) on top of the plain ones.
import { DIFFICULTY_PARAMS, JUMP_V0, PLAYER_H, PLAYER_W, ROPE_LEN, TILE, TRAMPOLINE_MULT } from '../constants';
import { T, isHazardKind, isSolidKind } from '../legend';
import type { ParsedLevel, LevelObject } from '../parse';
import { buildGrid, boxHitsSolid, tileAt, tileOf, type TileGrid } from '../sim/tiles';
import { physicsFor, type PhysicsParams } from '../sim/player';
import { THROW_VX, THROW_VY } from '../sim/tuning';
import type { Difficulty } from '../../../difficulty';
import type { Cell, GameMode } from '../types';
import type { Mechanic } from '../mechanics';
import { EDGE_MOVE_SCALE, feetOfRow, simPlan, type CatchZone, type Landing, type Plan } from './sim';

// allow: the mechanics the explorer knows (the learning test's bot); undefined = all of them. ropeLen: the rope of the players (default ROPE_LEN).
export interface Env { n: number; mode: GameMode; diff: Difficulty; allow?: ReadonlySet<Mechanic>; ropeLen?: number }
export const can = (env: Env, m: Mechanic): boolean => !env.allow || env.allow.has(m);
export interface OpenState { open: Set<string>; doors: Set<number> }
export type EdgeKind = 'jump' | 'tower' | 'hand' | 'throw' | 'swing' | 'ladder' | 'ride';
export interface Edge {
  from: number; to: number; kind: EdgeKind;
  coop: boolean; // needs a teammate (tower, hand, throw, swing, balance)
  timing: boolean; // moving or crumbling surfaces, trampoline bounces, belts, one-shot timing
  steps: number; takeoffX: number; landX: number; // px; steps = simulated length
  plan?: Plan; k?: number; ring?: number; obj?: string; rise: number; // rise in px: takeoff floor minus landing floor (positive = up)
  landCell: Cell;
}
export interface Seg { id: number; row: number; x0: number; x1: number; tramp?: boolean } // tramp: boyas (the surface bounces)
export interface Graph {
  // shifted: platform tiles that exist only at the far end of a mover or balance (reachable by riding, never by a direct jump)
  grid: TileGrid; shifted: Uint8Array; segs: Seg[]; cellSeg: Int32Array; adj: Edge[][]; params: PhysicsParams; env: Env;
  ladders: { x: number; y0: number; y1: number }[];
}

export const CHAIN_MAX_DX = 4.5 * TILE; // chain mode: the rope (3.5 tiles) plus a tile of slack keeps a single jump under this, takeoff to landing
// Tied with 2 players the single rope holds the climber within ROPE_LEN of the partner left below (centre to centre). A step of `rise` px
// lands the climber at hypot(rise, one body width) from a base that hugs the wall: past ROPE_LEN no tower, hand or throw gets anybody
// up, whatever the jump envelope says. Only n = 2 is modelled (one link); with more players the cordada chain reaches further (plan B1).
export const ROPE_RISE_DX = PLAYER_W;
export const ropeCapsRise = (env: Env, rise: number): boolean => env.mode === 'chain' && env.n === 2 && rise > 0 && Math.hypot(rise, ROPE_RISE_DX) > (env.ropeLen ?? ROPE_LEN);
export const SWING_NEAR = 4.5 * TILE; // the swinger hangs from a ring within this of it (L + 1 tile)
export const SWING_FAR = 7.5 * TILE; // and lets go anywhere within this: pendulum + rope jump (assumption, F2a calibrates)
const HAND_FACE_PX = 20;

export const objectsOf = (p: ParsedLevel, kinds: string[]): LevelObject[] => Object.values(p.objects).filter((o) => o.param && kinds.includes(o.param.kind));

// Grid for a state: '%' resolved by mode, boxes solid, gates/ladders/movers/balances/doors by their state.
export function buildTerrain(p: ParsedLevel, env: Env, S: OpenState, doorGroups: Cell[][]): { grid: TileGrid; shifted: Uint8Array } {
  const g = buildGrid(p, env.mode);
  const shifted = new Uint8Array(g.w * g.h);
  for (const c of [...p.markers.box, ...p.markers.heavyBox]) g.cells[c.y * g.w + c.x] = T.Solid;
  const put = (x: number, y: number, k: number, onlyEmpty = false) => {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
    const i = y * g.w + x;
    if (onlyEmpty && !(g.cells[i] === T.Empty || g.cells[i] === T.Object)) return;
    g.cells[i] = k;
    if (onlyEmpty) shifted[i] = 1;
  };
  const hasActivator = (ch: string) => Object.values(p.def.params ?? {}).some((q) => (q.kind === 'plate' || q.kind === 'lever') && q.opens === ch);
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (!q) continue;
    const open = S.open.has(o.char) || !hasActivator(o.char);
    for (const c of o.cells) put(c.x, c.y, T.Empty);
    if (q.kind === 'gate') { if (!S.open.has(o.char)) for (const c of o.cells) put(c.x, c.y, T.Solid); }
    else if (q.kind === 'ladder') { if (open) for (const c of o.cells) put(c.x, c.y, T.Ladder); }
    else if (q.kind === 'mover') {
      for (const c of o.cells) put(c.x, c.y, T.OneWay);
      if (open) for (const c of o.cells) put(c.x + Math.round(q.dx), c.y + Math.round(q.dy), T.OneWay, true);
    } else if (q.kind === 'balance') {
      for (const c of o.cells) put(c.x, c.y, T.OneWay);
      if (env.n >= 3) for (const c of o.cells) for (const s of [q.travel, -q.travel]) put(c.x, c.y + Math.round(s), T.OneWay, true);
    }
  }
  doorGroups.forEach((cells, i) => { if (S.doors.has(i)) for (const c of cells) put(c.x, c.y, T.Empty); });
  return { grid: g, shifted };
}

export function doorGroupsOf(p: ParsedLevel): Cell[][] {
  const seen = new Set<number>();
  const groups: Cell[][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (p.tiles[y * p.w + x] !== T.Door || seen.has(y * p.w + x)) continue;
    const grp: Cell[] = [], stack = [{ x, y }];
    seen.add(y * p.w + x);
    while (stack.length) {
      const c = stack.pop()!; grp.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = c.x + dx, ny = c.y + dy, i = ny * p.w + nx;
        if (nx >= 0 && ny >= 0 && nx < p.w && ny < p.h && p.tiles[i] === T.Door && !seen.has(i)) { seen.add(i); stack.push({ x: nx, y: ny }); }
      }
    }
    groups.push(grp);
  }
  return groups;
}

const supports = (k: number): boolean => isSolidKind(k) || k === T.OneWay || k === T.Trampoline;
export const isStandingCell = (g: TileGrid, x: number, y: number): boolean => {
  const k = tileAt(g, x, y);
  return !isSolidKind(k) && !isHazardKind(k) && k !== T.OneWay && k !== T.Trampoline && supports(tileAt(g, x, y + 1));
};
const isTrampCell = (g: TileGrid, x: number, y: number): boolean => tileAt(g, x, y + 1) === T.Trampoline;

export function buildSegments(g: TileGrid): { segs: Seg[]; cellSeg: Int32Array } {
  const segs: Seg[] = [];
  const cellSeg = new Int32Array(g.w * g.h).fill(-1);
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      if (!isStandingCell(g, x, y)) { x++; continue; }
      const x0 = x, tramp = isTrampCell(g, x, y);
      while (x < g.w && isStandingCell(g, x, y) && isTrampCell(g, x, y) === tramp) x++;
      const s: Seg = { id: segs.length, row: y, x0, x1: x - 1, tramp };
      segs.push(s);
      for (let i = x0; i < x; i++) cellSeg[y * g.w + i] = s.id;
    }
  }
  return { segs, cellSeg };
}

export function findLadders(g: TileGrid): { x: number; y0: number; y1: number }[] {
  const out: { x: number; y0: number; y1: number }[] = [];
  for (let x = 0; x < g.w; x++) {
    let y = 0;
    while (y < g.h) {
      if (tileAt(g, x, y) !== T.Ladder) { y++; continue; }
      const y0 = y;
      while (y < g.h && tileAt(g, x, y) === T.Ladder) y++;
      out.push({ x, y0, y1: y - 1 });
    }
  }
  return out;
}

const startXs = (s: Seg): number[] => {
  const lo = s.x0 * TILE - 17, hi = (s.x1 + 1) * TILE - 17;
  const xs = new Set<number>([lo, hi, s.x0 * TILE, (s.x1 + 1) * TILE - PLAYER_W]); // the flush spots matter when a hazard hugs the end
  const cells = s.x1 - s.x0 + 1;
  const n = Math.min(6, cells + 1);
  for (let i = 1; i < n; i++) xs.add(Math.round(lo + ((hi - lo) * i) / n));
  return [...xs].sort((a, b) => a - b);
};

// Plans that leave a segment on foot: walk off, run and jump at the edge, jump from a spot, drop through a one-way.
export function planSet(g: TileGrid, s: Seg, f: number): Plan[] {
  const out: Plan[] = [];
  const feetY = feetOfRow(s.row);
  if (s.tramp) { // the boya throws whoever lands on it at 1.45 * v0, steering with the stick
    for (const x of startXs(s)) for (const dir of [-1, 0, 1] as const) for (const air of dir === 0 ? ['hold' as const] : ['hold' as const, 'brake' as const]) out.push({ x, feetY, dir, trigger: 'launch', k: 0, air, f, vx0: dir * 330 * f * 0.5, vy0: -JUMP_V0 * TRAMPOLINE_MULT });
    return out;
  }
  const base = { feetY, f, k: 0 as number, air: 'hold' as const };
  const ends: { dir: -1 | 1; x: number }[] = [
    { dir: 1, x: Math.max(s.x0 * TILE - 17, (s.x1 + 1) * TILE - TILE) },
    { dir: -1, x: Math.min((s.x1 + 1) * TILE - 17, s.x0 * TILE + TILE - PLAYER_W) },
  ];
  for (const e of ends) {
    out.push({ ...base, x: e.x, dir: e.dir, trigger: 'walk' });
    for (const k of [0, 3]) for (const air of ['hold', 'brake'] as const) out.push({ ...base, x: e.x, dir: e.dir, trigger: 'edge', k, air });
    const endX = e.dir === 1 ? (s.x1 + 1) * TILE : s.x0 * TILE;
    const runStart = Math.max(s.x0 * TILE - 17, Math.min((s.x1 + 1) * TILE - 17, e.dir === 1 ? endX - 5 * TILE : endX + 5 * TILE - PLAYER_W));
    for (const lead of [16, 32, 56, 80]) for (const air of ['hold', 'brake'] as const) out.push({ ...base, x: runStart, dir: e.dir, trigger: 'edge', k: 0, lead, endX, air }); // a run-up that jumps early (hazards hugging the end)
  }
  for (const x of startXs(s)) {
    out.push({ ...base, x, dir: 0, trigger: 'at' });
    for (const dir of [-1, 1] as const) for (const air of ['hold', 'brake'] as const) out.push({ ...base, x, dir, trigger: 'at', air });
  }
  const onOneWay = tileAt(g, s.x0, s.row + 1) === T.OneWay || tileAt(g, s.x1, s.row + 1) === T.OneWay;
  if (onOneWay) for (const x of startXs(s)) for (const dir of [-1, 0, 1] as const) out.push({ ...base, x, dir, trigger: 'drop' });
  return out;
}

// Towers of k stacked bases (plan §12: +46 px per base, needs n >= k + 1): the climber starts on the bases' heads hugging a wall.
function towerPlans(g: TileGrid, s: Seg, f: number, maxK: number): { plan: Plan; k: number }[] {
  const out: { plan: Plan; k: number }[] = [];
  for (let k = 1; k <= maxK; k++) {
    const ends: { dir: -1 | 1; x: number }[] = [
      { dir: 1, x: (s.x1 + 1) * TILE - PLAYER_W },
      { dir: -1, x: s.x0 * TILE },
    ];
    for (const e of ends) {
      const feetY = feetOfRow(s.row) - PLAYER_H * k;
      if (boxHitsSolid(g, e.x, feetY - PLAYER_H, PLAYER_W, PLAYER_H * (k + 1))) continue;
      out.push({ k, plan: { x: e.x, feetY, dir: e.dir, trigger: 'at', k: 0, air: 'hold', f } });
    }
  }
  return out;
}

export function catchZonesFor(g: TileGrid, segs: Seg[], keep: (id: number) => boolean, handZoneTiles: number): Map<number, CatchZone[]> {
  const map = new Map<number, CatchZone[]>();
  const add = (tx: number, z: CatchZone) => { const l = map.get(tx) ?? []; l.push(z); map.set(tx, l); };
  for (const s of segs) {
    if (!keep(s.id)) continue;
    const top = (s.row + 1) * TILE, zone = handZoneTiles * TILE;
    // left end: the face is x = x0 * TILE, the catcher reaches to the left; right end mirrors it
    const left: CatchZone = { x0: s.x0 * TILE - HAND_FACE_PX - PLAYER_W + 8, x1: s.x0 * TILE + 6, yTop: top + 2, yBot: top + zone, cx: s.x0, ty: s.row };
    const right: CatchZone = { x0: (s.x1 + 1) * TILE - 6, x1: (s.x1 + 1) * TILE + HAND_FACE_PX + PLAYER_W - 8, yTop: top + 2, yBot: top + zone, cx: s.x1, ty: s.row };
    for (const z of [left, right]) {
      const tx0 = tileOf(z.x0), tx1 = tileOf(z.x1);
      for (let tx = tx0; tx <= tx1; tx++) add(tx, z);
    }
  }
  return map;
}

export interface GraphOpts { pioneer: boolean; catchTargets?: Set<number>; cache?: SimCache }

// Sim results of one validation, shared by the graphs it builds (the closure rebuilds the terrain whenever something opens, and most
// segments do not change). The key is the whole terrain within CACHE_COLS columns of the segment plus the plan, relative to the
// segment: translation by whole tiles does not change a trajectory.
export type SimCache = Map<string, Map<string, (Omit<Landing, 'cx' | 'ty'> & { dcx: number; dty: number }) | null>>;
export const newSimCache = (): SimCache => new Map();
const CACHE_COLS = 26;
const planSig = (p: Plan, s: Seg): string => `${p.trigger}|${p.dir}|${p.x - s.x0 * TILE}|${p.feetY - s.row * TILE}|${p.k}|${p.lead ?? ''}|${p.endX === undefined ? '' : p.endX - s.x0 * TILE}|${p.air}|${p.f}|${p.vx0 ?? ''}|${p.vy0 ?? ''}`;
function windowKey(g: TileGrid, cols: string[], s: Seg, params: PhysicsParams): string {
  let k = `${s.row}:${s.x1 - s.x0}:${params.coyote}:${params.buffer}:${params.stickyEdges ? 1 : 0}:${g.h}:`;
  for (let x = s.x0 - CACHE_COLS; x <= s.x1 + CACHE_COLS; x++) k += (x < 0 || x >= g.w ? 'W' : cols[x]!) + '/';
  return k;
}
function simCached(grid: TileGrid, params: PhysicsParams, s: Seg, plan: Plan, bucket: Map<string, (Omit<Landing, 'cx' | 'ty'> & { dcx: number; dty: number }) | null>): Landing | null {
  const sig = planSig(plan, s);
  let hit = bucket.get(sig);
  if (hit === undefined) {
    const l = simPlan(grid, params, plan);
    hit = l ? { dcx: l.cx - s.x0, dty: l.ty - s.row, takeoffX: l.takeoffX - s.x0 * TILE, landX: l.landX - s.x0 * TILE, steps: l.steps, viaHand: false, apexRise: l.apexRise } : null;
    bucket.set(sig, hit);
  }
  return hit ? { cx: hit.dcx + s.x0, ty: hit.dty + s.row, takeoffX: hit.takeoffX + s.x0 * TILE, landX: hit.landX + s.x0 * TILE, steps: hit.steps, viaHand: false, apexRise: hit.apexRise } : null;
}

export const surfaceTiming = (g: TileGrid, row: number, x0: number, x1: number): boolean => {
  for (let x = x0; x <= x1; x++) { const k = tileAt(g, x, row + 1); if (k === T.Crumble || k === T.BeltL || k === T.BeltR) return true; }
  return false;
};

export function buildGraph(p: ParsedLevel, env: Env, S: OpenState, doors: Cell[][], opts: GraphOpts): Graph {
  const { grid, shifted } = buildTerrain(p, env, S, doors);
  const { segs, cellSeg } = buildSegments(grid);
  const params = physicsFor(env.diff);
  const dp = DIFFICULTY_PARAMS[env.diff];
  const adj: Edge[][] = segs.map(() => []);
  const ladders = findLadders(grid);
  const best = new Map<string, Edge>();
  const addEdge = (e: Edge) => {
    if (e.from === e.to) return;
    const key = `${e.from}>${e.to}:${e.kind}`;
    const old = best.get(key);
    if (!old || e.steps < old.steps) best.set(key, e);
  };
  const toEdge = (from: Seg, l: Landing, kind: EdgeKind, plan: Plan, coop: boolean, k?: number): Edge | null => {
    const to = cellSeg[l.ty * grid.w + l.cx];
    if (to === undefined || to < 0) return null;
    if (shifted[(l.ty + 1) * grid.w + l.cx]) return null; // that platform is somewhere else until somebody rides it
    const dx = Math.abs(l.landX - l.takeoffX);
    if (env.mode === 'chain' && dx > CHAIN_MAX_DX) return null;
    const tgt = segs[to]!;
    if (ropeCapsRise(env, feetOfRow(from.row) - feetOfRow(tgt.row))) return null;
    if ((from.tramp || tgt.tramp) && !can(env, 'spring')) return null;
    const timing = from.tramp === true || tgt.tramp === true || surfaceTiming(grid, from.row, from.x0, from.x1) || surfaceTiming(grid, tgt.row, tgt.x0, tgt.x1) || l.steps > 140;
    return { from: from.id, to, kind, coop, timing, steps: l.steps, takeoffX: l.takeoffX, landX: l.landX, plan, k, rise: feetOfRow(from.row) - feetOfRow(tgt.row), landCell: { x: l.cx, y: l.ty } };
  };
  const f = EDGE_MOVE_SCALE;
  const catches = opts.catchTargets && can(env, 'hand') ? catchZonesFor(grid, segs, (id) => opts.catchTargets!.has(id), dp.handZoneTiles) : undefined;
  const maxTower = Math.min(3, env.n - 1);

  const cols: string[] = [];
  for (let x = 0; x < grid.w; x++) { let c = ''; for (let y = 0; y < grid.h; y++) c += String.fromCharCode(48 + grid.cells[y * grid.w + x]!); cols.push(c); }
  const cache = opts.cache ?? newSimCache();
  for (const s of segs) {
    if (s.tramp && !can(env, 'spring')) continue;
    const wk = windowKey(grid, cols, s, params);
    let bucket = cache.get(wk);
    if (!bucket) { bucket = new Map(); cache.set(wk, bucket); }
    for (const plan of planSet(grid, s, f).filter((q) => can(env, 'jump') || q.trigger === 'walk' || s.tramp)) {
      const l = simCached(grid, params, s, plan, bucket);
      if (l) { const e = toEdge(s, l, 'jump', plan, false); if (e) addEdge(e); }
      if (catches && plan.trigger !== 'walk' && plan.trigger !== 'drop') {
        const h = simPlan(grid, params, plan, catches);
        if (h && h.viaHand) { const e = toEdge(s, h, 'hand', plan, true); if (e) addEdge(e); }
      }
    }
    if (opts.pioneer && maxTower >= 1 && can(env, 'tower')) {
      for (const { plan, k } of towerPlans(grid, s, f, maxTower)) {
        const l = simCached(grid, params, s, plan, bucket);
        if (l) { const e = toEdge(s, l, 'tower', plan, true, k); if (e) addEdge(e); }
      }
    }
    if (opts.pioneer && env.n >= 2 && can(env, 'throw')) {
      // throw: the thrower lifts a partner and launches him at (420, -950) px/s (plan §2)
      for (const dir of [-1, 1] as const) {
        const x = dir === 1 ? (s.x1 + 1) * TILE - PLAYER_W : s.x0 * TILE;
        const plan: Plan = { x, feetY: feetOfRow(s.row) - PLAYER_H, dir, trigger: 'launch', k: 0, air: 'hold', f: 1, vx0: dir * THROW_VX * f, vy0: THROW_VY * f };
        const l = simCached(grid, params, s, plan, bucket);
        if (l) { const e = toEdge(s, l, 'throw', plan, true); if (e) addEdge(e); }
      }
    }
  }

  // Ladders: every segment next to a ladder column (same row range, or the ledge one above its top) is connected to the others.
  for (const lad of can(env, 'ladder') ? ladders : []) {
    const attached = new Set<number>();
    for (const s of segs) {
      if (s.row < lad.y0 - 1 || s.row > lad.y1) continue;
      if (lad.x >= s.x0 - 1 && lad.x <= s.x1 + 1) attached.add(s.id);
    }
    const ids = [...attached];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const sa = segs[a]!, sb = segs[b]!;
      addEdge({ from: a, to: b, kind: 'ladder', coop: false, timing: false, steps: 60 + Math.abs(sa.row - sb.row) * 10, takeoffX: lad.x * TILE, landX: lad.x * TILE, rise: feetOfRow(sa.row) - feetOfRow(sb.row), landCell: { x: Math.min(Math.max(lad.x, sb.x0), sb.x1), y: sb.row } });
    }
  }

  // Movers and balances: riding connects the segment above each of the platform's positions.
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (!q || (q.kind !== 'mover' && q.kind !== 'balance')) continue;
    if (q.kind === 'balance' && env.n < 3) continue;
    if (!can(env, q.kind)) continue;
    const shifts: [number, number][] = q.kind === 'mover' ? [[0, 0], [Math.round(q.dx), Math.round(q.dy)]] : [[0, 0], [0, Math.round(q.travel)], [0, -Math.round(q.travel)]];
    if (q.kind === 'mover' && !adjOpen(p, o.char, S)) continue;
    const ids: number[] = [];
    for (const [sx, sy] of shifts) {
      const top = Math.min(...o.cells.map((c) => c.y)) + sy;
      for (const c of o.cells) {
        if (c.y + sy !== top) continue;
        const id = cellSeg[(top - 1) * grid.w + c.x + sx];
        if (id !== undefined && id >= 0 && !ids.includes(id)) ids.push(id);
      }
    }
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const sa = segs[a]!, sb = segs[b]!;
      addEdge({ from: a, to: b, kind: 'ride', obj: o.char, coop: q.kind === 'balance', timing: true, steps: 240, takeoffX: sa.x0 * TILE, landX: sb.x0 * TILE, rise: feetOfRow(sa.row) - feetOfRow(sb.row), landCell: { x: sb.x0, y: sb.row } });
    }
  }

  // Rope swings (Encadenados only): a partner anchors on a ring, the other hangs from it and lets go within SWING_FAR.
  if (env.mode === 'chain' && env.n >= 2 && p.markers.ring.length && can(env, 'swing')) {
    const center = (s: Seg, x: number) => ({ x: x * TILE + TILE / 2, y: s.row * TILE + TILE / 2 });
    for (const ring of p.markers.ring) {
      const rc = { x: ring.x * TILE + TILE / 2, y: ring.y * TILE + TILE / 2 };
      const near: { s: Seg; x: number }[] = [], far: { s: Seg; x: number }[] = [];
      for (const s of segs) {
        let bn = Infinity, bx = s.x0, bf = Infinity, fx = s.x0;
        for (let x = s.x0; x <= s.x1; x++) {
          const c = center(s, x), d = Math.hypot(c.x - rc.x, c.y - rc.y);
          if (d < bn) { bn = d; bx = x; }
          if (d < bf) { bf = d; fx = x; }
        }
        if (bn <= SWING_NEAR) near.push({ s, x: bx });
        if (bf <= SWING_FAR && seesFrom(grid, rc, center(s, fx))) far.push({ s, x: fx });
      }
      const ringIdx = p.markers.ring.indexOf(ring);
      for (const a of near) for (const b of far) {
        if (a.s.id === b.s.id) continue;
        addEdge({ ring: ringIdx, from: a.s.id, to: b.s.id, kind: 'swing', coop: true, timing: false, steps: 90, takeoffX: a.x * TILE, landX: b.x * TILE, rise: feetOfRow(a.s.row) - feetOfRow(b.s.row), landCell: { x: b.x, y: b.s.row } });
      }
    }
  }

  for (const e of best.values()) adj[e.from]!.push(e);
  return { grid, shifted, segs, cellSeg, adj, params, env, ladders };
}

const adjOpen = (p: ParsedLevel, ch: string, S: OpenState): boolean => S.open.has(ch) || !Object.values(p.def.params ?? {}).some((q) => (q.kind === 'plate' || q.kind === 'lever') && q.opens === ch);

// Straight line free of solid tiles (the swing's arc stays clear).
function seesFrom(g: TileGrid, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
    if (isSolidKind(tileAt(g, tileOf(x), tileOf(y)))) return false;
  }
  return true;
}

export interface PathStep { edge: Edge }
// Dijkstra over segments: time in seconds, cooperative edges cost 6 s extra so the plain route wins when there is one.
export function shortest(g: Graph, start: number, goal: number | ((id: number) => boolean), edgeOk?: (e: Edge) => boolean): { dist: Float64Array; prev: (Edge | null)[]; reached: Set<number>; hit: number } {
  const n = g.segs.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev: (Edge | null)[] = new Array(n).fill(null);
  const done = new Uint8Array(n);
  const isGoal = typeof goal === 'function' ? goal : (id: number) => id === goal;
  dist[start] = 0;
  let hit = -1;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) break;
    done[u] = 1;
    if (hit < 0 && isGoal(u)) hit = u;
    for (const e of g.adj[u]!) {
      if (edgeOk && !edgeOk(e)) continue;
      const w = e.steps / 60 + (e.coop ? 6 : 0);
      if (dist[u]! + w < dist[e.to]!) { dist[e.to] = dist[u]! + w; prev[e.to] = e; }
    }
  }
  const reached = new Set<number>();
  for (let i = 0; i < n; i++) if (dist[i]! < Infinity) reached.add(i);
  return { dist, prev, reached, hit };
}

export const pathTo = (prev: (Edge | null)[], id: number): Edge[] => {
  const out: Edge[] = [];
  for (let e = prev[id]; e; e = prev[e.from]!) out.unshift(e);
  return out;
};
export { ROPE_LEN };
