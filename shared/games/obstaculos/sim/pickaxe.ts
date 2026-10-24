// Pickaxe (campaign dynamic 9, plan §4 "Piolet (rol)"): an item ('p' in the level) that one player carries. With it, holding UP beside an ice wall ('I') sticks the
// player to it and climbs at `pickTilesPerSec`; the climber is an anchor for the rope (infinite mass), so a tied partner is dragged up along the wall (as far as the rope
// reaches). B passes the pickaxe to a teammate within reach: the grab range, or the LENGTH OF THE ROPE when tied, so the climber on top of a wall hands it down to the partner
// dangling below, who climbs the same wall (it takes priority over lift / plant / throw while the hands are empty; a ring still wins). A jumps off the wall; pushing the stick
// away lets go. At the top of the wall (no ice beside the upper half of the body) the climber mantles over with a hop and a push into the wall (same as the edge assist).
// Dying, a bubble or leaving sends the pickaxe back where it was found. Inert outside a campaign world.
import { DT, JUMP_V0, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { T } from '../legend';
import { rectGap, bodyRect, pushBody } from './collide';
import type { PlayerStep } from './input';
import { emit, isActive, type PlayerState, type World } from './state';
import { ownsLantern, passLantern } from './lantern';
import { boxTouches } from './tiles';
import { GRAB_RANGE, PICK_ASSIST_STEPS, PICK_HOP, PICK_STRIP, PICK_TAKE_REACH } from './tuning';

const NONE = 255;
export const ownsPickaxe = (w: World, slot: number): boolean => w.ent.pickaxes.some((k) => k.heldBy === slot);

// (The lantern of dynamic 10 travels with the same B: passTarget / passPickaxe hand over whatever item the hands hold, pickaxe and lantern.)
// How far B can hand the pickaxe: the length of the rope when the two are tied (it travels along the rope: the climber at the top of a wall passes it down to the partner
// dangling below), the grab range otherwise.
const reachTo = (w: World, p: PlayerState, q: PlayerState): number => {
  for (const r of w.ropes) for (const l of r.links) if (l.active && ((l.a === p.slot && l.b === q.slot) || (l.a === q.slot && l.b === p.slot))) return Math.max(GRAB_RANGE, l.base);
  return GRAB_RANGE;
};

// The teammate B would hand the pickaxe to (the nearest within reach), or null.
export function passTarget(w: World, p: PlayerState): PlayerState | null {
  if (!w.camp || !(ownsPickaxe(w, p.slot) || ownsLantern(w, p.slot))) return null;
  const br = bodyRect(p.body);
  let best: PlayerState | null = null, bd = Infinity;
  for (const q of w.players) {
    if (q.slot === p.slot || !isActive(q) || q.carriedBy >= 0 || q.lift) continue;
    const d = rectGap(br, bodyRect(q.body));
    if (d <= reachTo(w, p, q) && d < bd) { best = q; bd = d; }
  }
  return best;
}
export function passPickaxe(w: World, from: PlayerState, to: PlayerState): void {
  passLantern(w, from, to);
  const k = w.ent.pickaxes.find((x) => x.heldBy === from.slot);
  if (!k) return;
  k.heldBy = to.slot;
  from.camp.pick = 0; // the one who passed it lets go of the wall
  emit(w, 'obst.pickaxe', { player: from.slot, action: 'pass' });
}

// Take (a free one touched), follow the holder, go home when the holder is out of play.
export function stepPickaxes(w: World): void {
  for (const k of w.ent.pickaxes) {
    if (k.heldBy < 0) {
      const p = w.players.find((q) => isActive(q) && !ownsPickaxe(w, q.slot) && Math.abs(q.body.x + PLAYER_W / 2 - k.x) < PLAYER_W / 2 + PICK_TAKE_REACH && Math.abs(q.body.y + PLAYER_H / 2 - k.y) < PLAYER_H / 2 + PICK_TAKE_REACH);
      if (p) { k.heldBy = p.slot; emit(w, 'obst.pickaxe', { player: p.slot, action: 'take' }); }
      continue;
    }
    const p = w.players.find((q) => q.slot === k.heldBy);
    if (!p || !isActive(p)) { k.heldBy = -1; k.x = k.homeX; k.y = k.homeY; if (p) p.camp.pick = 0; continue; }
    k.x = p.body.x + PLAYER_W / 2; k.y = p.body.y - 6;
  }
}

const iceBeside = (w: World, p: PlayerState, dir: -1 | 1, yOff: number, h: number): boolean =>
  boxTouches(w.grid, dir > 0 ? p.body.x + PLAYER_W : p.body.x - PICK_STRIP, p.body.y + yOff, PICK_STRIP, h, (k) => k === T.Ice);

// The climb state machine of one player for this step. Returns true when it consumed the step (the caller skips the normal physics).
export function stepPick(w: World, p: PlayerState, inp: PlayerStep): boolean {
  const c = w.camp!;
  const b = p.body, k = p.camp;
  const has = ownsPickaxe(w, p.slot);
  if (k.pick === 0) {
    if (!has || !inp.up || p.thrown > 0 || p.holding || p.climbing || k.assist > 0) return false; // (assist > 0: still mantling over the top of the wall it just climbed)
    for (const dir of [b.facing, (b.facing === 1 ? -1 : 1) as -1 | 1]) {
      if (!iceBeside(w, p, dir, 4, PLAYER_H - 8)) continue;
      k.pick = dir; p.planted = false; b.vx = 0; b.vy = 0;
      emit(w, 'obst.pickaxe', { player: p.slot, action: 'climb' });
      return true;
    }
    return false;
  }
  const dir = k.pick;
  if (!has || p.holding || p.carriedBy >= 0 || p.lift || !iceBeside(w, p, dir, 4, PLAYER_H - 8)) { k.pick = 0; return false; }
  if (inp.up && !iceBeside(w, p, dir, 0, PLAYER_H * 0.5)) { // top of the wall: mantle over it
    k.pick = 0; b.vy = -JUMP_V0 * PICK_HOP; b.grounded = false; b.supportId = -1; b.air = NONE;
    k.assist = PICK_ASSIST_STEPS; k.assistDir = dir;
    emit(w, 'obst.pickaxe', { player: p.slot, action: 'top' });
    return false;
  }
  if (inp.move * dir < 0) { k.pick = 0; return false; } // pushing away from the wall: lets go
  const dy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * c.pickTilesPerSec * TILE * DT;
  const moved = pushBody(b, 0, dy, w.grid);
  b.vx = 0; b.vy = 0; b.grounded = false; b.supportId = -1; b.onOneWay = false; b.air = NONE; b.dx = 0; b.dy = moved.y;
  if (dy > 0 && moved.y < dy - 0.01) k.pick = 0; // reached the floor
  return true;
}
