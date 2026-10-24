// Kinematic player: moves in X, then in Y, against the tile grid and one-way platforms (a player's head is one). 60 Hz fixed step.
// Pure and deterministic: no Math.random, no Date. F2a adds the rope, grabs and entities on top of this.
import {
  AIR_ACCEL_MULT, AIR_DECEL_MULT, ACCEL_SEC, APEX_G_MULT, APEX_VY, CORNER_HEAD_PX, DECEL_SEC, DIFFICULTY_PARAMS, DROP_THROUGH_FRAMES, DT,
  GRAVITY_DOWN_MULT, GRAVITY_UP, JUMP_V0, LEDGE_PX, MAX_FALL, PLAYER_H, PLAYER_W, RUN_SPEED, TILE, TRAMPOLINE_MULT, adaptiveCoyote,
} from '../constants';
import { T, isOneWayKind, isSolidKind } from '../legend';
import type { Difficulty } from '../../../difficulty';
import { boxHitsSolid, onIce, tileAt, tileOf, type TileGrid } from './tiles';

const EPS = 1e-6;
const LAND_EPS = 0.01; // a body resting exactly on a surface still counts as touching it
const NONE = 255; // "long ago" for the age counters
const HEAD_THICKNESS = 6;

export interface Body {
  id: number;
  x: number; // hitbox left, px
  y: number; // hitbox top, px
  vx: number;
  vy: number;
  grounded: boolean;
  supportId: number; // platform the body stands on (a head or a mover), -1 for tiles or none
  onOneWay: boolean; // the surface underfoot is one-way (a down + A drops through it)
  air: number; // steps since the body last ended a step on a surface; coyote lives here
  jumpAge: number; // steps since A was pressed; the buffer lives here
  dropFrames: number; // while > 0 one-way surfaces are ignored
  facing: 1 | -1;
  dx: number; // displacement of the last step: carries whoever stands on this body
  dy: number;
}

// A surface that is not a tile: a head, later a moving platform. dx/dy = how far it moved in the step before the snapshot.
export interface Platform { id: number; x: number; y: number; w: number; h: number; oneWay: boolean; dx: number; dy: number }

export interface StepInput { move: number; down: boolean; jump: boolean } // move in [-1, 1], already quantized; jump = A pressed since the last step

export interface PhysicsParams { coyote: number; buffer: number; stickyEdges: boolean; iceFriction?: number } // iceFriction: campaign only (sim/campaign.ts physicsOfWorld); absent = ice tiles grip like ground
export const physicsFor = (d: Difficulty, p90LatencyMs = 0): PhysicsParams => ({
  coyote: adaptiveCoyote(d, p90LatencyMs), buffer: DIFFICULTY_PARAMS[d].bufferFrames, stickyEdges: DIFFICULTY_PARAMS[d].stickyEdges,
});

export interface StepCtx { grid: TileGrid; platforms: readonly Platform[]; params: PhysicsParams }
export interface StepEvents {
  jump: '' | 'ground' | 'coyote' | 'trampoline';
  land: number; // fall speed in px/s when the body touched down this step, else 0
  landOn: 'ground' | 'oneWay' | 'head';
}

export function newBody(id: number, x: number, y: number): Body {
  return { id, x, y, vx: 0, vy: 0, grounded: false, supportId: -1, onOneWay: false, air: NONE, jumpAge: NONE, dropFrames: 0, facing: 1, dx: 0, dy: 0 };
}

export const headPlatform = (b: Body): Platform => ({ id: b.id, x: b.x, y: b.y, w: PLAYER_W, h: HEAD_THICKNESS, oneWay: true, dx: b.dx, dy: b.dy });

const approach = (v: number, target: number, delta: number): number => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
const hitsSolid = (g: TileGrid, x: number, y: number): boolean => boxHitsSolid(g, x, y, PLAYER_W, PLAYER_H);

