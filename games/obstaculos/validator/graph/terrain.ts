// Environment numbers and terrain for one game state: the grid, its standing segments, ladders and door groups.
import { DIFFICULTY_PARAMS, type DifficultyParams, PLAYER_H, PLAYER_W, ROPE_LEN, TILE } from '../../constants';
import { T, isHazardKind, isSolidKind } from '../../legend';
import type { ParsedLevel, LevelObject } from '../../parse';
import { buildGrid, tileAt, tileOf, type TileGrid } from '../../sim/world/tiles';
import { physicsFor, type PhysicsParams } from '../../sim/player/player';
import { campaignParams, dparamsForCampaign, physicsOfWorld } from '../../sim/rules/campaign';
import type { Mechanic } from '../../mechanics';
import type { Cell } from '../../types';
import { feetOfRow } from '../sim';
import type { Edge, Env, OpenState, Seg } from './types';

export function envParams(env: Env): { physics: PhysicsParams; dp: DifficultyParams; ropeLen: number } {
  if (env.world) {
    const c = campaignParams(env.n, env.world);
    return { physics: physicsOfWorld(c), dp: dparamsForCampaign(c), ropeLen: env.ropeLen ?? c.ropeLen };
  }
  return { physics: physicsFor(env.diff), dp: DIFFICULTY_PARAMS[env.diff], ropeLen: env.ropeLen ?? ROPE_LEN };
}
export const can = (env: Env, m: Mechanic): boolean => !env.allow || env.allow.has(m);

export const CHAIN_MAX_DX = 4.5 * TILE; // chain mode: the rope (3.5 tiles) plus a tile of slack keeps a single jump under this, takeoff to landing
// Tied with 2 players the single rope holds the climber within ROPE_LEN of the partner left below (centre to centre). A step of `rise` px
// lands the climber at hypot(rise, one body width) from a base that hugs the wall: past ROPE_LEN no tower, hand or throw gets anybody
// up, whatever the jump envelope says. Only n = 2 is modelled (one link); with more players the cordada chain reaches further (plan B1).
export const ROPE_RISE_DX = PLAYER_W;
export const ropeCapsRise = (env: Env, rise: number): boolean =>
  env.mode === 'chain' && env.n === 2 && rise > 0 && Math.hypot(rise, ROPE_RISE_DX) > envParams(env).ropeLen;
export const SWING_NEAR = 4.5 * TILE; // the swinger hangs from a ring within this of it (L + 1 tile)
export const SWING_FAR = 7.5 * TILE; // and lets go anywhere within this: pendulum + rope jump (assumption, F2a calibrates)
// Every ring of the level: the plain 'o' ones, then the elastic 'u' ones (campaign dynamic 11). The validator models an elastic ring as a plain one (it only ADDS reach in the sim).
export const ringsOf = (p: ParsedLevel): Cell[] => [...p.markers.ring, ...p.markers.bungee];
export const objectsOf = (p: ParsedLevel, kinds: string[]): LevelObject[] =>
  Object.values(p.objects).filter((o) => o.param && kinds.includes(o.param.kind));

