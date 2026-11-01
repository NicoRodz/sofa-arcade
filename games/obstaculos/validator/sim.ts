// Trajectory simulation for the validator: every jump, fall, throw and swing is a run of the REAL stepPlayer (sim/player.ts),
// so the envelope is the game's physics, not a formula. A plan = where the body starts, what it holds, when it presses A.
import { JUMP_V0, PLAYER_H, PLAYER_W, ROPE_JUMP_MULT, TILE } from '../constants';
import { T } from '../legend';
import { boxHitsHazard, tileAt, tileOf, type TileGrid } from '../sim/world/tiles';
import { newBody, stepPlayer, type Body, type PhysicsParams } from '../sim/player/player';

export const EDGE_MOVE_SCALE = 0.92; // "an edge is valid only if it uses <= 92 % of the envelope" (plan §12): the stick is scaled down to this
export const MAX_SIM_STEPS = 260;

export interface Plan {
  x: number; // body left, px
  feetY: number; // px (feet at the start)
  dir: -1 | 0 | 1;
  trigger: 'at' | 'edge' | 'walk' | 'drop' | 'launch';
  k: number; // 'edge': A pressed k frames after leaving the ground (0 = on the last grounded step)
  lead?: number; // 'edge': press A when this many px are left before the end of the platform (endX); overrides k
  endX?: number; // px of the platform end the body runs towards
  air: 'hold' | 'brake'; // 'brake': the stick is released once the body starts to fall
  f: number; // stick scale
  vx0?: number; // 'launch' (a throw or a rope jump): initial velocity in px/s
  vy0?: number;
  // Super jump (campaign dynamic 3, sim/campaignrules.ts registerGroundJump): `boost` px/s of upward speed are added `boostDelay` steps after the ground jump, if the body is still
  // rising. boostDelay = the pairing window (150 ms) is the pessimistic partner: the one that jumped first and got the boost last (the later one peaks higher).
  boost?: number;
  boostDelay?: number;
}

export interface CatchZone {
  x0: number;
  x1: number;
  yTop: number;
  yBot: number;
  cx: number;
  ty: number;
} // hand: a planted partner catches whoever falls here
export interface Landing {
  cx: number;
  ty: number;
  takeoffX: number;
  landX: number;
  steps: number;
  viaHand: boolean;
  apexRise: number;
}

export const feetOfRow = (ty: number): number => (ty + 1) * TILE; // feet y of a body standing in cell row ty

function standingCell(grid: TileGrid, b: Body): { cx: number; ty: number } | null {
  const ty = Math.round((b.y + PLAYER_H) / TILE) - 1;
  const cxs = [tileOf(b.x + PLAYER_W / 2), tileOf(b.x), tileOf(b.x + PLAYER_W - 1e-6)];
  for (const cx of cxs) {
    const below = tileAt(grid, cx, ty + 1);
    if (below !== T.Empty && below !== T.Trampoline && below !== T.Spikes && below !== T.Liquid && below !== T.Ladder && below !== T.Object)
      return { cx, ty };
  }
  return null;
}

