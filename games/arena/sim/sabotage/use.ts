// Playing a card (button 2). The card in hand is spent at once; 'turpentine' and 'glue' leave their mark on the NEXT pinata (`armed`), the rest act now.
import { solidAt } from '../../map';
import { DOWN, LEFT, RIGHT, UP, type Dir } from '../grid/dir';
import { bodyTile } from '../match/tile';
import type { ManchazoState } from '../match/state';
import { FAN_FX_TICKS, FAN_PUSH, FAN_RANGE, FOOTPRINT_TICKS, GLUE_RANGE, ROLLER_TICKS } from './kinds';

const dist = (a: readonly number[], b: readonly number[]) => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!);

/** The nearest rival body within GLUE_RANGE tiles (ties: the lowest index), or -1. */
export function glueTarget(s: ManchazoState, i: number): number {
  const me = s.grid.bodies[i]!;
  const here = bodyTile(me, s.match.bodies[i]!.face);
  let best = -1;
  let bestD = GLUE_RANGE + 1;
  s.grid.bodies.forEach((b, j) => {
    if (b.team === me.team) return;
    const d = dist(here, bodyTile(b, s.match.bodies[j]!.face));
    if (d < bestD) {
      best = j;
      bestD = d;
    }
  });
  return best;
}

/** Pushes the pinatas within FAN_RANGE of body i FAN_PUSH tiles away from it (along the longer axis; a tie goes vertical, so a left-right mirror agrees). They stop at furniture or at another pinata. */
function blow(s: ManchazoState, i: number): void {
  const m = s.match;
  const [bx, by] = bodyTile(s.grid.bodies[i]!, m.bodies[i]!.face);
  for (const p of m.pinatas) {
    if (p.stuck !== undefined || dist([p.x, p.y], [bx, by]) > FAN_RANGE) continue;
    const dx = p.x - bx,
      dy = p.y - by;
    const face: Dir = m.bodies[i]!.face;
    const d: Dir = dx === 0 && dy === 0 ? face : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP;
    const [sx, sy] = d === RIGHT ? [1, 0] : d === LEFT ? [-1, 0] : d === DOWN ? [0, 1] : [0, -1];
    for (let k = 0; k < FAN_PUSH; k++) {
      const nx = p.x + sx!,
        ny = p.y + sy!;
      if (solidAt(s.grid.map, nx, ny) || m.pinatas.some((o) => o !== p && o.x === nx && o.y === ny)) break;
      p.x = nx;
      p.y = ny;
    }
  }
}

/** Body i plays its card. False when it holds none, already has one armed, or is stained. */
export function useSabotage(s: ManchazoState, i: number): boolean {
  const a = s.match.sab;
  const kind = a?.held[i];
  if (!a || !kind || a.armed[i] || s.match.bodies[i]!.stun > 0) return false;
  const team = s.grid.bodies[i]!.team;
  if (kind === 'turpentine' || kind === 'glue') a.armed[i] = kind;
  else if (kind === 'roller') a.roller[i] = ROLLER_TICKS;
  else if (kind === 'footprints')
    a.footprints[1 - team] = FOOTPRINT_TICKS; // the rivals' footprints are painted in `team`'s colour
  else {
    blow(s, i);
    a.gust[i] = FAN_FX_TICKS;
  }
  a.held[i] = null;
  a.used++;
  return true;
}
