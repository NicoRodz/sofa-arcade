// A scripted explorer for the tests and the ws bots: it reads the world as plain data (snapshot + grid) and answers with the stick and the
// two buttons, like a phone would. It is not a general solver: it runs towards the goal, jumps walls and gaps by looking ahead, and knows the
// one cooperative trick the first levels need (a wall taller than a solo jump: one waits as a step, one climbs the head and plants at the
// edge, the rest are caught by the hand). Press requests are edges: the caller turns each `true` into one tap.
import { JUMP_PEAK_PX, PLAYER_H, PLAYER_W, TILE } from './constants';
import { T } from './legend';
import { newBody, physicsFor, stepPlayer } from './sim/player/player';
import { tileAt, type TileGrid } from './sim/world/tiles';
import type { PlayerSnap } from './sim/world';

export interface BotView {
  tick: number;
  grid: TileGrid;
  players: readonly PlayerSnap[];
  goal: { x: number; y: number; w: number; h: number } | null;
}
export interface BotOut {
  x: number;
  y: number;
  jump: boolean;
  grab: boolean;
}
const IDLE: BotOut = { x: 0, y: 0, jump: false, grab: false };

const standable = (k: number) =>
  k === T.Solid || k === T.OneWay || k === T.Crumble || k === T.BeltL || k === T.BeltR || k === T.Trampoline || k === T.Door || k === T.Ice;
const blocking = (k: number) => k === T.Solid || k === T.Crumble || k === T.BeltL || k === T.BeltR || k === T.Door || k === T.Ice;
const col = (px: number) => Math.floor(px / TILE);
const HALF_W = PLAYER_W / 2;
const SOLO_REACH_TILES = JUMP_PEAK_PX / TILE; // 3.6
export const CROWD_PX = 110; // px: how tight the group must be before it steps onto planks together
export const STEP_GAP = 100; // px between the climber's and the step's centres when it jumps

// How far a full-speed running jump carries the body on flat ground, measured with the game's own stepPlayer (not a formula).
function measureJumpTravel(): number {
  const w = 120,
    h = 10;
  const cells = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) cells[9 * w + x] = T.Solid;
  const grid: TileGrid = { w, h, cells };
  const ctx = { grid, platforms: [], params: physicsFor('normal') };
  const b = newBody(0, 2 * TILE, 9 * TILE - PLAYER_H);
  b.grounded = true;
  b.air = 0;
  for (let i = 0; i < 40; i++) stepPlayer(b, { move: 1, down: false, jump: false }, ctx);
  const x0 = b.x;
  stepPlayer(b, { move: 1, down: false, jump: true }, ctx);
  for (let i = 0; i < 120 && !b.grounded; i++) stepPlayer(b, { move: 1, down: false, jump: false }, ctx);
  return b.x - x0;
}
export const JUMP_TRAVEL = measureJumpTravel();

interface Wall {
  faceX: number;
  topY: number;
} // faceX: left face of the wall (px); topY: its top (px)

export class ObstBot {
  private lastJump = -999;
  private lastGrab = -999;
  private wall: Wall | null = null;
  constructor(readonly slot: number) {}

  reset(): void {
    this.wall = null;
    this.lastJump = -999;
    this.lastGrab = -999;
  } // new level

  private jumpOk(tick: number, gap = 24): boolean {
    return tick - this.lastJump >= gap;
  }

  // The first column ahead (up to 8 tiles) whose wall is taller than a solo jump: the cooperative wall of level 1.
  private tallWall(g: TileGrid, me: PlayerSnap, dir: number): Wall | null {
    const feetRow = Math.round((me.y + PLAYER_H) / TILE) - 1;
    for (let d = 1; d <= 8; d++) {
      const c = col(me.x + HALF_W) + dir * d;
      let h = 0;
      while (h < 10 && blocking(tileAt(g, c, feetRow - h))) h++;
      if (h === 0) continue;
      if (h > SOLO_REACH_TILES + 0.2 && h <= 6 && feetRow - h >= 1 && c > 0 && c < g.w - 1)
        return { faceX: dir > 0 ? c * TILE : (c + 1) * TILE, topY: (feetRow - h + 1) * TILE };
      return null; // a wall a solo jump clears
    }
    return null;
  }