interface Landing { top: number; platformId: number; oneWay: boolean; kind: number }
// Highest surface whose top lies between the feet before the move (feetOld) and after it (feetNew): solid tiles, one-way tiles
// and platforms. Ties go to solid ground (a body never "stands on a one-way" when a solid is at the same height).
function findLanding(b: Body, x: number, feetOld: number, feetNew: number, ctx: StepCtx): Landing | null {
  const lo = feetOld - LAND_EPS;
  let best: Landing | null = null;
  const consider = (top: number, platformId: number, oneWay: boolean, kind: number) => {
    if (!best || top < best.top || (top === best.top && best.oneWay && !oneWay)) best = { top, platformId, oneWay, kind };
  };
  const x0 = tileOf(x), x1 = tileOf(x + PLAYER_W - EPS);
  const ty0 = Math.ceil(lo / TILE), ty1 = Math.floor(feetNew / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(ctx.grid, tx, ty);
      if (isSolidKind(k)) consider(ty * TILE, -1, false, k);
      else if (isOneWayKind(k) && b.dropFrames === 0) consider(ty * TILE, -1, true, k);
    }
  }
  if (b.dropFrames === 0) {
    for (const p of ctx.platforms) {
      if (p.id === b.id || !p.oneWay) continue;
      if (x < p.x + p.w && x + PLAYER_W > p.x && p.y >= lo && p.y <= feetNew) consider(p.y, p.id, true, -1);
    }
  }
  return best;
}

export function stepPlayer(b: Body, input: StepInput, ctx: StepCtx): StepEvents {
  const ev: StepEvents = { jump: '', land: 0, landOn: 'ground' };
  const x0 = b.x, y0 = b.y;
  const wasGrounded = b.grounded;
  const { grid, params } = ctx;

  // 1. Carried by what it stood on (a head or a moving platform), using how far that moved before this step.
  if (b.supportId >= 0) {
    const p = ctx.platforms.find((q) => q.id === b.supportId);
    if (p) {
      moveX(b, p.dx, grid);
      if (!hitsSolid(grid, b.x, b.y + p.dy)) b.y += p.dy;
    }
  }

  // 2. Timers and A.
  if (b.dropFrames > 0) b.dropFrames--;
  let dropped = false;
  if (input.jump) {
    if (input.down && wasGrounded && b.onOneWay) { b.dropFrames = DROP_THROUGH_FRAMES; b.grounded = false; b.supportId = -1; dropped = true; } // down + A: fall through, no jump
    else b.jumpAge = 0;
  }
  let jumped = false;
  if (b.jumpAge <= params.buffer && b.air <= params.coyote && !dropped) {
    ev.jump = b.air === 0 ? 'ground' : 'coyote';
    b.vy = -JUMP_V0;
    b.jumpAge = NONE;
    b.grounded = false;
    b.supportId = -1;
    jumped = true;
  }

  // 3. Horizontal speed: the stick sets an absolute target (plan §2).
  const target = input.move * RUN_SPEED;
  const accelerating = target !== 0 && (b.vx === 0 || Math.sign(b.vx) === Math.sign(target)) && Math.abs(target) > Math.abs(b.vx);
  let rate = RUN_SPEED / (accelerating ? ACCEL_SEC : DECEL_SEC);
  if (!wasGrounded) rate *= accelerating ? AIR_ACCEL_MULT : AIR_DECEL_MULT;
  else if (params.iceFriction !== undefined && b.supportId === -1 && onIce(grid, b)) rate *= params.iceFriction; // slippery: slow to start, slow to stop
  b.vx = approach(b.vx, target, rate * DT);
  if (input.move !== 0) b.facing = input.move > 0 ? 1 : -1;

  // 4. Vertical speed: jump arc with hang time at the top, heavier fall, terminal speed.
  let g = b.vy < 0 ? GRAVITY_UP : GRAVITY_UP * GRAVITY_DOWN_MULT;
  if (Math.abs(b.vy) < APEX_VY) g *= APEX_G_MULT;
  const vyNew = Math.min(MAX_FALL, b.vy + g * DT);
  const dy = ((b.vy + vyNew) / 2) * DT;
  const impact = b.vy;
  b.vy = vyNew;

  // 5. Move X, then Y.
  const xBefore = b.x;
  moveX(b, b.vx * DT, grid);
  if (params.stickyEdges && wasGrounded && !jumped && Math.abs(input.move) <= 0.45 && !input.jump) keepOnEdge(b, xBefore, ctx);
  const landed = moveY(b, dy, ctx);

  // 6. Ground state, events.
  if (landed) {
    b.grounded = true;
    b.supportId = landed.platformId;
    b.onOneWay = landed.oneWay;
    b.air = 0;
    if (!wasGrounded) { ev.land = impact; ev.landOn = landed.platformId >= 0 ? 'head' : landed.oneWay ? 'oneWay' : 'ground'; }
    if (landed.kind === T.Trampoline) { b.vy = -JUMP_V0 * TRAMPOLINE_MULT; b.grounded = false; b.supportId = -1; b.air = NONE; ev.jump = 'trampoline'; }
  } else {
    b.grounded = false;
    b.supportId = -1;
    b.onOneWay = false;
    b.air = jumped || ev.jump === 'trampoline' ? NONE : Math.min(NONE, b.air + 1);
  }
  if (b.jumpAge < NONE) b.jumpAge++;
  b.dx = b.x - x0;
  b.dy = b.y - y0;
  return ev;
}

