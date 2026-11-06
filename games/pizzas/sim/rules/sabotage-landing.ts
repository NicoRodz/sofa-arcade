// Versus sabotage: the tiles of a kitchen in the canonical frame, the reticle sweep and where a bag may land (split from sabotage.ts, moved verbatim).
// Pure and deterministic; sabotage.ts re-exports the public functions.
import { DIRS, MAP_H, MAP_W, isFloor, type Pos } from '../maps';
import { SIGMAS } from '../symmetry';
import type { Game } from '../round/state';
import { ADJUST_MAX, RETICLE_STEP_MS, type Flight } from '../sabotage-config';

export const key = (x: number, y: number) => `${x},${y}`;

/** Floor tiles of a team's kitchen, in reading order. */
export function kitchenTiles(g: Game, team: number): Pos[] {
  const k = g.kitchens!;
  const out: Pos[] = [];
  g.grid.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (isFloor(g.grid, x, y) && k.comp[y]![x] === k.regions[team]) out.push([x, y]);
    }),
  );
  return out;
}
/** Team 1's kitchen is the canonical frame: a tile of kitchen 0 goes through sigma, one of kitchen 1 stays. (sigma is its own inverse: the same call maps back.) */
export const frame = (g: Game, target: number, [x, y]: Pos): Pos => (target === 0 ? SIGMAS[g.sab!.sigma](x, y, MAP_W, MAP_H) : [x, y]);

/** The sweep: every floor tile of the target kitchen in serpentine order (rows top to bottom in the canonical frame, alternating direction), real coordinates. */
export function sweepOrder(g: Game, target: number): Pos[] {
  const canon = kitchenTiles(g, target).map((p) => ({ p, c: frame(g, target, p) }));
  const rows = [...new Set(canon.map((t) => t.c[1]))].sort((a, b) => a - b);
  const out: Pos[] = [];
  rows.forEach((y, i) => {
    const row = canon.filter((t) => t.c[1] === y).sort((a, b) => (i % 2 ? b.c[0] - a.c[0] : a.c[0] - b.c[0]));
    for (const t of row) out.push(t.p);
  });
  return out;
}
/** Where the reticle is `elapsedMs` after the bag was loaded: one tile per RETICLE_STEP_MS, back and forth along the sweep. */
export function reticleAt(g: Game, target: number, elapsedMs: number): Pos {
  const list = sweepOrder(g, target);
  const n = list.length,
    cycle = Math.max(1, 2 * n - 2);
  const k = Math.floor(Math.max(0, elapsedMs) / RETICLE_STEP_MS) % cycle;
  return list[k < n ? k : cycle - k]!;
}

// --- Can a bag land here? --------------------------------------------------------------------------------------------------------------------
export const targetOf = (g: Game, team: number) => (team + 1) % g.teams.length;
export const pendingAt = (g: Game, target: number) =>
  g.sab!.teams.reduce((n, t) => n + t.flights.filter((f) => f.target === target).length, 0);
export const isValidLanding = (g: Game, target: number, [x, y]: Pos, ignore?: Flight): boolean => {
  const t = g.grid[y]?.[x];
  if (t?.kind !== 'floor' || t.spawn || g.kitchens!.comp[y]![x] !== g.kitchens!.regions[target]) return false;
  if (g.floor.some((f) => f.kind === 'trash' && f.tx === x && f.ty === y)) return false;
  return !g.sab!.teams.some((s) => s.flights.some((f) => f !== ignore && f.target === target && f.to[0] === x && f.to[1] === y));
};
/** The valid tile closest to `want` within ADJUST_MAX steps over the kitchen floor (ties by the canonical frame's reading order), or null: the bag bursts. */
export function adjustLanding(g: Game, target: number, want: Pos, ignore?: Flight): Pos | null {
  if (isValidLanding(g, target, want, ignore)) return want;
  const seen = new Set([key(want[0], want[1])]);
  let ring: Pos[] = [want];
  for (let d = 1; d <= ADJUST_MAX; d++) {
    const next: Pos[] = [];
    for (const [x, y] of ring)
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy;
        if (seen.has(key(nx, ny)) || !isFloor(g.grid, nx, ny) || g.kitchens!.comp[ny]![nx] !== g.kitchens!.regions[target]) continue;
        seen.add(key(nx, ny));
        next.push([nx, ny]);
      }
    const ok = next
      .filter((p) => isValidLanding(g, target, p, ignore))
      .map((p) => ({ p, c: frame(g, target, p) }))
      .sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
    if (ok.length) return ok[0]!.p;
    ring = next;
  }
  return null;
}
/** Valid landing tiles of a kitchen right now (the validator wants six at least on an empty map). */
export const landingTiles = (g: Game, target: number): Pos[] => kitchenTiles(g, target).filter((p) => isValidLanding(g, target, p));
