// Per tick, after the chefs moved: loose items ride the belts one tile at a time, and a chef stepping onto ice or a belt fires its event (sound).
import type { Game } from '../round/state';
import { isFloor } from '../maps';
import { BELT_STEP_MS, SLIDE_SPEED, type SurfaceState } from './config';
import { surfaceAt } from './physics';

function carryItems(g: Game, s: SurfaceState, dtMs: number) {
  const seen = new Set<number>();
  for (const f of g.floor) {
    if (f.kind === 'trash') continue; // rubbish stays where the bag fell
    const t = g.grid[f.ty]?.[f.tx];
    if (t?.kind !== 'floor' || t.surface?.kind !== 'belt') continue;
    seen.add(f.id);
    const ms = (s.prog.get(f.id) ?? 0) + dtMs;
    const nx = f.tx + t.surface.dx,
      ny = f.ty + t.surface.dy;
    if (!isFloor(g.grid, nx, ny)) {
      s.prog.set(f.id, 0); // the end of the belt (a wall, a station, water): it waits there, it never leaves the floor
      continue;
    }
    if (ms >= BELT_STEP_MS) {
      f.tx = nx;
      f.ty = ny;
      s.prog.set(f.id, ms - BELT_STEP_MS);
    } else s.prog.set(f.id, ms);
  }
  for (const id of [...s.prog.keys()]) if (!seen.has(id)) s.prog.delete(id);
}

export function surfacesTick(g: Game, dtMs: number) {
  const s = g.surf!;
  carryItems(g, s, dtMs);
  for (const p of g.players.values()) {
    if (p.ghost) continue;
    const now = surfaceAt(g, p.x, p.y)?.kind ?? null;
    const prev = s.last.get(p.id) ?? null;
    s.last.set(p.id, now);
    if (now === prev) continue;
    if (now === 'belt') g.bus.emit('surface:belt', { player: p.id });
    else if (now === 'ice' && Math.hypot(p.vx, p.vy) >= SLIDE_SPEED) g.bus.emit('surface:slide', { player: p.id });
  }
}
