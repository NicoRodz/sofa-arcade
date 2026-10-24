// What B does (plan §5) and what A does on top of it. B is contextual and a toggle:
//   hands empty: ring (anchor) > teammate (lift) > box or lever (grab) > nothing (plant)
//   something in hand: a teammate is thrown, anything else is released. Planted: B stands up.
// A always lets go and jumps. Pure: every function mutates the World it is given and pushes events.
import { JUMP_V0, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { bodyRect, distToRect, rectGap, type PxRect } from './collide';
import { isOneWayKind } from '../legend';
import { boxHitsSolid, tileAt, tileOf } from './tiles';
import { emit, isActive, type PlayerState, type World } from './state';
import { BOX_SIZE, GRAB_RANGE, HAND_LIFT_SEC, RING_HANG_DY, THROWN_MAX_STEPS, THROW_VX, THROW_VY } from './tuning';
import { DT } from '../constants';

export type BAction = 'anchor' | 'lift' | 'grab' | 'plant' | 'unplant' | 'release' | 'throw' | 'none';
export interface BPreview { action: BAction; target: { kind: 'ring' | 'player' | 'box' | 'lever'; id: number } | null }
const NONE = 255;

const grabbable = (w: World, p: PlayerState, t: PlayerState): boolean =>
  t.slot !== p.slot && isActive(t) && t.carriedBy < 0 && !t.lift && t.holding?.kind !== 'ring' && t.holding?.kind !== 'player' && !t.climbing;

// The target B would act on (priority order of plan §5), or null.
export function findTarget(w: World, p: PlayerState): BPreview['target'] {
  const br = bodyRect(p.body);
  let best = -1, bestD = Infinity;
  w.ent.rings.forEach((r, i) => {
    const d = distToRect(r.x * TILE + TILE / 2, r.y * TILE + TILE / 2, br);
    if (d <= GRAB_RANGE && d < bestD) { best = i; bestD = d; }
  });
  if (best >= 0) return { kind: 'ring', id: best };
  let t: PlayerState | null = null;
  bestD = Infinity;
  for (const q of w.players) {
    if (!grabbable(w, p, q)) continue;
    const d = rectGap(br, bodyRect(q.body));
    if (d <= GRAB_RANGE && d < bestD) { t = q; bestD = d; }
  }
  if (t) return { kind: 'player', id: t.slot };
  let box = -1;
  bestD = Infinity;
  for (const b of w.ent.boxes) {
    if (b.holders.length > 0 && !b.heavy) continue;
    const d = rectGap(br, { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE });
    if (d <= GRAB_RANGE && d < bestD) { box = b.id; bestD = d; }
  }
  let lever = -1, leverD = Infinity;
  w.ent.activators.forEach((a, i) => {
    if (a.kind !== 'lever') return;
    const d = rectGap(br, a.rect);
    if (d <= GRAB_RANGE && d < leverD) { lever = i; leverD = d; }
  });
  if (box >= 0 && (lever < 0 || bestD <= leverD)) return { kind: 'box', id: box };
  if (lever >= 0) return { kind: 'lever', id: lever };
  return null;
}

// For the HUD icon above the head: what B will do right now.
export function previewB(w: World, p: PlayerState): BPreview {
  if (p.carriedBy >= 0 || p.lift) return { action: 'none', target: null };
  if (p.planted) return { action: 'unplant', target: null };
  if (p.holding) return { action: p.holding.kind === 'player' ? 'throw' : 'release', target: p.holding };
  const t = findTarget(w, p);
  if (t) return { action: t.kind === 'ring' ? 'anchor' : t.kind === 'player' ? 'lift' : 'grab', target: t };
  return { action: p.body.grounded ? 'plant' : 'none', target: null };
}

// Lets go of whatever the hands hold (A, death, bubble). Does not touch `planted`.
export function releaseHolding(w: World, p: PlayerState): void {
  const h = p.holding;
  if (!h) return;
  p.holding = null;
  if (h.kind === 'player') { const t = w.players.find((q) => q.slot === h.id); if (t) t.carriedBy = -1; }
  else if (h.kind === 'box') { const b = w.ent.boxes.find((q) => q.id === h.id); if (b) b.holders = b.holders.filter((s) => s !== p.slot); }
  else if (h.kind === 'lever') { const a = w.ent.activators[h.id]; if (a) a.holders = a.holders.filter((s) => s !== p.slot); }
  emit(w, 'obst.release', { player: p.slot });
}

// Everything a player must drop when it leaves play (death, bubble, disconnect).
export function dropAll(w: World, p: PlayerState): void {
  if (p.holding) releaseHolding(w, p);
  if (p.carriedBy >= 0) { const c = w.players.find((q) => q.slot === p.carriedBy); if (c?.holding?.kind === 'player' && c.holding.id === p.slot) { c.holding = null; emit(w, 'obst.release', { player: c.slot }); } p.carriedBy = -1; }
  for (const q of w.players) if (q.lift?.by === p.slot) q.lift = null;
  p.lift = null; p.planted = false; p.climbing = false; p.thrown = 0;
  for (const k of w.ent.keys) if (k.heldBy === p.slot) { k.heldBy = -1; k.x = k.homeX; k.y = k.homeY; }
}

export function applyB(w: World, p: PlayerState): void {
  if (!isActive(p) || p.carriedBy >= 0 || p.lift) return;
  const b = p.body;
  if (p.planted) { p.planted = false; return; }
  if (p.holding) {
    if (p.holding.kind === 'player') {
      const t = w.players.find((q) => q.slot === p.holding!.id);
      p.holding = null;
      if (t) {
        t.carriedBy = -1;
        t.body.vx = THROW_VX * b.facing; t.body.vy = THROW_VY; t.body.facing = b.facing;
        t.body.grounded = false; t.body.supportId = -1; t.body.air = NONE;
        t.thrown = THROWN_MAX_STEPS;
        p.stats.throws++;
        emit(w, 'obst.throw', { player: p.slot, target: t.slot, vx: t.body.vx, vy: t.body.vy });
      }
    } else releaseHolding(w, p);
    return;
  }
  const t = findTarget(w, p);
  if (!t) { if (b.grounded) p.planted = true; return; }
  if (t.kind === 'ring') {
    const r = w.ent.rings[t.id]!;
    const x = r.x * TILE + TILE / 2 - PLAYER_W / 2, y = r.y * TILE + TILE / 2 - RING_HANG_DY;
    if (boxHitsSolid(w.grid, x, y, PLAYER_W, PLAYER_H)) { if (b.grounded) p.planted = true; return; }
    b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.grounded = false; b.supportId = -1; b.air = NONE;
    p.holding = { kind: 'ring', id: t.id };
    p.climbing = false;
  } else if (t.kind === 'player') {
    const o = w.players.find((q) => q.slot === t.id)!;
    if (o.holding) releaseHolding(w, o);
    o.planted = false; o.climbing = false; o.thrown = 0;
    o.carriedBy = p.slot;
    p.holding = { kind: 'player', id: o.slot };
  } else if (t.kind === 'box') {
    const box = w.ent.boxes.find((q) => q.id === t.id)!;
    box.holders.push(p.slot);
    box.holders.sort((a, c) => a - c);
    p.holding = { kind: 'box', id: box.id };
  } else {
    w.ent.activators[t.id]!.holders.push(p.slot);
    p.holding = { kind: 'lever', id: t.id };
  }
  emit(w, 'obst.grab', { player: p.slot, target: t.kind, targetId: t.id });
}

// A pressed. Lets go of everything; returns true if A was used up (the player must not also run its normal jump this step).
export function applyA(w: World, p: PlayerState): boolean {
  const b = p.body;
  if (p.carriedBy >= 0) { // struggles free from whoever carries it
    const c = w.players.find((q) => q.slot === p.carriedBy);
    if (c) { c.holding = null; emit(w, 'obst.release', { player: c.slot }); }
    p.carriedBy = -1;
    b.vy = -JUMP_V0; b.grounded = false; b.supportId = -1; b.air = NONE;
    emit(w, 'obst.jump', { player: p.slot, kind: 'ground' });
    return true;
  }
  if (p.lift) { p.lift = null; return false; }
  if (p.holding?.kind === 'ring') {
    p.holding = null;
    b.vy = -JUMP_V0; b.grounded = false; b.air = NONE;
    emit(w, 'obst.release', { player: p.slot });
    emit(w, 'obst.jump', { player: p.slot, kind: 'rope' });
    return true;
  }
  if (p.holding) releaseHolding(w, p);
  p.planted = false;
  if (p.climbing) {
    p.climbing = false;
    b.vy = -JUMP_V0; b.grounded = false; b.supportId = -1; b.air = NONE;
    emit(w, 'obst.jump', { player: p.slot, kind: 'ground' });
    return true;
  }
  return false;
}

// Mano amiga (plan §5): a planted player at an edge catches a teammate who is falling in the sensor below the edge.
export function handCatchStep(w: World, handZoneTiles: number): void {
  const steps = Math.round(HAND_LIFT_SEC / DT);
  for (const c of w.players) {
    if (!isActive(c) || !c.planted || !c.body.grounded || c.holding) continue;
    const cb = c.body, feet = cb.y + PLAYER_H;
    for (const dir of [cb.facing, -cb.facing] as const) {
      const probeX = dir > 0 ? cb.x + PLAYER_W + 2 : cb.x - 2;
      const edge = !boxHitsSolid(w.grid, probeX - 1, feet + 1, 2, 2) && !boxHitsOneWay(w, probeX, feet + 1);
      if (!edge) continue;
      const zone: PxRect = { x: dir > 0 ? cb.x + PLAYER_W - 4 : cb.x - 1.5 * TILE, y: feet - TILE / 2, w: 1.5 * TILE + 4, h: TILE / 2 + handZoneTiles * TILE };
      for (const t of w.players) {
        if (t.slot === c.slot || !isActive(t) || t.lift || t.carriedBy >= 0 || t.holding?.kind === 'ring' || t.climbing || t.body.grounded || t.body.vy < 0) continue;
        const r = bodyRect(t.body);
        if (r.x < zone.x + zone.w && r.x + r.w > zone.x && r.y < zone.y + zone.h && r.y + r.h > zone.y) {
          t.lift = { by: c.slot, t: 0, fx: t.body.x, fy: t.body.y };
          t.thrown = 0;
          c.stats.catches++;
          emit(w, 'obst.handCatch', { player: c.slot, target: t.slot });
        }
      }
      break;
    }
  }
  for (const t of w.players) {
    if (!t.lift) continue;
    const c = w.players.find((q) => q.slot === t.lift!.by);
    if (!c || !isActive(c) || !c.planted || !isActive(t)) { t.lift = null; continue; }
    const l = t.lift;
    l.t++;
    const u = Math.min(1, l.t / steps);
    const dir = c.body.facing;
    let tx = c.body.x - dir * PLAYER_W * 0.9;
    if (boxHitsSolid(w.grid, tx, c.body.y, PLAYER_W, PLAYER_H)) tx = c.body.x;
    const ty = c.body.y;
    // Up first, then across: from below the ledge a straight diagonal would cut through the corner of the block and crush the lifted player.
    const smooth = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
    t.body.y = l.fy + (ty - l.fy) * smooth(u / 0.6);
    t.body.x = l.fx + (tx - l.fx) * smooth((u - 0.6) / 0.4);
    t.body.vx = 0; t.body.vy = 0;
    if (u >= 1) { t.lift = null; t.body.air = NONE; }
  }
}
const boxHitsOneWay = (w: World, x: number, y: number): boolean => isOneWayKind(tileAt(w.grid, tileOf(x), tileOf(y)));
