// The gentle rat (council event "Rata", feel pass: "the rat never gives you a chance to reach it"). Everything here runs only when `game.magnet` is on, so the
// rounds without it (every golden fixture of the older rules) keep the old rat to the bit. What changes, all of it in RAT_GENTLE below:
//  - it walks at 70% of the old speed (2.4 -> 1.68 tiles/s), in straight runs with smooth turns (a turn rate, not tile-centre zigzag) and a pause after every run
//  - it never grabs anything in its first second, and it does not leave before MIN_STAY: a rat that stole sits gnawing at the counter until then, and one with nothing
//    to steal waits PATIENCE (the old rule left after 10 s)
//  - the scare is easier: a bigger capture radius while the chef dashes, a dash that has just ended still counts for a moment (the dash lasts 180 ms), and a chef that
//    simply runs into it scares it too, hands full or not (a dash needs free hands, and a cook rarely has them)
//  - it announces itself: `rat:target` when it picks a counter and `rat:near` when it is about to arrive (the screen draws an arrow and sounds a cue)
//  - a prize for scaring it: RAT_BONUS points to the team
// The sim hands over its helpers (`RatKit`), so this file imports nothing from it but types.
import type { Game, Player } from '../round/state';
import type { Mid, Rat } from '../midround';
import { dodgeStep, ratGait, ratParams } from './rat-v2';

export const RAT_GENTLE = {
  speed: 1.68, // tiles/s: 70% of the old RAT_SPEED (2.4)
  turnDps: 360, // degrees per second the heading may turn: a smooth bend, not a corner
  runMs: 1600, // walks this long, then...
  pauseMs: 700, // ...stops this long
  graceMs: 1000, // nothing is stolen before the rat has been here this long
  minStayMs: 12_000, // it does not leave before this (a rat that stole waits at the counter until then)
  patienceMs: 14_000, // with nothing to steal it waits this long (the old rule: 10 s)
  scareRadius: 1.5, // a dashing chef this close scares it (old: 1.1)
  afterDashMs: 250, // a dash that ended this recently still counts...
  afterRadius: 1.9, // ...within this radius
  touchRadius: 0.6, // a chef at least this fast (touchSpeed, tiles/s) within this radius scares it, carrying or not
  touchSpeed: 1.2,
  nearTiles: 2.2, // `rat:near` fires when it is this close to the counter it is going for
};
export const RAT_BONUS = 50; // points for scaring it off (coop only: the rat is never in a versus pool)

export interface RatKit {
  nextTile(g: Game, from: [number, number], goal: (x: number, y: number) => boolean): [number, number] | null;
  scare(g: Game, m: Mid, playerId: number): void;
  gone(g: Game, m: Mid): void;
  floor(g: Game, x: number, y: number): boolean;
}

/** The radius within which this chef scares the rat now: dashing, just done dashing (within afterDashMs), or simply running (touchRadius); 0 when none. */
export function scareReach(g: Game, p: Player): number {
  const rp = ratParams(g); // HAZARD_V2 numbers of the round's difficulty (feel/rat-v2.ts)
  if (Math.hypot(p.vx, p.vy) >= rp.touchSpeed && !(p.dashMs > 0)) return rp.touchRadius;
  if (p.dashMs > 0) return rp.scareRadius;
  const t = g.params.tune,
    sinceStart = t.dashCdMs - p.dashCd;
  return p.dashCd > 0 && sinceStart > 0 && sinceStart <= t.dashMs + rp.afterDashMs ? rp.afterRadius : 0;
}

/** The prize for scaring the rat (the single team of a coop round). Returns the points. */
export function ratPrize(g: Game): number {
  const t = g.teams[0]!;
  t.score += RAT_BONUS;
  t.gross += RAT_BONUS;
  t.reachedAt = g.time;
  return RAT_BONUS;
}

const tileOf = (r: Rat): [number, number] => [Math.floor(r.x), Math.floor(r.y)];

