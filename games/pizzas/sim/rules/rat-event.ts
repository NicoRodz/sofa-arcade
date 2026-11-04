// The coop rat of the rat event: it comes out of a hole (or one of the two caves of a HAZARD_V3 map), walks to the nearest counter that holds something, grabs it and runs back to its hole; a dash scares it
// (and the item goes back). Pure and deterministic: its only randomness is the hole, drawn from the event stream `m.rng`. `midround.ts` starts and steps it (and re-exports the constants).
import { DIRS, isFloor } from '../maps';
import { gentleRatStep, ratPrize } from '../feel/rat';
import { ratPull, stealOnEscape } from '../feel/rat-loot';
import { ratCaves } from '../feel/rat-caves';
import type { Game, Station } from '../round/state';
import type { Mid, Rat } from './types';

export const RAT_SPEED = 2.4; // tiles/s
export const RAT_FLEE_SPEED = 6;
export const RAT_PATIENCE_MS = 10_000; // the rat waits this long for a counter that holds something, then leaves
export const RAT_SCARE_RADIUS = 1.1; // a chef that is dashing this close to the rat scares it

const tileOf = (r: Rat): [number, number] => [Math.floor(r.x), Math.floor(r.y)];

// First step (a tile) of a shortest path over floor tiles from `from` to any tile where `goal` holds; null when already there or unreachable.
function nextTile(g: Game, from: [number, number], goal: (x: number, y: number) => boolean): [number, number] | null {
  if (goal(from[0], from[1])) return null;
  const prev = new Map<string, string>([[`${from[0]},${from[1]}`, '']]);
  const queue: [number, number][] = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of g.ratFrame?.dirs ?? DIRS) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (!isFloor(g.grid, nx, ny) || prev.has(k)) continue;
      prev.set(k, `${x},${y}`);
      if (goal(nx, ny)) {
        let cur = k;
        while (prev.get(prev.get(cur)!) !== '') cur = prev.get(cur)!;
        const [sx, sy] = cur.split(',').map(Number) as [number, number];
        return [sx, sy];
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

export function spawnRat(g: Game, m: Mid) {
  const two = ratCaves(g, m.startAt); // HAZARD_V3 map 15: in by one cave, out by the other; the main stream is not touched
  if (two) {
    const [from, hole] = two;
    m.rat = { x: from[0] + 0.5, y: from[1] + 0.5, state: 'seek', item: null, from: -1, hole: [hole[0], hole[1]], scared: false, idleMs: 0 };
    g.bus.emit('rat:appear', { at: [from[0], from[1]] });
    return;
  }
  const holes: [number, number][] = [];
  g.grid.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (isFloor(g.grid, x, y) && DIRS.some(([dx, dy]) => g.grid[y + dy]?.[x + dx]?.kind === 'wall')) holes.push([x, y]);
    }),
  );
  const pool = holes.length ? holes : [[1, 1] as [number, number]];
  const hole = pool[Math.floor(m.rng() * pool.length)]!;
  m.rat = { x: hole[0] + 0.5, y: hole[1] + 0.5, state: 'seek', item: null, from: -1, hole, scared: false, idleMs: 0 };
  g.bus.emit('rat:appear', { at: hole });
}

export function ratGone(g: Game, m: Mid) {
  const r = m.rat;
  if (!r) return;
  const took = stealOnEscape(g, m, r); // HAZARD_V3: an escaping rat takes an item with it
  m.rat = null;
  g.bus.emit('rat:gone', { stolen: r.item !== null || took });
}

function scareRat(g: Game, m: Mid, playerId: number) {
  const r = m.rat!;
  r.scared = true;
  r.state = 'flee';
  let returned = false;
  if (r.item) {
    // the thief drops its loot where it took it from, if that counter is still free
    const st: Station | undefined = g.stations[r.from];
    if (st && st.item === null && st.fire === undefined) {
      st.item = r.item;
      returned = true;
    }
    r.item = null;
  }
  const bonus = g.magnet ? ratPrize(g) : 0; // the gentle rat pays for being scared
  g.bus.emit('rat:scared', { player: playerId, returned, ...(bonus ? { bonus } : {}) });
}

export function ratStep(g: Game, m: Mid, dtMs: number) {
  const r = m.rat!;
  if (g.magnet && gentleRatStep(g, m, dtMs, { nextTile, scare: scareRat, gone: ratGone, floor: (gg, x, y) => isFloor(gg.grid, x, y) }))
    return; // magnetism: the gentle rat (feel/rat.ts); once scared the old flee below takes over
  if (!r.scared)
    for (const p of g.players.values()) {
      if (p.ghost || p.dashMs <= 0 || Math.hypot(p.x - r.x, p.y - r.y) > RAT_SCARE_RADIUS) continue;
      scareRat(g, m, p.id);
      break;
    }
  let goal: (x: number, y: number) => boolean;
  if (r.state === 'seek') {
    // the nearest counter that holds something (ties by station index)
    let best = -1,
      bestD = Infinity;
    g.stations.forEach((s, i) => {
      if (s.kind !== 'counter' || !s.item || s.fire !== undefined) return;
      const d = Math.hypot(s.tx + 0.5 - r.x, s.ty + 0.5 - r.y) - ratPull(g, s.item);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) {
      // nothing to steal: wait for a while and then leave
      r.idleMs += dtMs;
      if (r.idleMs >= RAT_PATIENCE_MS) r.state = 'flee';
      return;
    }
    r.idleMs = 0;
    const s = g.stations[best]!;
    const [tx, ty] = tileOf(r);
    if (Math.abs(tx - s.tx) + Math.abs(ty - s.ty) === 1) {
      // next to it: grab
      r.item = s.item;
      r.from = best;
      s.item = null;
      r.state = 'flee';
      g.bus.emit('rat:steal', { station: best, item: r.item! });
      return;
    }
    goal = (x, y) => Math.abs(x - s.tx) + Math.abs(y - s.ty) === 1;
  } else {
    if (tileOf(r)[0] === r.hole[0] && tileOf(r)[1] === r.hole[1]) {
      ratGone(g, m);
      return;
    }
    goal = (x, y) => x === r.hole[0] && y === r.hole[1];
  }
  const step = nextTile(g, tileOf(r), goal);
  if (!step) return;
  const dx = step[0] + 0.5 - r.x,
    dy = step[1] + 0.5 - r.y,
    d = Math.hypot(dx, dy) || 1;
  const move = Math.min(d, ((r.scared ? RAT_FLEE_SPEED : RAT_SPEED) * dtMs) / 1000);
  r.x += (dx / d) * move;
  r.y += (dy / d) * move;
}

export const COOP_RAT = { step: ratStep, gone: ratGone }; // what the versus rats (feel/rat-versus.ts) run on a view of the round
