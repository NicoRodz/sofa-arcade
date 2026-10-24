// Per-step rules of the campaign layer (see sim/campaign.ts for the ids and the interface). Every function is only called when `world.camp`
// is set, so a quick-match world never reaches this file. Pure: mutates the World it is given and pushes events.
import { DT, INV_MASS, JUMP_V0, LEDGE_PX, PLAYER_H, PLAYER_W, ROPE_JUMP_MULT, RUN_SPEED, TILE } from '../constants';
import { isSolidKind } from '../legend';
import { hangingOnRope } from './rope';
import type { PlayerStep } from './input';
import { superJumpV0 } from './campaign';
import { emit, isActive, playerOf, type PlayerState, type World } from './state';
import { boxHitsHazard, boxHitsSolid, boxTouches, tileAt, tileOf } from './tiles';
import { THROW_VX, THROWN_MAX_STEPS, THROW_VY } from './tuning';
import { newBody, stepPlayer, type Body } from './player';
import { pushBody } from './collide';
import type { RopeNode } from './rope';

const NONE = 255;
const steps = (sec: number) => Math.round(sec / DT);
const cx = (b: Body) => b.x + PLAYER_W / 2;
const cy = (b: Body) => b.y + PLAYER_H / 2;

// --- signals (dynamic 1), countdown, bubble v2 mash. Runs for every connected player that is not dead: a bubble can signal and mash.
export function stepCampaignInputs(w: World, inputs: readonly (PlayerStep | undefined)[]): void {
  const c = w.camp!;
  const cd = w.countdown;
  if (cd) { // 3 .. 2 .. 1 .. ya, one number per second
    cd.steps--;
    if (cd.steps > 0 && cd.steps % steps(1) === 0) emit(w, 'obst.countdown', { by: cd.by, n: cd.steps / steps(1) });
    else if (cd.steps <= 0) { emit(w, 'obst.countdown', { by: cd.by, n: 0 }); w.countdown = null; }
  }
  for (const p of w.players) {
    const k = p.camp;
    if (k.signal && --k.signal.steps <= 0) k.signal = null;
    if (!p.connected || p.mode === 'dead') { k.goHold = 0; continue; }
    const inp = inputs[p.slot];
    if (inp?.signal) {
      k.signal = { kind: inp.signal, steps: steps(c.signalShowSec) };
      emit(w, 'obst.signal', { player: p.slot, kind: inp.signal });
    }
    if (inp?.goHeld) {
      if (++k.goHold >= steps(c.signalHoldSec) && !w.countdown) { w.countdown = { by: p.slot, steps: 3 * steps(1) }; emit(w, 'obst.countdown', { by: p.slot, n: 3 }); }
    } else k.goHold = 0;
    if (p.mode === 'bubble') { // bubble v2: A presses accelerate it; the boost fades a level every 10 steps
      if (inp?.jump) { k.mash = Math.min(c.bubbleMashMax, k.mash + 1); k.mashCool = 10; }
      else if (k.mash > 0 && --k.mashCool <= 0) { k.mash--; k.mashCool = 10; }
    }
  }
}

// --- super jump (dynamic 3): a ground/coyote jump pairs with another one at most `superJumpWindowMs` before. Both get +(v0 x sqrt(mult) - v0) of upward
// speed, so the one that jumped in this very step peaks at exactly `superJumpMult` x the normal height (the earlier one, a bit less: it already spent part of its rise).
export function registerGroundJump(w: World, p: PlayerState): void {
  const c = w.camp!;
  const win = Math.round((c.superJumpWindowMs / 1000) / DT);
  for (const q of w.players) {
    if (q.slot === p.slot || !isActive(q) || w.tick - q.camp.jumpTick > win) continue;
    const dv = superJumpV0(c) - JUMP_V0;
    for (const t of [p, q]) if (t.body.vy < 0) t.body.vy -= dv;
    p.camp.jumpTick = -1000; q.camp.jumpTick = -1000;
    emit(w, 'obst.superJump', { players: [q.slot, p.slot] });
    return;
  }
  p.camp.jumpTick = w.tick;
}

// --- edge assist (plan §5.1): a hanger on a taut rope whose head reached the ledge climbs on its own: one free rope jump pushed into the wall.
// Detected on the wall beside the body (towards the partner above): the first non-solid cell above the wall column is the ledge.
export function edgeAssist(w: World, p: PlayerState, bySlot: readonly (Body | undefined)[]): boolean {
  const c = w.camp!;
  const b = p.body;
  if (!c.edgeAssist || b.grounded || !p.ropeJump || p.holding || p.climbing || p.thrown > 0 || p.carriedBy >= 0 || p.lift || p.camp.assist > 0) return false;
  if (!hangingOnRope(w.ropes, p.slot, bySlot)) return false;
  let partner: Body | undefined;
  for (const r of w.ropes) for (const l of r.links) {
    if (!l.active || !l.taut) continue;
    const o = l.a === p.slot ? l.b : l.b === p.slot ? l.a : -1;
    const ob = o >= 0 ? bySlot[o] : undefined;
    if (ob && cy(ob) < cy(b) - 8) partner = ob;
  }
  if (!partner) return false;
  const dir = cx(partner) >= cx(b) ? 1 : -1;
  const wallX = dir > 0 ? b.x + PLAYER_W : b.x - 2;
  if (!boxTouches(w.grid, wallX, b.y + PLAYER_H * 0.25, 2, PLAYER_H * 0.5, isSolidKind)) return false; // not against a wall
  const col = tileOf(dir > 0 ? b.x + PLAYER_W + 1 : b.x - 1);
  let row = Math.floor((b.y + PLAYER_H * 0.75) / TILE);
  if (!isSolidKind(tileAt(w.grid, col, row))) return false;
  for (let i = 0; i < 12 && isSolidKind(tileAt(w.grid, col, row)); i++) row--;
  if (isSolidKind(tileAt(w.grid, col, row))) return false; // a wall taller than the scan
  const ledgeTop = (row + 1) * TILE;
  if (b.y > ledgeTop + c.edgeReachPx || b.y + PLAYER_H <= ledgeTop + LEDGE_PX) return false; // head not there yet / the normal step-up already works
  if (boxHitsSolid(w.grid, dir > 0 ? col * TILE : (col + 1) * TILE - PLAYER_W, ledgeTop - PLAYER_H, PLAYER_W, PLAYER_H)) return false; // no room on the ledge
  b.vy = -JUMP_V0 * ROPE_JUMP_MULT; b.air = NONE; b.grounded = false; b.supportId = -1;
  p.ropeJump = false;
  p.camp.assist = steps(0.45); p.camp.assistDir = dir;
  emit(w, 'obst.edgeAssist', { player: p.slot });
  return true;
}

