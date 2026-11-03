// The projectiles' slot in the tick (after the stains count down, before the pinatas go off), in two passes over the snapshot of the tick:
//  1. every shot moves (3 units a tick), stopping at furniture or a shut living tile; the aims that run out launch a shot (it starts moving next tick);
//  2. rival shots that touch cancel each other; each survivor picks the first rival body it is inside of (lowest index); a body takes ONE shot a tick (the lowest shooter,
//     then the lowest id: the rest fly on) and two Cambiazos never share a body (the later one is lost); then everything is applied, in shot order.
// Nothing here draws from an RNG and nothing reads who is "first" by team: ties go by body index, which a mirrored round keeps.
import { solidAt } from '../../map';
import { DX, DY } from '../grid/dir';
import { TILE } from '../grid/config';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { SHOT_RANGE_UNITS, SHOT_UNITS_PER_TICK } from './config';
import { apply, bodyAt, clash, land } from './hit';
import type { Shot } from './state';

type Fate = 'fly' | 'miss' | 'clash' | 'hit' | 'lost';
interface Outcome {
  shot: Shot;
  fate: Fate;
  target: number;
}

/** Moves a shot one tick. 'miss' when furniture or a shut living tile stops it (a shut tile under it: it lands one tile back); the end of its range is checked after the hits. */
function move(s: ManchazoState, p: Shot): 'fly' | 'miss' {
  if (solidAt(s.grid.map, p.tx, p.ty)) {
    [p.tx, p.ty] = [p.lx, p.ly];
    return 'miss';
  }
  const d = Math.min(SHOT_UNITS_PER_TICK, p.left);
  const [nx, ny] = [p.x + DX[p.dir as 0 | 1 | 2 | 3] * d, p.y + DY[p.dir as 0 | 1 | 2 | 3] * d];
  const [tx, ty] = bodyTile({ x: nx, y: ny }, p.dir); // on an edge: the tile it heads into, the same rule on both sides of the map
  if (solidAt(s.grid.map, tx, ty)) return 'miss';
  [p.x, p.y, p.left] = [nx, ny, p.left - d];
  if (tx !== p.tx || ty !== p.ty) [p.lx, p.ly, p.tx, p.ty] = [p.tx, p.ty, tx, ty];
  return 'fly';
}

function launch(s: ManchazoState, i: number): void {
  const a = s.match.sab!;
  const sh = a.shot!;
  const kind = a.held[i];
  if (!kind) return;
  const b = s.grid.bodies[i]!;
  const dir = s.match.bodies[i]!.face;
  const [tx, ty] = bodyTile(b, dir);
  a.held[i] = null; // the card leaves with the shot
  a.used++;
  sh.shots.push({
    id: sh.nextId++,
    kind,
    owner: i,
    team: b.team,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    dir,
    left: SHOT_RANGE_UNITS,
    tx,
    ty,
    lx: tx,
    ly: ty,
  });
  sh.log.push({ kind: 'launch', tick: s.grid.tick, body: i, target: -1, x: tx, y: ty, card: kind });
}

export function stepShots(s: ManchazoState): void {
  const sh = s.match.sab?.shot;
  if (!sh) return;
  const m = s.match;
  for (const p of m.pinatas) if (p.lock) p.lock--;
  const t = s.grid.tick;
  // pass 1: flight
  const out: Outcome[] = sh.shots.map((shot) => ({ shot, fate: move(s, shot), target: -1 }));
  // pass 2: clashes, then hits
  for (const a of out) if (a.fate === 'fly' && out.some((b) => b !== a && b.fate !== 'miss' && clash(a.shot, b.shot))) a.fate = 'clash';
  const taken = new Set<number>();
  const swapping = new Set<number>();
  for (const o of [...out].sort((a, b) => a.shot.owner - b.shot.owner || a.shot.id - b.shot.id)) {
    if (o.fate !== 'fly') continue;
    const j = bodyAt(s, o.shot);
    if (j < 0 || taken.has(j)) {
      if (o.shot.left <= 0) o.fate = 'miss'; // the end of its range, nobody there
      continue;
    }
    if (o.shot.kind === 'swap') {
      const busy = swapping.has(o.shot.owner) || swapping.has(j) || m.bodies[o.shot.owner]!.stun > 0; // a stained shooter cannot trade places
      if (busy) {
        o.fate = 'lost'; // consumed with no effect
        continue;
      }
      swapping.add(o.shot.owner).add(j);
    }
    [o.fate, o.target] = ['hit', j];
    taken.add(j);
  }
  const kept: Shot[] = [];
  for (const o of out) {
    const p = o.shot;
    const at = [p.tx, p.ty] as const;
    if (o.fate === 'fly') kept.push(p);
    else if (o.fate === 'hit') {
      apply(s, p, o.target);
      sh.log.push({ kind: 'hit', tick: t, body: p.owner, target: o.target, x: at[0], y: at[1], card: p.kind });
    } else {
      if (o.fate === 'miss' && p.kind === 'glue') land(s, p, at[0], at[1]);
      sh.log.push({ kind: o.fate === 'lost' ? 'cancel' : o.fate, tick: t, body: p.owner, target: -1, x: at[0], y: at[1], card: p.kind });
    }
  }
  sh.shots = kept;
  s.grid.bodies.forEach((_b, i) => {
    if (sh.prep[i]! > 0 && --sh.prep[i]! === 0) launch(s, i);
  });
}