// One tick of walking towards `goal`: straight runs with a limited turn rate, a pause after each run. Returns true while it moved.
function walk(g: Game, r: Rat, goal: (x: number, y: number) => boolean, dtMs: number, kit: RatKit): boolean {
  if ((r.pauseMs ?? 0) > 0) {
    r.pauseMs = Math.max(0, r.pauseMs! - dtMs);
    return false;
  }
  const step = kit.nextTile(g, tileOf(r), goal);
  if (!step) return false;
  const dx = step[0] + 0.5 - r.x,
    dy = step[1] + 0.5 - r.y,
    d = Math.hypot(dx, dy) || 1;
  const rp = ratParams(g),
    gait = ratGait(g, r, rp);
  const want = Math.atan2(dy, dx);
  let h = r.heading ?? want;
  let diff = want - h;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  h += Math.sign(diff) * Math.min(Math.abs(diff), ((gait.turnDps * Math.PI) / 180) * (dtMs / 1000));
  r.heading = h;
  const move = (gait.speed * dtMs) / 1000;
  const nx = r.x + Math.cos(h) * move,
    ny = r.y + Math.sin(h) * move;
  if (kit.floor(g, Math.floor(nx), Math.floor(ny))) {
    r.x = nx;
    r.y = ny;
  } // a bend that would cut a corner into a wall goes straight to the tile's centre instead
  else {
    const k = Math.min(d, move);
    r.x += (dx / d) * k;
    r.y += (dy / d) * k;
    r.heading = want;
  }
  r.runMs = (r.runMs ?? 0) + dtMs;
  if (r.runMs >= rp.runMs) {
    r.runMs = 0;
    r.pauseMs = rp.pauseMs;
  }
  return true;
}

/**
 * The whole behaviour of a rat that has not been scared yet. Returns false once it is scared (the old flee code takes it to the hole at flee speed).
 */
export function gentleRatStep(g: Game, m: Mid, dtMs: number, kit: RatKit): boolean {
  const r = m.rat!;
  if (r.scared) return false;
  r.born ??= g.time;
  const age = g.time - r.born;
  if (dodgeStep(g, r, dtMs, kit.floor)) return true; // HAZARD_V2: mid-jump it cannot be touched
  for (const p of g.players.values()) {
    if (p.ghost) continue;
    const reach = scareReach(g, p);
    if (reach > 0 && Math.hypot(p.x - r.x, p.y - r.y) <= reach) {
      kit.scare(g, m, p.id);
      return false;
    }
  }
  if (r.state === 'seek') {
    let best = -1,
      bestD = Infinity;
    g.stations.forEach((s, i) => {
      if (s.kind !== 'counter' || !s.item || s.fire !== undefined) return;
      const d = Math.hypot(s.tx + 0.5 - r.x, s.ty + 0.5 - r.y) - (i === r.target ? 0.5 : 0); // it keeps the counter it picked unless another is clearly nearer
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) {
      r.idleMs += dtMs;
      if (r.idleMs >= RAT_GENTLE.patienceMs && age >= RAT_GENTLE.minStayMs) r.state = 'flee';
      return true;
    }
    r.idleMs = 0;
    const s = g.stations[best]!;
    if (r.target !== best) {
      r.target = best;
      r.near = false;
      g.bus.emit('rat:target', { station: best });
    }
    const [tx, ty] = tileOf(r);
    if (!r.near && Math.hypot(s.tx + 0.5 - r.x, s.ty + 0.5 - r.y) <= RAT_GENTLE.nearTiles) {
      r.near = true;
      g.bus.emit('rat:near', { station: best });
    }
    if (Math.abs(tx - s.tx) + Math.abs(ty - s.ty) === 1) {
      if (age < RAT_GENTLE.graceMs) return true; // it is there, but not in its first second
      r.item = s.item;
      r.from = best;
      s.item = null;
      r.state = 'flee';
      g.bus.emit('rat:steal', { station: best, item: r.item! });
      return true;
    }
    walk(g, r, (x, y) => Math.abs(x - s.tx) + Math.abs(y - s.ty) === 1, dtMs, kit);
    return true;
  }
  if (age < RAT_GENTLE.minStayMs) return true; // flee: it stays gnawing at the counter until it has been here MIN_STAY
  if (tileOf(r)[0] === r.hole[0] && tileOf(r)[1] === r.hole[1]) {
    kit.gone(g, m);
    return true;
  }
  walk(g, r, (x, y) => x === r.hole[0] && y === r.hole[1], dtMs, kit);
  return true;
}