// --- anchor (dynamic 2). Called after the world filled the rope nodes: in a campaign a planted player is a true anchor (infinite mass) and a
// grounded, unplanted one that a hanger pulls on becomes a brace that SLIDES towards the edge at `slideTilesPerSec` instead of being yanked.
// An anchor holding more hangers than `anchorHolds` slides too (N >= 3). Returns the slides for applySlides() after the rope solved.
export interface Slide { slot: number; dir: -1 | 1 }
export function prepareAnchors(w: World, nodes: (RopeNode | undefined)[]): Slide[] {
  const hangers = new Map<number, number[]>();
  for (const r of w.ropes) for (const l of r.links) {
    if (!l.active) continue;
    for (const [hold, hang] of [[l.a, l.b], [l.b, l.a]] as const) {
      const h = playerOf(w, hold), g = playerOf(w, hang);
      if (!h || !g || !h.body.grounded || g.body.grounded || h.holding?.kind === 'ring') continue;
      if (cy(g.body) <= cy(h.body) + 8) continue; // the hanger must be below
      hangers.set(hold, [...(hangers.get(hold) ?? []), hang]);
    }
  }
  const out: Slide[] = [];
  for (const [slot, list] of hangers) {
    const p = playerOf(w, slot)!, node = nodes[slot]!;
    const over = p.planted && list.length > w.camp!.anchorHolds;
    if (p.planted && !over) continue; // a true anchor: already w = 0
    node.w = over ? INV_MASS.planted : 0;
    const g = playerOf(w, list[0]!)!;
    const d = cx(g.body) - cx(p.body);
    if (Math.abs(d) > 1) out.push({ slot, dir: d > 0 ? 1 : -1 });
  }
  return out;
}
export function applySlides(w: World, slides: readonly Slide[]): void {
  const px = (w.camp!.slideTilesPerSec * TILE) * DT;
  for (const s of slides) {
    const taut = w.ropes.some((r) => r.links.some((l) => l.active && l.taut && (l.a === s.slot || l.b === s.slot)));
    if (taut) pushBody(playerOf(w, s.slot)!.body, s.dir * px, 0, w.grid);
  }
}

// --- throw arc (plan §5.1): where the lifted teammate would fly if its carrier pressed B now (same constants and the real stepPlayer).
export function throwArc(w: World, p: PlayerState): { x: number; y: number }[] | null {
  if (p.holding?.kind !== 'player') return null;
  const t = playerOf(w, p.holding.id);
  if (!t) return null;
  const b = newBody(t.slot, t.body.x, t.body.y);
  b.facing = p.body.facing; b.vx = THROW_VX * p.body.facing; b.vy = THROW_VY; b.air = NONE;
  const ctx = { grid: w.grid, platforms: [], params: w.params };
  const pts: { x: number; y: number }[] = [{ x: cx(b), y: cy(b) }];
  for (let i = 1; i <= THROWN_MAX_STEPS; i++) {
    stepPlayer(b, { move: (b.facing * THROW_VX) / RUN_SPEED, down: false, jump: false }, ctx);
    if (i % 3 === 0) pts.push({ x: cx(b), y: cy(b) });
    if (b.grounded || b.y > (w.level.h + 1) * TILE || boxHitsHazard(w.grid, b.x, b.y, PLAYER_W, PLAYER_H)) { pts.push({ x: cx(b), y: cy(b) }); break; }
  }
  return pts;
}

// --- camera (plan §5.1): frame both with 3 tiles of margin, look toward the goal, let the chasing hazard push the frame. Read by screen/render/camera.ts
// (`computeCamera({ ..., look })`); null in a quick match.
export interface CameraHints { goalX: number | null; hazard: { kind: 'risingLava' | 'tide' | 'avalanche'; pos: number } | null; padTiles: number }
export function cameraHints(w: World): CameraHints | null {
  const c = w.camp;
  if (!c) return null;
  const g = w.level.markers.goal[0];
  const h = w.ent.hazard;
  return { goalX: c.camLookAtGoal && g ? g.x * TILE + TILE / 2 : null, hazard: h ? { kind: h.kind, pos: h.pos } : null, padTiles: c.camPadTiles };
}