export function simPlan(grid: TileGrid, params: PhysicsParams, plan: Plan, catches?: Map<number, CatchZone[]>): Landing | null {
  const b = newBody(0, plan.x, plan.feetY - PLAYER_H);
  const launch = plan.trigger === 'launch';
  if (launch) {
    b.vx = plan.vx0 ?? 0;
    b.vy = plan.vy0 ?? 0;
    b.air = 255;
  } else {
    b.grounded = true;
    b.air = 0;
    b.onOneWay = tileAt(grid, tileOf(plan.x + PLAYER_W / 2), Math.round(plan.feetY / TILE)) === T.OneWay;
  }
  const ctx = { grid, platforms: [], params };
  const move = plan.dir * plan.f;
  let airborne = launch,
    pressed = false,
    leftAt = -1,
    takeoffX = launch ? plan.x : -1,
    minY = b.y,
    blocked = 0,
    jumpedAt = -1;
  const startY = b.y;
  for (let i = 0; i < MAX_SIM_STEPS; i++) {
    let jump = false,
      down = false,
      mv = move;
    if (plan.trigger === 'at') jump = i === 0;
    else if (plan.trigger === 'drop') {
      jump = i === 0;
      down = i === 0;
    } else if (plan.trigger === 'edge' && !pressed) {
      if (plan.lead !== undefined && plan.endX !== undefined) {
        const left = plan.dir === 1 ? plan.endX - b.x : b.x + PLAYER_W - plan.endX;
        if (b.grounded && left <= plan.lead) {
          jump = true;
          pressed = true;
        }
      } else if (b.grounded) {
        if (plan.k === 0) {
          // press on the last grounded step: look one step ahead
          const t = { ...b };
          stepPlayer(t, { move: mv, down: false, jump: false }, ctx);
          if (!t.grounded) {
            jump = true;
            pressed = true;
          }
        }
      } else if (leftAt >= 0 && b.air === plan.k && plan.k > 0) {
        jump = true;
        pressed = true;
      }
    }
    if (plan.trigger === 'at' || plan.trigger === 'drop') pressed = pressed || jump;
    if (plan.air === 'brake' && airborne && b.vy > 0) mv = 0;
    const wasGrounded = b.grounded;
    const xBefore = b.x;
    const ev = stepPlayer(b, { move: mv, down, jump }, ctx);
    if (ev.jump === 'ground' || ev.jump === 'coyote') jumpedAt = i;
    if (plan.boost && jumpedAt >= 0 && i - jumpedAt === (plan.boostDelay ?? 0) && b.vy < 0) b.vy -= plan.boost;
    if (ev.jump === 'trampoline' && i > 0) {
      // landed on a boya: it is a node of its own (the bounce is planned from there)
      return {
        cx: tileOf(b.x + PLAYER_W / 2),
        ty: Math.round((b.y + PLAYER_H) / TILE) - 1,
        takeoffX: takeoffX < 0 ? plan.x : takeoffX,
        landX: b.x,
        steps: i + 1,
        viaHand: false,
        apexRise: startY - minY,
      };
    }
    if (b.y < minY) minY = b.y;
    if (!airborne && b.grounded && mv !== 0 && Math.abs(b.x - xBefore) < 1e-9) {
      if (++blocked > 8) return null;
    } else blocked = 0; // pushing against a wall on the ground
    if (wasGrounded && !b.grounded && takeoffX < 0) {
      takeoffX = b.x;
      leftAt = i;
    }
    if (!b.grounded) airborne = true;
    if (b.y > (grid.h + 2) * TILE) return null;
    if (boxHitsHazard(grid, b.x, b.y, PLAYER_W, PLAYER_H)) return null;
    if (catches && airborne) {
      const y = b.y + PLAYER_H;
      for (let tx = tileOf(b.x); tx <= tileOf(b.x + PLAYER_W - 1e-6); tx++) {
        for (const z of catches.get(tx) ?? []) {
          if (b.x + PLAYER_W > z.x0 && b.x < z.x1 && y >= z.yTop && y <= z.yBot)
            return {
              cx: z.cx,
              ty: z.ty,
              takeoffX: takeoffX < 0 ? plan.x : takeoffX,
              landX: b.x,
              steps: i + 1,
              viaHand: true,
              apexRise: startY - minY,
            };
        }
      }
    }
    if (airborne && b.grounded) {
      const cell = standingCell(grid, b);
      if (!cell) return null;
      return { ...cell, takeoffX: takeoffX < 0 ? plan.x : takeoffX, landX: b.x, steps: i + 1, viaHand: false, apexRise: startY - minY };
    }
  }
  return null;
}

// A jump out of the rope's arc (plan §4 "Salto de cuerda"): 0.8 * v0 straight up, carrying the swing's speed.
export const ropeJumpLaunch = (px: number, py: number, dir: -1 | 1, f: number): Plan => ({
  x: px - PLAYER_W / 2,
  feetY: py + PLAYER_H / 2,
  dir,
  trigger: 'launch',
  k: 0,
  air: 'hold',
  f,
  vx0: dir * 330 * f,
  vy0: -JUMP_V0 * ROPE_JUMP_MULT,
});
