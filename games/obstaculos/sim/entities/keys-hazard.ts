// Keys and doors, and the rising hazards (avalanche, tide, fire): speeds are tiles/s, scaled by difficulty in createEntities.
import { DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { T } from '../../legend';
import { emit, isActive, type PlayerState, type World } from '../state';
import { FREEZE_SEC, KEY_REACH, TIDE_PERIOD_SEC } from '../tuning';
import { setTile, tileOf } from '../tiles';
import { idx } from './create';

// --- keys and doors
function floodDoor(w: World, start: number, out: Set<number>): void {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (out.has(i) || !w.ent.doorCells.has(i) || w.grid.cells[i] !== T.Door) continue;
    out.add(i);
    const x = i % w.grid.w,
      y = Math.floor(i / w.grid.w);
    if (x > 0) stack.push(i - 1);
    if (x < w.grid.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w.grid.w);
    if (y < w.grid.h - 1) stack.push(i + w.grid.w);
  }
}
export function stepKeys(w: World): void {
  for (const k of w.ent.keys) {
    if (k.used) continue;
    if (k.heldBy < 0) {
      const p = w.players.find(
        (q) =>
          isActive(q) &&
          Math.abs(q.body.x + PLAYER_W / 2 - k.x) < PLAYER_W / 2 + 6 &&
          Math.abs(q.body.y + PLAYER_H / 2 - k.y) < PLAYER_H / 2 + 6,
      );
      if (p) k.heldBy = p.slot;
      continue;
    }
    const p = w.players.find((q) => q.slot === k.heldBy);
    if (!p || !isActive(p)) {
      k.heldBy = -1;
      k.x = k.homeX;
      k.y = k.homeY;
      continue;
    }
    k.x = p.body.x + PLAYER_W / 2;
    k.y = p.body.y - 6;
    const reach = { x: p.body.x - KEY_REACH, y: p.body.y - KEY_REACH, w: PLAYER_W + 2 * KEY_REACH, h: PLAYER_H + 2 * KEY_REACH };
    const open = new Set<number>();
    for (let ty = tileOf(reach.y); ty <= tileOf(reach.y + reach.h); ty++)
      for (let tx = tileOf(reach.x); tx <= tileOf(reach.x + reach.w); tx++) {
        if (tx >= 0 && ty >= 0 && tx < w.grid.w && ty < w.grid.h) floodDoor(w, idx(tx, ty, w.grid.w), open);
      }
    if (open.size) {
      for (const i of [...open].sort((a, b) => a - b)) setTile(w.grid, i % w.grid.w, Math.floor(i / w.grid.w), T.Empty);
      w.tilesVersion++;
      k.used = true;
      k.heldBy = -1;
      const first = Math.min(...open);
      emit(w, 'obst.gate', { id: `door:${first % w.grid.w},${Math.floor(first / w.grid.w)}`, open: true });
    }
  }
}

// --- hazards (plan §9 hazard): speeds are tiles/s, scaled by difficulty in createEntities
export function stepHazard(w: World): void {
  const h = w.ent.hazard;
  if (!h) return;
  if (h.frozen > 0) {
    h.frozen--;
    return;
  }
  h.phase += DT;
  if (h.kind === 'risingLava') h.pos -= h.speed * TILE * DT;
  else if (h.kind === 'avalanche') h.pos += h.speed * TILE * DT;
  else {
    const u = (h.phase % TIDE_PERIOD_SEC) / TIDE_PERIOD_SEC;
    const tri = u < 0.5 ? 2 * u : 2 * (1 - u);
    h.pos = w.level.h * TILE - h.speed * (TIDE_PERIOD_SEC / 2) * TILE * tri;
  }
}
export const freezeHazard = (w: World): void => {
  if (w.ent.hazard?.kind === 'risingLava') w.ent.hazard.frozen = Math.round(FREEZE_SEC / DT);
};
export function hazardKills(w: World, p: PlayerState): 'hazard' | 'liquid' | null {
  const h = w.ent.hazard;
  if (!h) return null;
  const b = p.body;
  if (h.kind === 'avalanche') return b.x + PLAYER_W / 2 < h.pos ? 'hazard' : null;
  return b.y + PLAYER_H > h.pos + 4 ? (h.kind === 'tide' ? 'liquid' : 'hazard') : null;
}
