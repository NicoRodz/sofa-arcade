// Pinatas: dropped on the body's tile (they do not block anyone), a fuse, then the blast paints the team's colour, stains rivals standing in it and sets
// off the pinatas it reaches (chain). Your own team's blast never stains you.
import { NONE } from '../grid/dir';
import { paintTile } from './board';
import { blastTiles } from './blast';
import { CHAIN_TICKS, FUSE_TICKS, MAX_ACTIVE, STUN_TICKS } from './config';
import type { ManchazoState, Pinata } from './state';
import { bodyTile } from './tile';

/** The body index drops a pinata on its tile. False when it cannot: one is already there, or it has MAX_ACTIVE out and its team's reserve is empty. */
export function dropPinata(s: ManchazoState, i: number): boolean {
  const b = s.grid.bodies[i]!;
  const m = s.match;
  const [x, y] = bodyTile(b, m.bodies[i]!.face);
  if (m.pinatas.some((p) => p.x === x && p.y === y)) return false;
  const active = m.pinatas.filter((p) => p.owner === i).length;
  if (active >= MAX_ACTIVE) {
    if (m.reserve[b.team]! <= 0) return false;
    m.reserve[b.team]!--;
  }
  m.pinatas.push({ id: m.nextId++, x, y, team: b.team, owner: i, fuse: FUSE_TICKS, radius: m.radius[b.team]! });
  return true;
}

function detonate(s: ManchazoState, p: Pinata): void {
  const m = s.match;
  const tiles = blastTiles(p.x, p.y, p.radius, s.grid.map);
  for (const [x, y] of tiles) paintTile(m, x, y, p.team, s.grid.tick);
  const hit = new Set(tiles.map(([x, y]) => `${x},${y}`));
  s.grid.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    if (b.team === p.team || bm.stun > 0 || !hit.has(bodyTile(b, bm.face).join(','))) return;
    bm.stun = STUN_TICKS;
    bm.trail = 0;
    bm.trailTeam = p.team;
    b.dir = NONE;
    b.q = NONE; // so a stick still held when the stun ends reads as a new request
    b.req = null;
    b.moved = false;
  });
  for (const o of m.pinatas) if (o !== p && o.fuse > CHAIN_TICKS && hit.has(`${o.x},${o.y}`)) o.fuse = CHAIN_TICKS;
}

/** Burns every fuse one tick and goes off the ones that ran out, in placement order. */
export function stepPinatas(s: ManchazoState): void {
  const m = s.match;
  for (const p of m.pinatas) p.fuse--;
  const due = m.pinatas.filter((p) => p.fuse <= 0);
  for (const p of due) detonate(s, p);
  if (due.length) m.pinatas = m.pinatas.filter((p) => p.fuse > 0);
}
