// Scripted chefs whose job is a HAZARD_V3 mechanic, played with the real sticks (no state edits): the mender holds B in front of a broken bridge (2 s alone), the ferrier waits its turn at the shore
// of the raft (it holds two chefs) and rides it across. They plug into `seriesRound({ drive })` or into a bare `tick` loop. Pure given the game: no clock, no stream.
import type { Controls, Game } from '@pichi/game-pizzas/sim/overcooked';
import { isBroken } from '@pichi/game-pizzas/sim/mech/bridge/module';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Can a chef walk this tile (a floor that is not the raft nor a broken bridge)? */
function walkable(g: Game, x: number, y: number): boolean {
  const t = g.grid[y]?.[x];
  if (t?.kind !== 'floor' || t.mech === '=') return false;
  return t.mech !== 'b' || !isBroken(g, x, y);
}

/** Breadth-first walk from (sx, sy) to the nearest tile that has a broken bridge beside it: the first step to take and the bridge to face. */
function toBrokenBridge(g: Game, sx: number, sy: number): { step: readonly [number, number]; face: readonly [number, number] } | null {
  const seen = new Set([sy * 16 + sx]);
  let front: { x: number; y: number; first: readonly [number, number] | null }[] = [{ x: sx, y: sy, first: null }];
  while (front.length) {
    const next: typeof front = [];
    for (const c of front) {
      for (const d of STEPS) {
        const nx = c.x + d[0],
          ny = c.y + d[1];
        if (g.grid[ny]?.[nx]?.mech === 'b' && isBroken(g, nx, ny)) return { step: c.first ?? d, face: d };
      }
      for (const d of STEPS) {
        const nx = c.x + d[0],
          ny = c.y + d[1];
        if (seen.has(ny * 16 + nx) || !walkable(g, nx, ny)) continue;
        seen.add(ny * 16 + nx);
        next.push({ x: nx, y: ny, first: c.first ?? d });
      }
    }
    front = next;
  }
  return null;
}

interface Walk {
  px: number;
  py: number;
  still: number; // ticks without moving while it wanted to
  aside: number; // ticks left of stepping to the side (two chefs head-on stop dead in the sim)
  sign: number;
}
const walks = new WeakMap<Game, Map<number, Walk>>();
function walkOf(g: Game, id: number): Walk {
  let m = walks.get(g);
  if (!m) walks.set(g, (m = new Map()));
  let w = m.get(id);
  if (!w) m.set(id, (w = { px: -9, py: -9, still: 0, aside: 0, sign: 1 }));
  return w;
}

/** The mender: walks to the nearest broken bridge and holds B facing it. Null when no bridge is broken (the crew's own decision stands). */
export function menderDrive(g: Game, id: number): Controls | null {
  const p = g.players.get(id)!;
  const r = toBrokenBridge(g, Math.floor(p.x), Math.floor(p.y));
  if (!r) return null;
  const at =
    r.step[0] === r.face[0] && r.step[1] === r.face[1] && g.grid[Math.floor(p.y) + r.face[1]]?.[Math.floor(p.x) + r.face[0]]?.mech === 'b';
  if (at) return { x: r.face[0], y: r.face[1], a: 0, b: true };
  const w = walkOf(g, id);
  w.still = Math.hypot(p.x - w.px, p.y - w.py) < 0.01 ? w.still + 1 : 0;
  [w.px, w.py] = [p.x, p.y];
  if (w.aside === 0 && w.still >= 20) {
    w.aside = 25;
    w.sign = -w.sign;
    w.still = 0;
  }
  if (w.aside > 0) {
    w.aside--;
    return { x: r.step[1] * w.sign, y: r.step[0] * w.sign, a: 0, b: false };
  }
  return { x: r.step[0], y: r.step[1], a: 0, b: false };
}

/** The raft of a row-lane map (31): where it is (tile x), or -1. */
export const raftX = (g: Game): number => {
  for (let y = 0; y < g.grid.length; y++) {
    const x = g.grid[y]!.findIndex((t) => t.kind === 'floor' && t.mech === '=');
    if (x >= 0) return x;
  }
  return -1;
};

/**
 * The ferrier of a west-to-east raft (map 31, lane y = 4, x 6..10, shores at 5 and 11): it queues along the west shore, steps on only when the raft is at the shore, rides it with the stick east and steps off at
 * the east end. When the raft already holds two chefs the game refuses the step and the chef waits for the next crossing.
 */
export function ferryDrive(g: Game, id: number): Controls {
  const p = g.players.get(id)!;
  const x = Math.floor(p.x),
    rx = raftX(g);
  const east: Controls = { x: 1, y: 0, a: 0, b: false };
  if (x >= 11) return x < 13 ? east : idle;
  if (x >= 6) return east; // on the raft it keeps the stick east: it stands at the far edge of the tile (a chef whose body hangs over the water it left cannot move) and steps off at the east shore
  const lane = Math.max(-1, Math.min(1, (4.5 - p.y) * 3)); // the queue keeps to the row of the raft (a shove would take a chef off it)
  if (x < 5) return { ...east, y: lane };
  return rx === 6 ? { ...east, y: lane } : { ...idle, y: lane }; // at the shore: only when the raft is in
}
