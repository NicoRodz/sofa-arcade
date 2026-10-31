// Chef movement: R1 velocity, R4 soft collisions between chefs, R5 dash pushes, walls. No stations here.
import { RADIUS, SPEED, TICK_MS, isSolid, type Controls, type Game, type Player } from './state';
import { magnetHug } from '../feel/magnet';
import { beltPush, iceTau, iceTurnLimit } from '../surfaces/physics';
import { mechCanMove, mechFriction, mechNoCollide } from '../mech/loop';

// R1: one integrator for the chef's velocity, v += (target - v) * (1 - e^(-dt/tau)). tau = 0 is "instant" (the old feel).
function steer(p: Player, c: Controls, g: Game, dtMs: number) {
  const { tauMs, tauStopMs } = g.params.tune;
  const moving = c.x !== 0 || c.y !== 0;
  const base = p.assist ? 0 : moving ? tauMs : tauStopMs; // Ayudante: no inertia
  const braking = !moving || c.x * p.vx + c.y * p.vy < 0; // on ice: no stick, or against the slide
  let tau = g.surf ? iceTau(g, p, base, braking) : base; // ice: a long tau both ways (the stick only steers the slide)
  if (g.mech) tau = mechFriction(g, p.x, p.y, tau); // oil: the same on a patch
  const k = tau > 0 ? 1 - Math.exp(-dtMs / tau) : 1;
  const ovx = p.vx,
    ovy = p.vy;
  p.vx += (c.x * SPEED - p.vx) * k;
  p.vy += (c.y * SPEED - p.vy) * k;
  if (g.surf) iceTurnLimit(g, p, ovx, ovy, dtMs);
  if (!moving && Math.hypot(p.vx, p.vy) < 0.02) {
    p.vx = 0;
    p.vy = 0;
  } // the tail of the exponential is a stop
}

export const KNOCK_FADE_MS = 90; // R5: the push a dash gives fades with this time constant
export const idleControls: Controls = { x: 0, y: 0, a: 0, b: false };
export const unit = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

// R5: a dash that touches another chef gives it a short push; it never makes it drop what it carries.
function pushNeighbours(g: Game, p: Player) {
  for (const o of g.players.values()) {
    if (o.id === p.id || o.ghost || p.dashHit.includes(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > 2 * RADIUS + 0.1) continue;
    p.dashHit.push(o.id);
    if (!o.cutting) {
      o.kx += p.dashDx * g.params.tune.pushSpeed;
      o.ky += p.dashDy * g.params.tune.pushSpeed;
    }
    g.bus.emit('bump', { player: p.id, other: o.id });
  }
}

// Moves a chef along (ux, uy) up to `amt`, axis by axis so a wall only stops the component that hits it. Returns the distance gained.
function moveAway(g: Game, p: Player, ux: number, uy: number, amt: number): number {
  const ox = p.x,
    oy = p.y;
  if (!blocked(g, p.x + ux * amt, p.y)) p.x += ux * amt;
  if (!blocked(g, p.x, p.y + uy * amt)) p.y += uy * amt;
  return (p.x - ox) * ux + (p.y - oy) * uy;
}
// Is chef `a` (with stick c) pushing towards chef `b`?
const pushing = (a: Player, b: Player, c: Controls) => {
  const m = Math.hypot(c.x, c.y);
  if (m < 0.2) return false;
  const [ux, uy] = unit(b.x - a.x, b.y - a.y);
  return (c.x * ux + c.y * uy) / m > 0.3;
};

// R4 soft collision: chefs are circles of RADIUS. Overlapping chefs are pushed apart (one who is cutting does not give way).
// If two push against each other, or one pushes one who cannot give way, for yieldAfterMs, the pair crosses through each
// other at yieldSpeed until they are clear: with 8 chefs in a one-tile corridor nobody stays stuck.
export function separate(g: Game, controls: Map<number, Controls>, dtMs: number) {
  const list = [...g.players.values()].filter((p) => !p.ghost); // a ghost has no body
  for (const p of g.players.values()) p.crossing = false;
  const { yieldAfterMs } = g.params.tune;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!,
        b = list[j]!;
      if (g.mech && mechNoCollide(g, a, b)) continue; // the helper of the heavy tray goes through its carrier
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      let st = g.crowd.get(key);
      const dx = a.x - b.x,
        dy = a.y - b.y,
        d = Math.hypot(dx, dy),
        min = 2 * RADIUS;
      const ca = controls.get(a.id) ?? idleControls,
        cb = controls.get(b.id) ?? idleControls;
      if (st?.ghost) {
        const still = Math.hypot(ca.x, ca.y) < 0.2 && Math.hypot(cb.x, cb.y) < 0.2;
        if (d >= min + 0.05 || (still && d < min))
          g.crowd.delete(key); // clear, or both stopped halfway: solid again, they get pushed apart
        else {
          a.crossing = true;
          b.crossing = true;
          continue;
        }
        st = undefined;
      }
      if (d >= min) {
        if (st) {
          st.ms = Math.max(0, st.ms - dtMs);
          if (st.ms === 0) g.crowd.delete(key);
        }
        continue;
      }
      const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [a.id < b.id ? 1 : -1, 0]; // from b towards a
      const overlap = min - d;
      const wa = a.cutting ? 0 : b.cutting ? 1 : 0.5;
      let moved = 0;
      if (wa > 0) moved += moveAway(g, a, ux, uy, overlap * wa);
      if (wa < 1) moved += moveAway(g, b, -ux, -uy, overlap * (1 - wa) + (overlap * wa - moved));
      if (wa > 0 && wa < 1 && overlap - moved > 1e-3) moved += moveAway(g, a, ux, uy, overlap - moved);
      const stuck = overlap - moved > 1e-3 || wa === 0 || wa === 1; // nobody gave way: a wall, or a chef who is cutting
      const pa = pushing(a, b, ca),
        pb = pushing(b, a, cb);
      if ((pa && pb) || (stuck && (pa || pb))) {
        st ??= { ms: 0, ghost: false };
        st.ms += dtMs;
        if (st.ms >= yieldAfterMs) {
          st.ghost = true;
          a.crossing = true;
          b.crossing = true;
        }
        g.crowd.set(key, st);
      } else if (st) {
        st.ms = Math.max(0, st.ms - dtMs);
        if (st.ms === 0) g.crowd.delete(key);
      }
    }
}

