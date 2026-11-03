// The F8b events' behaviour in the tick (called from major.ts, inside the events' slot). Apagon has none (the TV darkens; the sim is untouched) and Hora feliz is read
// by the pinatas (happy.ts). Contagio, Mudanza and Globos act here. Nothing draws from an RNG: the spots and moves were fixed when the round was created.
import { MAP_H, MAP_W, mirrorTile, solidAt, type Tile } from '../../map';
import { HALF, TILE } from '../grid/config';
import { clearTile, paintTile, tileIndex } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { BALLOON_AROUND, BALLOON_WARN_TICKS, CONTAGION_MIN, CONTAGION_WARN_TICKS, MOVE_WARN_TICKS, type ActingPlusKind } from './config';

const ORTHO: readonly Tile[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function startPlus(s: ManchazoState, kind: ActingPlusKind): void {
  const plus = s.match.ev!.plus!;
  const t = s.grid.tick;
  if (kind === 'contagion') plus.contagion = { fireAt: t + CONTAGION_WARN_TICKS, flipped: -1 };
  else if (kind === 'move') plus.move = { at: t + MOVE_WARN_TICKS, done: plus.moves.map(() => 0) };
  else if (kind === 'balloons') plus.balloon = { landAt: t + BALLOON_WARN_TICKS, owner: plus.balloons.flatMap(() => [-2, -2]) };
}

/** Contagio: the tiles that turn (and the colour they turn to) if the pass ran on the board now: painted tiles with CONTAGION_MIN or more rival tiles among their 4 neighbours. */
export function contagionTurns(s: ManchazoState): [number, number, number][] {
  const before = s.match.paint.slice(); // one pass over a copy: a tile that turns does not count for its neighbours
  const turn: [number, number, number][] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const own = before[tileIndex(x, y)]!;
      if (own < 0 || solidAt(s.grid.map, x, y)) continue;
      let rivals = 0;
      for (const [dx, dy] of ORTHO) if (before[tileIndex(x + dx, y + dy)] === 1 - own && !solidAt(s.grid.map, x + dx, y + dy)) rivals++;
      if (rivals >= CONTAGION_MIN) turn.push([x, y, 1 - own]);
    }
  return turn;
}

function contagion(s: ManchazoState): number {
  const m = s.match;
  let n = 0;
  for (const [x, y, team] of contagionTurns(s)) {
    paintTile(m, x, y, team, s.grid.tick);
    if (m.paint[tileIndex(x, y)] === team) n++; // a tape keeps its colour
  }
  return n;
}

/** Globos: each balloon (the drawn tile and its mirror image) paints its 3x3 for the team with more bodies within BALLOON_AROUND tiles; a tie (or nobody) lands neutral. */
function land(s: ManchazoState): void {
  const plus = s.match.ev!.plus!;
  const b = plus.balloon!;
  const spots = plus.balloons.flatMap((t): Tile[] => [t, mirrorTile(t)]);
  const where = s.grid.bodies.map((body, i) => bodyTile(body, s.match.bodies[i]!.face));
  spots.forEach(([bx, by], k) => {
    const here = [0, 0];
    s.grid.bodies.forEach((body, i) => {
      if (Math.max(Math.abs(where[i]![0] - bx), Math.abs(where[i]![1] - by)) <= BALLOON_AROUND) here[body.team]!++;
    });
    b.owner[k] = here[0] === here[1] ? -1 : here[0]! > here[1]! ? 0 : 1;
  });
  spots.forEach(([bx, by], k) => {
    for (let y = by - 1; y <= by + 1; y++)
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (solidAt(s.grid.map, x, y)) continue;
        if (b.owner[k]! >= 0) paintTile(s.match, x, y, b.owner[k]!, s.grid.tick);
        else clearTile(s.match, x, y, -2);
      }
  });
  plus.fx++;
}

/** Does a body (16x16 units) overlap the tile? */
const overlaps = (x: number, y: number, [tx, ty]: Tile): boolean =>
  Math.floor((x - HALF) / TILE) <= tx &&
  tx <= Math.floor((x + HALF - 1) / TILE) &&
  Math.floor((y - HALF) / TILE) <= ty &&
  ty <= Math.floor((y + HALF - 1) / TILE);

/** Mudanza: a pair jumps when none of its destination tiles holds a body or a pinata (else it tries again next tick). The old tiles open, the new ones close, and a
 * destination's paint is wiped (counts adjusted) so the floor total stays the same. Both the map and the living map's base are updated. */
function tryMove(s: ManchazoState, k: number): boolean {
  const m = s.match;
  const pair = m.ev!.plus!.moves[k]!;
  const map = s.grid.map;
  const froms: Tile[] = [pair.from, mirrorTile(pair.from)];
  const tos: Tile[] = [pair.to, mirrorTile(pair.to)];
  if (froms.some(([x, y]) => !solidAt(map, x, y)) || tos.some(([x, y]) => solidAt(map, x, y))) return false;
  if (tos.some((to) => s.grid.bodies.some((b) => overlaps(b.x, b.y, to)) || m.pinatas.some((p) => p.x === to[0] && p.y === to[1])))
    return false;
  for (const [x, y] of froms) {
    map.solid[tileIndex(x, y)] = 0;
    if (m.live) m.live.base[tileIndex(x, y)] = 0;
  }
  for (const [x, y] of tos) {
    const i = tileIndex(x, y);
    const old = m.paint[i]!;
    if (old >= 0) {
      m.counts[old]! -= m.zone && x >= m.zone.x0 && x <= m.zone.x1 && y >= m.zone.y0 && y <= m.zone.y1 ? 2 : 1;
      m.paint[i] = -1;
      if (m.sab?.plus) m.sab.plus.veiled[i] = 0;
    }
    map.solid[i] = 1;
    if (m.live) m.live.base[i] = 1;
  }
  return true;
}

export function stepPlus(s: ManchazoState, kind: ActingPlusKind): void {
  const plus = s.match.ev!.plus!;
  const t = s.grid.tick;
  if (kind === 'contagion') {
    const c = plus.contagion!;
    if (c.flipped < 0 && t >= c.fireAt) {
      c.flipped = contagion(s);
      plus.fx++;
    }
  } else if (kind === 'balloons') {
    if (plus.balloon!.owner[0] === -2 && t >= plus.balloon!.landAt) land(s);
  } else if (kind === 'move') {
    const mv = plus.move!;
    if (t < mv.at) return;
    mv.done.forEach((at, k) => {
      if (at === 0 && tryMove(s, k)) {
        mv.done[k] = t;
        plus.fx++;
      }
    });
  }
}