// Horizontal move with wall snap and ledge boost: a wall top within LEDGE_PX of the feet lifts the body over it.
function moveX(b: Body, dx: number, g: TileGrid): void {
  if (dx === 0) return;
  const nx = b.x + dx;
  if (!hitsSolid(g, nx, b.y)) { b.x = nx; return; }
  for (let k = 1; k <= LEDGE_PX; k++) {
    if (!hitsSolid(g, nx, b.y - k)) { b.x = nx; b.y -= k; return; }
  }
  b.x = dx > 0 ? tileOf(nx + PLAYER_W - EPS) * TILE - PLAYER_W : (tileOf(nx) + 1) * TILE;
  b.vx = 0;
}

// Vertical move. Up: ceiling snap with a sideways nudge at corners. Down: land on the highest surface crossed.
function moveY(b: Body, dy: number, ctx: StepCtx): Landing | null {
  const g = ctx.grid;
  if (dy < 0) {
    const ny = b.y + dy;
    if (!hitsSolid(g, b.x, ny)) { b.y = ny; return null; }
    for (let n = 1; n <= CORNER_HEAD_PX; n++) {
      for (const s of [n, -n]) {
        if (!hitsSolid(g, b.x + s, ny) && !hitsSolid(g, b.x + s, b.y)) { b.x += s; b.y = ny; return null; }
      }
    }
    b.y = (tileOf(ny) + 1) * TILE;
    b.vy = 0;
    return null;
  }
  const feetOld = b.y + PLAYER_H;
  const hit = findLanding(b, b.x, feetOld, feetOld + dy, ctx);
  if (!hit) { b.y += dy; return null; }
  b.y = hit.top - PLAYER_H;
  b.vy = 0;
  return hit;
}

// Easy mode: walking at half speed never drops the body off an edge; it stops at the last supported spot.
function keepOnEdge(b: Body, xBefore: number, ctx: StepCtx): void {
  const feet = b.y + PLAYER_H;
  if (findLanding(b, b.x, feet, feet + 1, ctx)) return;
  for (let i = 7; i >= 0; i--) {
    const x = xBefore + ((b.x - xBefore) * i) / 8;
    if (findLanding(b, x, feet, feet + 1, ctx)) { b.x = x; b.vx = 0; return; }
  }
  b.x = xBefore; b.vx = 0;
}

// All bodies of a step: heads are one-way platforms snapshotted before anyone moves, then everyone steps in slot order.
export function stepPlayers(bodies: Body[], inputs: readonly StepInput[], grid: TileGrid, params: PhysicsParams, extra: readonly Platform[] = []): StepEvents[] {
  const platforms = [...bodies.map(headPlatform), ...extra];
  return bodies.map((b, i) => stepPlayer(b, inputs[i] ?? { move: 0, down: false, jump: false }, { grid, platforms, params }));
}

// FNV-1a over the quantized state: equal hashes after N steps = same simulation.
export function hashBodies(bodies: readonly Body[]): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 0x01000193); };
  for (const b of bodies) for (const v of [b.id, b.x, b.y, b.vx, b.vy, b.grounded ? 1 : 0, b.supportId, b.air, b.jumpAge, b.dropFrames, b.facing]) mix(v);
  return h >>> 0;
}