export const blocked = (g: Game, x: number, y: number) => {
  for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++)
    for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) if (isSolid(g, tx, ty)) return true;
  return false;
};

// The chef is not working: the stick turns it, the dash or R1's integrator sets the velocity, and it moves axis by axis (a wall stops that component).
export function walk(g: Game, p: Player, c: Controls, dt: number, dtMs: number) {
  if (c.x || c.y) {
    p.fx = c.x;
    p.fy = c.y;
  }
  if (p.dashMs > 0) {
    const v = SPEED * g.params.tune.dashMult;
    p.vx = p.dashDx * v;
    p.vy = p.dashDy * v;
    p.dashMs = Math.max(0, p.dashMs - dtMs);
    if (p.dashMs <= 0 && !(g.magnet && (p.dashMs = magnetHug(g, p, v, TICK_MS)) > 0)) {
      p.vx = p.dashDx * SPEED;
      p.vy = p.dashDy * SPEED;
    } // back to walking pace; R1 takes it from there (magnetism: a station right ahead keeps the dash going until it touches it)
  } else steer(p, c, g, dtMs);
  const slow = p.crossing ? g.params.tune.yieldSpeed : 1;
  const bp = g.surf ? beltPush(g, p) : null; // a belt carries the chef at its own speed, on top of what the chef does
  const nx = p.x + (p.vx + p.kx) * dt * slow + (bp ? bp[0] * dt : 0);
  if (!blocked(g, nx, p.y) && (!g.mech || mechCanMove(g, p, p.x, p.y, nx, p.y))) p.x = nx;
  else {
    p.vx = 0;
    p.kx = 0;
  }
  const ny = p.y + (p.vy + p.ky) * dt * slow + (bp ? bp[1] * dt : 0);
  if (!blocked(g, p.x, ny) && (!g.mech || mechCanMove(g, p, p.x, p.y, p.x, ny))) p.y = ny;
  else {
    p.vy = 0;
    p.ky = 0;
  }
  const fade = Math.exp(-dtMs / KNOCK_FADE_MS);
  p.kx = Math.abs(p.kx) < 0.02 ? 0 : p.kx * fade;
  p.ky = Math.abs(p.ky) < 0.02 ? 0 : p.ky * fade;
  if (p.dashMs > 0) pushNeighbours(g, p);
}