// Grid for a state: '%' resolved by mode, boxes solid, gates/ladders/movers/balances/doors by their state.
export function buildTerrain(p: ParsedLevel, env: Env, S: OpenState, doorGroups: Cell[][]): { grid: TileGrid; shifted: Uint8Array } {
  const g = buildGrid(p, env.mode);
  const shifted = new Uint8Array(g.w * g.h);
  if (p.markers.lantern.length) for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === T.Crystal) g.cells[i] = T.Solid; // dynamic 10: crystals count as LIT (solid) whenever the level has a lantern; who carries it is not modelled
  for (const c of [...p.markers.box, ...p.markers.heavyBox]) g.cells[c.y * g.w + c.x] = T.Solid;
  const put = (x: number, y: number, k: number, onlyEmpty = false) => {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
    const i = y * g.w + x;
    if (onlyEmpty && !(g.cells[i] === T.Empty || g.cells[i] === T.Object)) return;
    g.cells[i] = k;
    if (onlyEmpty) shifted[i] = 1;
  };
  const hasActivator = (ch: string) =>
    Object.values(p.def.params ?? {}).some((q) => (q.kind === 'plate' || q.kind === 'lever' || q.kind === 'target') && q.opens === ch);
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (!q) continue;
    const open = S.open.has(o.char) || !hasActivator(o.char);
    for (const c of o.cells) put(c.x, c.y, T.Empty);
    if (q.kind === 'gate') {
      if (!S.open.has(o.char)) for (const c of o.cells) put(c.x, c.y, T.Solid);
    } else if (q.kind === 'ladder') {
      if (open) for (const c of o.cells) put(c.x, c.y, T.Ladder);
    } else if (q.kind === 'mover') {
      for (const c of o.cells) put(c.x, c.y, T.OneWay);
      if (open) for (const c of o.cells) put(c.x + Math.round(q.dx), c.y + Math.round(q.dy), T.OneWay, true);
    } else if (q.kind === 'sinker') {
      for (const c of o.cells) put(c.x, c.y, T.OneWay); // dynamic 12: the rock at its resting height; sinking is not modelled (the sim bot shows it)
    } else if (q.kind === 'geyser') {
      for (const c of o.cells) put(c.x, c.y + 1, T.Trampoline); // dynamic 12: a vent is modelled as a spring under it (the real one launches harder, 1.65 x v0 vs 1.45, and only 0.5 s every period)
    } else if (q.kind === 'balance') {
      for (const c of o.cells) put(c.x, c.y, T.OneWay);
      if (env.n >= 3 || env.world)
        for (const c of o.cells) for (const s of [q.travel, -q.travel]) put(c.x, c.y + Math.round(s), T.OneWay, true); // campaign: also with 2 (sim/entities.ts stepMovers)
    }
  }
  doorGroups.forEach((cells, i) => {
    if (S.doors.has(i)) for (const c of cells) put(c.x, c.y, T.Empty);
  });
  return { grid: g, shifted };
}

export function doorGroupsOf(p: ParsedLevel): Cell[][] {
  const seen = new Set<number>();
  const groups: Cell[][] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.tiles[y * p.w + x] !== T.Door || seen.has(y * p.w + x)) continue;
      const grp: Cell[] = [],
        stack = [{ x, y }];
      seen.add(y * p.w + x);
      while (stack.length) {
        const c = stack.pop()!;
        grp.push(c);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = c.x + dx,
            ny = c.y + dy,
            i = ny * p.w + nx;
          if (nx >= 0 && ny >= 0 && nx < p.w && ny < p.h && p.tiles[i] === T.Door && !seen.has(i)) {
            seen.add(i);
            stack.push({ x: nx, y: ny });
          }
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
      if (!isStandingCell(g, x, y)) {
        x++;
        continue;
      }
      const x0 = x,
        tramp = isTrampCell(g, x, y);
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
      if (tileAt(g, x, y) !== T.Ladder) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < g.h && tileAt(g, x, y) === T.Ladder) y++;
      out.push({ x, y0, y1: y - 1 });
    }
  }
  return out;
}

export const surfaceTiming = (g: TileGrid, row: number, x0: number, x1: number): boolean => {
  for (let x = x0; x <= x1; x++) {
    const k = tileAt(g, x, row + 1);
    if (k === T.Crumble || k === T.BeltL || k === T.BeltR) return true;
  }
  return false;
};

export const adjOpen = (p: ParsedLevel, ch: string, S: OpenState): boolean =>
  S.open.has(ch) ||
  !Object.values(p.def.params ?? {}).some((q) => (q.kind === 'plate' || q.kind === 'lever' || q.kind === 'target') && q.opens === ch);

// Straight line free of solid tiles (the swing's arc stays clear).
export function seesFrom(g: TileGrid, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps,
      y = a.y + ((b.y - a.y) * i) / steps;
    if (isSolidKind(tileAt(g, tileOf(x), tileOf(y)))) return false;
  }
  return true;
}

// A follower pulled across a gap (see buildGraph): it falls off the near edge and hangs under the far ledge, at most ropeLen + half a body below it. No spikes or liquid in that band.
export function pullSafe(g: TileGrid, from: Seg, to: Seg, e: Edge, ropeLen: number): boolean {
  const x0 = tileOf(Math.min(e.takeoffX, e.landX) + PLAYER_W / 2),
    x1 = tileOf(Math.max(e.takeoffX, e.landX) + PLAYER_W / 2);
  const top = Math.min(feetOfRow(from.row), feetOfRow(to.row)),
    bottom = feetOfRow(to.row) + ropeLen + PLAYER_H / 2;
  for (let y = Math.floor(top / TILE); y * TILE < bottom; y++)
    for (let x = x0; x <= x1; x++) if (isHazardKind(tileAt(g, x, y))) return false;
  return true;
}
export { ROPE_LEN };
