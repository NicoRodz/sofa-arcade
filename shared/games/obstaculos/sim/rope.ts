// Rope of plan §4: unilateral PBD links (they only pull, never push) between consecutive players of a cordada.
// Pure: it moves the bodies it is given and returns events; the world decides who is a node and how heavy it is.
import { DT, INV_MASS, PLAYER_H, PLAYER_W, ROPE_CORDADA_MAX, ROPE_ITERATIONS, ROPE_LEN, ROPE_MAX_CORRECTION, ROPE_RELINK_SEC, ROPE_VALVE_RATIO, ROPE_VALVE_SEC } from '../constants';
import { pushBody } from './collide';
import type { Body } from './player';
import type { TileGrid } from './tiles';

export interface RopeLink {
  a: number; // slot
  b: number; // slot
  base: number; // rest length of a settled link: ROPE_LEN (quick match) or the campaign's longer rope
  len: number; // current rest length: `base`, or longer while a new link eases back (relink)
  shrink: number; // px per step that len loses while it is above `base` (so it takes ROPE_RELINK_SEC from the start)
  active: boolean; // both ends are in play
  valve: number; // steps beyond the valve ratio
  taut: boolean;
  tension: number; // d / base before the correction of the last step
  strainCool: number;
  elastic: boolean; // campaign dynamic 11: one end hangs from an elastic ring (set by the world every step, see sim/bungee.ts)
  boing: number; // steps until another stretch event may ring
}
export interface Rope { id: number; members: number[]; links: RopeLink[] }

