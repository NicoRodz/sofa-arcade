// The living map's slot in the tick (after movement, before the pinatas): brush pivots are claimed, each pair changes on its schedule (a warning 1 s before),
// the fountain splashes. Nothing here draws from an RNG.
import { closedTiles, closing, statesOf, swept, type LivingSpec } from '../../map';
import { clearTile, paintTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { FOUNTAIN_RADIUS } from './config';
import { planPush } from './push';
import type { LivePair } from './state';

/** Each body standing on a brush's pivot makes that member paint in its team's colour (the last in body order when both teams stand on one). */
function claimPivots(s: ManchazoState): void {
  for (const p of s.match.live!.pairs) {
    if (p.spec.kind !== 'brush') continue;
    const pivots = [
      [p.spec.x, p.spec.y],
      [s.grid.map.w - 1 - p.spec.x, p.spec.y],
    ] as const;
    s.grid.bodies.forEach((b, i) => {
      const bm = s.match.bodies[i]!;
      if (bm.stun > 0) return;
      const [x, y] = bodyTile(b, bm.face);
      pivots.forEach(([px, py], side) => {
        if (x === px && y === py) p.owner[side] = b.team;
      });
    });
  }
}

/** The bar paints what it swept (the tiles it left and the corner) in the colour of the last team on that member's pivot; neutral paints nothing. */
function sweep(s: ManchazoState, spec: LivingSpec, p: LivePair): void {
  const map = s.grid.map;
  swept(spec, p.state).forEach((tiles, side) => {
    const team = p.owner[side]!;
    if (team < 0) return;
    for (const [x, y] of tiles)
      if (x >= 0 && y >= 0 && x < map.w && y < map.h && map.solid[y * map.w + x] === 0) paintTile(s.match, x, y, team, s.grid.tick);
  });
}

/** The change of a pair if nothing is in the way; false when it has to wait. */
function advance(s: ManchazoState, p: LivePair): boolean {
  const base = s.match.live!.base;
  const map = s.grid.map;
  const next = (p.state + 1) % statesOf(p.spec.kind);
  const solid = map.solid.slice();
  for (const [x, y] of closedTiles(p.spec, p.state)) solid[y * map.w + x] = base[y * map.w + x]!;
  for (const [x, y] of closedTiles(p.spec, next)) solid[y * map.w + x] = 1;
  const moves = planPush(s, solid, closing(p.spec, p.state));
  if (!moves) return false;
  for (const [i, [x, y]] of moves) [s.grid.bodies[i]!.x, s.grid.bodies[i]!.y] = [x, y];
  map.solid.set(solid);
  if (p.spec.kind === 'brush') sweep(s, p.spec, p);
  p.state = next;
  p.movedAt = s.grid.tick;
  return true;
}

/** The fountain: the team with more bodies within 2 tiles paints the 12 tiles around it; a tie washes them clean; nobody near, nothing. */
function splash(s: ManchazoState): void {
  const f = s.match.live!.fountain!;
  const here = [0, 0];
  s.grid.bodies.forEach((b, i) => {
    const [x, y] = bodyTile(b, s.match.bodies[i]!.face);
    if (Math.abs(x - f.x) + Math.abs(y - f.y) <= FOUNTAIN_RADIUS) here[b.team]!++;
  });
  if (here[0]! + here[1]! === 0) return;
  const team = here[0] === here[1] ? -1 : here[0]! > here[1]! ? 0 : 1;
  const map = s.grid.map;
  for (let y = f.y - FOUNTAIN_RADIUS; y <= f.y + FOUNTAIN_RADIUS; y++)
    for (let x = f.x - FOUNTAIN_RADIUS; x <= f.x + FOUNTAIN_RADIUS; x++) {
      if ((x === f.x && y === f.y) || Math.abs(x - f.x) + Math.abs(y - f.y) > FOUNTAIN_RADIUS) continue;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h || map.solid[y * map.w + x] === 1) continue;
      if (team < 0) clearTile(s.match, x, y, -2);
      else paintTile(s.match, x, y, team, s.grid.tick);
    }
  f.last = { tick: s.grid.tick, team };
}

export function stepLiving(s: ManchazoState): void {
  const live = s.match.live;
  if (!live) return;
  const t = s.grid.tick;
  claimPivots(s);
  for (const p of live.pairs) {
    if (t > 0 && (t + p.offset) % p.period === 0) p.pending = true;
    if (!p.pending) continue;
    if (advance(s, p)) p.pending = false;
    else p.waited++;
  }
  const f = live.fountain;
  if (f && t > 0 && (t + f.offset) % f.period === 0) splash(s);
}
