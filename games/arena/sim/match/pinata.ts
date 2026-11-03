// Pinatas: dropped on the body's tile (they do not block anyone), a fuse, then the blast paints the team's colour, stains rivals standing in it and sets
// off the pinatas it reaches (chain). Your own team's blast never stains you.
import { NONE } from '../grid/dir';
import { radiusOf } from '../events/comeback';
import { happyBonus, happyOn } from '../events/happy';
import { capRadius } from '../phase/radius';
import { deflectVacuum } from '../events/vacuum';
import { glueTarget } from '../sabotage/use';
import { clearTile, paintTile } from './board';
import { blastTiles } from './blast';
import { CHAIN_TICKS, FUSE_TICKS, MAX_ACTIVE, STUN_TICKS } from './config';
import type { ManchazoState, Pinata } from './state';
import { bodyTile } from './tile';

/** The body index drops a pinata on its tile. False when it cannot: one is already there, or it has MAX_ACTIVE out and its team's reserve is empty. */
export function dropPinata(s: ManchazoState, i: number): boolean {
  const b = s.grid.bodies[i]!;
  const m = s.match;
  let [x, y] = bodyTile(b, m.bodies[i]!.face);
  const armed = m.sab?.armed[i] ?? null;
  const target = armed === 'glue' ? glueTarget(s, i) : -1; // glue with no rival in range: a plain pinata, the glue stays armed
  if (target >= 0) [x, y] = bodyTile(s.grid.bodies[target]!, m.bodies[target]!.face);
  else if (m.pinatas.some((p) => p.x === x && p.y === y)) return false;
  const active = m.pinatas.filter((p) => p.owner === i).length;
  if (active >= MAX_ACTIVE && !happyOn(m)) {
    if (m.reserve[b.team]! <= 0) return false;
    m.reserve[b.team]!--;
  }
  const mod = armed === 'turpentine' || target >= 0 ? armed : null;
  m.pinatas.push({
    id: m.nextId++,
    x,
    y,
    team: b.team,
    owner: i,
    fuse: FUSE_TICKS,
    radius: radiusOf(m, b.team),
    ...(mod ? { mod } : {}),
    ...(target >= 0 ? { stuck: target } : {}),
  });
  if (mod) m.sab!.armed[i] = null;
  return true;
}

function detonate(s: ManchazoState, p: Pinata): void {
  const m = s.match;
  const tiles = blastTiles(p.x, p.y, capRadius(m, p.radius + happyBonus(m)), s.grid.map); // F8b: Hora feliz reaches one tile further (PR2: never past the cap)
  for (const [x, y] of tiles) (p.mod === 'turpentine' ? clearTile : paintTile)(m, x, y, p.team, s.grid.tick);
  const hit = new Set(tiles.map(([x, y]) => `${x},${y}`));
  deflectVacuum(s, p.x, p.y, hit); // F4: a blast steers the vacuum robot (no-op without the events)
  s.grid.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    if (b.team === p.team || bm.stun > 0 || (m.sab?.plus?.immune[i] ?? 0) > 0 || !hit.has(bodyTile(b, bm.face).join(','))) return;
    bm.stun = STUN_TICKS;
    if (m.sab) m.sab.roller[i] = 0; // a stain cuts a roller
    if (m.sab?.plus) m.sab.plus.charge[i] = 0; // and a Mareo still charging
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
  for (const p of m.pinatas) {
    p.fuse--;
    if (p.stuck !== undefined) [p.x, p.y] = bodyTile(s.grid.bodies[p.stuck]!, m.bodies[p.stuck]!.face); // glue rides its rival
  }
  const due = m.pinatas.filter((p) => p.fuse <= 0);
  for (const p of due) detonate(s, p);
  if (due.length) m.pinatas = m.pinatas.filter((p) => p.fuse > 0);
}