  decide(v: BotView): BotOut {
    const me = v.players.find((p) => p.slot === this.slot);
    if (!me || !me.connected || me.mode !== 'active' || !v.goal) return IDLE;
    const g = v.grid;
    const cx = me.x + HALF_W,
      feetY = me.y + PLAYER_H;
    const goalX = v.goal.x + v.goal.w / 2;
    const dir = goalX > cx ? 1 : -1;
    const atGoal = Math.abs(goalX - cx) < 14 && Math.abs(v.goal.y + v.goal.h / 2 - (me.y + PLAYER_H / 2)) < 90;
    const act = v.players.filter((p) => p.connected && p.mode === 'active');
    const out: BotOut = { x: 0, y: 0, jump: false, grab: false };

    // --- the tall wall (needs a tower and the hand)
    const seen = me.grounded ? this.tallWall(g, me, dir) : null; // only measured from solid ground (the walls of a pit are not a puzzle)
    if (seen && !this.wall) this.wall = seen; // remembered: a body in the air or on top no longer measures the wall from below
    const wall = this.wall ?? this.wallFromTop(v, g, act);
    if (wall && act.every((p) => (p.x + HALF_W - wall.faceX) * dir > -4))
      this.wall = null; // everybody is past it: back to plain running (campaign levels have more than one obstacle)
    else if (wall) return this.coopWall(v, me, act, wall, dir);

    if (me.planted && v.tick - this.lastGrab > 10) {
      out.grab = true;
      this.lastGrab = v.tick;
      return out;
    } // never stay planted by accident
    if (atGoal) return IDLE;

    // --- run to the goal: look ahead for walls and gaps
    out.x = dir;
    const front = cx + dir * (HALF_W + 3);
    const wallAhead =
      blocking(tileAt(g, col(front), Math.floor((feetY - 6) / TILE))) || blocking(tileAt(g, col(front), Math.floor((me.y + 6) / TILE)));
    const floorAhead = standable(tileAt(g, col(cx + dir * (HALF_W + 9)), Math.floor((feetY + 4) / TILE)));
    const feetRow = Math.round(feetY / TILE);
    // a gap with a trampoline in it: take off so that the jump comes down ON it (a jump from the edge would overshoot a one-tile pad)
    let pad: number | null = null;
    for (let d = 1; d <= 8 && pad === null; d++) {
      const c = col(cx) + dir * d;
      if (tileAt(g, c, feetRow) !== T.Trampoline) continue;
      let gap = false;
      for (let e = 1; e < d; e++) if (!standable(tileAt(g, col(cx) + dir * e, feetRow))) gap = true;
      if (gap) pad = (c + 0.5) * TILE;
    }
    if (pad !== null) {
      // one pad, one explorer at a time: whoever is on it or bouncing above it goes first
      const zoneEnd = pad + dir * 9 * TILE; // a bounce carries about 8 tiles past the pad
      const busy = act.some((p) => {
        if (p.slot === this.slot || p.inGoal) return false;
        const px = p.x + HALF_W;
        const ahead = (px - cx) * dir > 0 || ((px - cx) * dir === 0 && p.slot < this.slot);
        return ahead && (px - zoneEnd) * dir < 0 && p.y < feetRow * TILE + 6 * TILE;
      });
      if (me.grounded && (pad - cx) * dir <= JUMP_TRAVEL - 6 && this.jumpOk(v.tick)) {
        if (busy) out.x = 0;
        else {
          out.jump = true;
          this.lastJump = v.tick;
        }
      }
      return out;
    }
    // planks that give way 0.5 s after the first step: cross them all together, or the last ones fall in
    const ahead = col(cx + dir * (HALF_W + 14));
    if (me.grounded && tileAt(g, ahead, feetRow) === T.Crumble && tileAt(g, col(cx), feetRow) !== T.Crumble) {
      let end = ahead;
      while (tileAt(g, end + dir, feetRow) === T.Crumble) end += dir;
      const endX = (end + 0.5) * TILE;
      const waiting = act.filter((p) => p.slot !== this.slot && (endX - (p.x + HALF_W)) * dir > 0 && p.grounded);
      if (waiting.some((p) => Math.abs(p.x + HALF_W - cx) > CROWD_PX)) {
        out.x = 0;
        return out;
      }
    }
    const spikesAhead = tileAt(g, col(cx + dir * (HALF_W + 34)), feetRow - 1) === T.Spikes; // a strip of spikes on the floor: jump before it
    if (me.grounded && (wallAhead || !floorAhead || spikesAhead) && this.jumpOk(v.tick)) {
      out.jump = true;
      this.lastJump = v.tick;
    }
    return out;
  }