// Cordada sizes (plan §4): n <= 4 one rope; 5 = 3+2, 6 = 3+3, 7 = 4+3, 8 = 4+4. `max` (cordadaMax) forces smaller groups.
export function cordadaSizes(n: number, max: number = ROPE_CORDADA_MAX): number[] {
  if (n <= 0) return [];
  const m = Math.max(1, Math.min(max, ROPE_CORDADA_MAX));
  const groups = Math.ceil(n / m);
  const base = Math.floor(n / groups), extra = n % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

const keyOf = (a: number, b: number) => `${a}-${b}`;

// Ropes for the connected slots in slot order. Links that already existed keep their state; a new link (someone connected or
// left and the neighbours hooked up) starts at the current distance and eases down to ROPE_LEN in ROPE_RELINK_SEC.
export function buildRopes(slots: readonly number[], max: number | undefined, prev: readonly Rope[] = [], dist: (a: number, b: number) => number = () => baseLen, baseLen: number = ROPE_LEN): Rope[] {
  const old = new Map<string, RopeLink>();
  for (const r of prev) for (const l of r.links) old.set(keyOf(l.a, l.b), l);
  const sorted = [...slots].sort((x, y) => x - y);
  const ropes: Rope[] = [];
  let at = 0;
  for (const size of cordadaSizes(sorted.length, max ?? ROPE_CORDADA_MAX)) {
    const members = sorted.slice(at, at + size);
    at += size;
    const links: RopeLink[] = [];
    for (let i = 0; i + 1 < members.length; i++) {
      const a = members[i]!, b = members[i + 1]!;
      const len = prev.length ? Math.max(baseLen, dist(a, b)) : baseLen;
      links.push(old.get(keyOf(a, b)) ?? { a, b, base: baseLen, len, shrink: ((len - baseLen) * DT) / ROPE_RELINK_SEC, active: true, valve: 0, taut: false, tension: 0, strainCool: 0, elastic: false, boing: 0 });
    }
    ropes.push({ id: ropes.length, members, links });
  }
  return ropes;
}

export interface RopeNode { body: Body; w: number; active: boolean } // w = inverse mass (INV_MASS)
export type RopeEvent =
  | { kind: 'taut'; rope: number; link: number; tension: number }
  | { kind: 'strain'; rope: number; link: number; tension: number }
  | { kind: 'valve'; rope: number; link: number; behind: number } // slot that must go to a bubble
  | { kind: 'bounce'; rope: number; link: number; stretch: number }; // an elastic link stretched past BOUNCE_AT x its length (campaign dynamic 11)

// Campaign dynamic 11 (sim/bungee.ts): a link with `elastic` set is a spring between its rest length and `max` x it (a hard stop beyond). The valve (1.6 x for 1 s) still applies:
// with max = 1.6 the spring's own speed keeps a body short of it (a 4-tile fall peaks at ~1.47 x); a designer who raises max above 1.6 must raise the valve too.
export interface ElasticParams { max: number; stiffness: number; damping: number }
export const BOUNCE_AT = 1.25; // stretch (d / len) that rings the bounce
const BOUNCE_COOLDOWN = 40; // steps

export const TAUT_AT = 0.98; // d / len from which a link counts as taut
export const STRAIN_AT = 1.25; // pre-correction d / ROPE_LEN that rings ropeStrain
const STRAIN_COOLDOWN = 20; // steps
const cx = (b: Body) => b.x + PLAYER_W / 2;
const cy = (b: Body) => b.y + PLAYER_H / 2;

export const invMassOf = (st: 'ground' | 'air' | 'planted' | 'anchored'): number => INV_MASS[st];

// One step of rope. Order (plan §4): 4 PBD iterations, each correction applied with collision and capped, then the velocity that
// separates the ends is removed. `behind(a, b)` returns the slot of the pair that is farther from the goal (valve target).
export function solveRopes(ropes: readonly Rope[], nodes: readonly (RopeNode | undefined)[], g: TileGrid, behind: (a: number, b: number) => number, el?: ElasticParams): RopeEvent[] {
  const hardOf = (l: RopeLink): number => (el && l.elastic ? l.len * el.max : l.len); // where the link stops pulling the ends together
  const events: RopeEvent[] = [];
  for (const rope of ropes) {
    rope.links.forEach((l, li) => {
      const A = nodes[l.a], B = nodes[l.b];
      const was = l.active;
      l.active = !!A && !!B && A.active && B.active;
      if (!l.active) { l.valve = 0; l.taut = false; l.tension = 0; return; }
      if (!was) { // an end came back from a bubble or a respawn: hook up again from wherever it is, easing to ROPE_LEN
        const far = Math.hypot(cx(B!.body) - cx(A!.body), cy(B!.body) - cy(A!.body));
        l.len = Math.max(l.base, far);
        l.shrink = ((l.len - l.base) * DT) / ROPE_RELINK_SEC;
      }
      if (l.len > l.base) l.len = Math.max(l.base, l.len - l.shrink);
      const d = Math.hypot(cx(B!.body) - cx(A!.body), cy(B!.body) - cy(A!.body));
      l.tension = d / l.base;
      const t = d / l.len;
      if (t >= TAUT_AT && !l.taut) { l.taut = true; events.push({ kind: 'taut', rope: rope.id, link: li, tension: l.tension }); }
      else if (t < TAUT_AT - 0.08) l.taut = false;
      if (l.strainCool > 0) l.strainCool--;
      if (el && l.elastic) { // a spring, not a rope: no strain cue, a stretch cue instead
        if (l.boing > 0) l.boing--;
        if (d / l.len >= BOUNCE_AT && l.boing === 0) { l.boing = BOUNCE_COOLDOWN; events.push({ kind: 'bounce', rope: rope.id, link: li, stretch: d / l.len }); }
      } else if (l.tension >= STRAIN_AT && l.strainCool === 0) { l.strainCool = STRAIN_COOLDOWN; events.push({ kind: 'strain', rope: rope.id, link: li, tension: l.tension }); }
    });
  }
  if (el) { // the spring: between the rest length and the hard stop, speed towards the other end grows with the stretch; part of the speed along the link bleeds off
    for (const rope of ropes) for (const l of rope.links) {
      if (!l.active || !l.elastic) continue;
      const A = nodes[l.a]!, B = nodes[l.b]!, ws = A.w + B.w;
      const dx = cx(B.body) - cx(A.body), dy = cy(B.body) - cy(A.body), d = Math.hypot(dx, dy);
      if (ws === 0 || d <= l.len) continue;
      const nx = dx / d, ny = dy / d, x = Math.min(d - l.len, l.len * (el.max - 1));
      const vrel = (B.body.vx - A.body.vx) * nx + (B.body.vy - A.body.vy) * ny; // > 0: separating
      const dv = el.stiffness * x * DT + vrel * el.damping * DT; // pull together, and brake the relative motion
      A.body.vx += nx * dv * (A.w / ws); A.body.vy += ny * dv * (A.w / ws);
      B.body.vx -= nx * dv * (B.w / ws); B.body.vy -= ny * dv * (B.w / ws);
    }
  }
  for (let it = 0; it < ROPE_ITERATIONS; it++) {
    for (const rope of ropes) for (const l of rope.links) {
      if (!l.active) continue;
      const A = nodes[l.a]!, B = nodes[l.b]!;
      const dx = cx(B.body) - cx(A.body), dy = cy(B.body) - cy(A.body);
      const d = Math.hypot(dx, dy);
      const hard = hardOf(l);
      if (d <= hard + 1e-6) continue;
      const ws = A.w + B.w;
      if (ws === 0) continue;
      const c = Math.min(d - hard, ROPE_MAX_CORRECTION);
      const nx = dx / d, ny = dy / d;
      pushBody(A.body, nx * c * (A.w / ws), ny * c * (A.w / ws), g);
      pushBody(B.body, -nx * c * (B.w / ws), -ny * c * (B.w / ws), g);
    }
  }
  for (const rope of ropes) {
    rope.links.forEach((l, li) => {
      if (!l.active) return;
      const A = nodes[l.a]!, B = nodes[l.b]!;
      const dx = cx(B.body) - cx(A.body), dy = cy(B.body) - cy(A.body);
      const d = Math.hypot(dx, dy);
      if (d >= ROPE_VALVE_RATIO * l.base) { if (++l.valve >= ROPE_VALVE_SEC / DT) { l.valve = 0; events.push({ kind: 'valve', rope: rope.id, link: li, behind: behind(l.a, l.b) }); } }
      else l.valve = 0;
      const ws = A.w + B.w;
      if (ws === 0 || d < hardOf(l) - 0.5 || d === 0) return; // slack link (an elastic one: short of its hard stop): nothing to remove
      const nx = dx / d, ny = dy / d;
      const vrel = (B.body.vx - A.body.vx) * nx + (B.body.vy - A.body.vy) * ny; // > 0: the ends separate
      if (vrel <= 0) return;
      A.body.vx += nx * vrel * (A.w / ws); A.body.vy += ny * vrel * (A.w / ws);
      B.body.vx -= nx * vrel * (B.w / ws); B.body.vy -= ny * vrel * (B.w / ws);
    });
  }
  return events;
}

// Is `slot` hanging on a taut rope with its neighbour above it? (rope jump, plan §4)
export function hangingOnRope(ropes: readonly Rope[], slot: number, bodies: readonly (Body | undefined)[]): boolean {
  const me = bodies[slot];
  if (!me) return false;
  for (const rope of ropes) for (const l of rope.links) {
    if (!l.active || !l.taut) continue;
    const other = l.a === slot ? l.b : l.b === slot ? l.a : -1;
    if (other < 0) continue;
    const o = bodies[other];
    if (o && cy(o) < cy(me) - 8) return true;
  }
  return false;
}

export function hashRopes(ropes: readonly Rope[], mix: (v: number) => void): void {
  for (const r of ropes) for (const l of r.links) { mix(l.a); mix(l.b); mix(l.len); mix(l.active ? 1 : 0); mix(l.valve); mix(l.taut ? 1 : 0); mix(l.strainCool); }
}