  // Players already on top of the wall keep it in mind while others are still below (the wall is not "ahead" for them).
  private wallFromTop(v: BotView, g: TileGrid, act: readonly PlayerSnap[]): Wall | null {
    for (const p of act) {
      if (p.slot === this.slot) continue;
      const dir = v.goal!.x + v.goal!.w / 2 > p.x ? 1 : -1;
      const w = this.tallWall(g, p, dir);
      if (w) return w;
    }
    return null;
  }

  private coopWall(v: BotView, me: PlayerSnap, act: readonly PlayerSnap[], wall: Wall, dir: number): BotOut {
    const out: BotOut = { x: 0, y: 0, jump: false, grab: false };
    const cx = me.x + HALF_W,
      feetY = me.y + PLAYER_H;
    const onTop = (p: PlayerSnap) => (p.x + HALF_W - wall.faceX) * dir > -4; // past the wall's face: on top of it, or already down the far side (campaign walls drop to a floor)
    const top = act.filter(onTop);
    const below = act.filter((p) => !onTop(p)).sort((a, b) => a.slot - b.slot);
    const base = below[0];
    const walkTo = (x: number, tol = 8): void => {
      const d = x - cx;
      out.x = Math.abs(d) <= tol ? 0 : Math.sign(d) * (Math.abs(d) > 40 ? 1 : 0.5);
    };
    const edgeX = wall.faceX + dir * 6; // where the one on top stands: its near side hangs over the edge (the hand's probe needs the body edge within 1 px of it)
    const faceX = wall.faceX - dir * (HALF_W + 3); // standing against the wall, on the near side

    if (onTop(me)) {
      const planter = [...top].sort((a, b) => a.slot - b.slot)[0];
      if (below.length > 0 && planter?.slot === this.slot) {
        // hold the edge: plant and wait
        if (me.facing === dir && !me.planted) {
          // it must FACE the edge: whoever is lifted lands behind it. Go a bit inland, then turn back
          out.x = (cx - wall.faceX) * dir < 44 ? dir : -dir;
          return out;
        }
        walkTo(edgeX, 5);
        if (Math.abs(cx - edgeX) <= 9 && me.grounded && !me.planted && v.tick - this.lastGrab > 12) {
          out.grab = true;
          this.lastGrab = v.tick;
        }
        return out;
      }
      if (me.planted && v.tick - this.lastGrab > 10) {
        out.grab = true;
        this.lastGrab = v.tick;
        return out;
      }
      out.x = dir; // everyone else on top runs on to the goal
      return out;
    }

    // below the wall
    if (top.length === 0) {
      if (me.slot === base?.slot) {
        walkTo(faceX, 4);
        return out;
      } // the step
      if (me.slot === below[1]?.slot) {
        // the climber: jump onto the step's head, then again towards the top
        const head = base ? Math.abs(feetY - base.y) < 6 && Math.abs(cx - (base.x + HALF_W)) < 22 : false;
        if (head && me.grounded) {
          out.x = dir;
          if (this.jumpOk(v.tick, 18)) {
            out.jump = true;
            this.lastJump = v.tick;
          }
          return out;
        }
        if (base) {
          // Standing start at STEP_GAP from the step, then a half-speed jump: it comes down on the head (the rope keeps a run-up under 3.5 tiles anyway)
          const gap = (base.x + HALF_W - cx) * dir;
          const baseSettled = Math.abs(base.x + HALF_W - faceX) < 10 && base.grounded;
          if (!me.grounded) {
            out.x = 0.5 * dir;
            return out;
          }
          if (!baseSettled || Math.abs(gap - STEP_GAP) > 5 || Math.abs(me.vx) > 8) {
            walkTo(base.x + HALF_W - dir * STEP_GAP, 4);
            return out;
          }
          if (this.jumpOk(v.tick, 40)) {
            out.x = 0.5 * dir;
            out.jump = true;
            this.lastJump = v.tick;
          }
          return out;
        }
      }
      walkTo(faceX - dir * 3 * TILE, 10); // the rest wait a few tiles back
      return out;
    }
    // somebody is up and holding the hand: the others (the step goes last) jump at the wall
    const others = below.filter((p) => p.slot !== base?.slot);
    const myTurn = others.length > 0 ? others.some((p) => p.slot === me.slot) : me.slot === base?.slot;
    if (!myTurn) {
      walkTo(faceX - dir * 2 * TILE, 10);
      return out;
    }
    walkTo(faceX, 4);
    if (me.grounded && Math.abs(cx - faceX) < 10 && this.jumpOk(v.tick, 45)) {
      out.jump = true;
      this.lastJump = v.tick;
    }
    return out;
  }
}
