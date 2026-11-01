import { RADIUS, SPEED, type Controls, type Game, type Item, type Player } from './state';
import { SLIP, SLIP_DASH_EXTRA, SLIP_MIN_SPEED, SLIP_PUSH, SLIP_TRIGGER, type FloorItem } from '../rules/sabotage-config';
import { KNOCK_FADE_MS, blocked, unit } from './movement';
import { stopKind } from './chop';
import { RAW_OF } from '../recipes/defs';
import { addFloorItem, removeFloorItem } from '../rules/floor';
import { sabotageAimPress } from '../rules/sabotage';
import { surfaceAt } from '../surfaces/physics';

// --- Hazards (sabotage S1): rubbish on the floor makes a chef slip --------------------------------------------------------------------
// The chef's centre enters a rubbish tile (within SLIP_TRIGGER of its centre) and it is not immune: it slides `dist` tiles along its
// velocity (or its facing when it is nearly still) with a constant deceleration, ignores the stick and the buttons, then gets up. What it
// carried falls on the tile it started from, where any chef of its team picks it up. It is immune from the start of the slide until
// `immuneMs` after getting up, and the rubbish stays where it was: it does not chain, it does not punish in a loop.
const onTile = (p: Player): [number, number] => [Math.floor(p.x), Math.floor(p.y)];

function startSlip(g: Game, p: Player) {
  const sp = SLIP[g.difficulty];
  const vx = p.vx + p.kx,
    vy = p.vy + p.ky;
  const fast = Math.hypot(vx, vy) >= SLIP_MIN_SPEED * SPEED;
  const [dx, dy] = fast ? unit(vx, vy) : unit(p.fx, p.fy);
  const iceMul = g.hz && g.surf && surfaceAt(g, p.x, p.y)?.kind === 'ice' ? 1.5 : 1; // HAZARD_V2: a slip on ice goes a half farther
  const dist = (sp.dist + (p.dashMs > 0 ? SLIP_DASH_EXTRA : 0)) * iceMul;
  const [tx, ty] = onTile(p);
  if (p.cutting) g.bus.emit(stopKind(g, p), { player: p.id, station: p.chopAt });
  let dropped: Item | null = null;
  if (g.slipDrops && p.item && p.item !== 'trashBag') {
    dropped = p.item;
    const spoil = g.spoilRaw && RAW_OF.includes(p.item);
    addFloorItem(g, { tx, ty, item: spoil ? 'trash' : p.item, kind: 'dropped', team: p.team });
    p.item = null;
  }
  p.slip = { t0: g.time, dir: [dx, dy], dist, slideMs: sp.slideMs, recoverMs: sp.recoverMs, stopped: false, hit: [] };
  p.immuneUntil = g.time + sp.slideMs + sp.recoverMs + sp.immuneMs;
  Object.assign(p, { cutting: false, chopAt: -1, vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0, buffA: 0, buffAge: 0 });
  if (p.dousing) p.dousing = false;
  g.bus.emit('chef:slip', { chef: p.id, team: p.team, at: [tx, ty], dir: [dx, dy], dist, dropped });
}

// One tick of a chef that is sliding. Position along the slide is dist * (2s - s^2), s = time / slideMs: constant deceleration, v0 = 2 dist / slideMs.
export function slipStep(g: Game, p: Player, c: Controls, dtMs: number) {
  const sl = p.slip!;
  const tune = g.params.tune;
  p.dashCd = Math.max(0, p.dashCd - dtMs);
  const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
  p.bHeld = c.b;
  p.buffA = 0; // the stick and A are ignored; B does not dash now, but it is remembered like any early press (R6) and goes off when the chef is up
  if (bEdge) p.buffB = tune.bufferMs;
  else p.buffB = Math.max(0, p.buffB - dtMs);
  const f = (s: number) => 2 * s - s * s;
  const s0 = Math.min(1, Math.max(0, (g.time - dtMs - sl.t0) / sl.slideMs)),
    s1 = Math.min(1, Math.max(0, (g.time - sl.t0) / sl.slideMs));
  const step = sl.dist * (f(s1) - f(s0));
  if (step > 0 && !sl.stopped) {
    const ox = p.x,
      oy = p.y;
    if (!blocked(g, p.x + sl.dir[0] * step, p.y)) p.x += sl.dir[0] * step;
    if (!blocked(g, p.x, p.y + sl.dir[1] * step)) p.y += sl.dir[1] * step;
    if (p.x === ox && p.y === oy) {
      sl.stopped = true;
    } // a wall or a station: it stops dead (no extra damage)
    const v = ((2 * sl.dist) / (sl.slideMs / 1000)) * (1 - s1);
    for (const o of g.players.values()) {
      // a chef in the way gets half the slider's speed, once, and never slips from it
      if (o.id === p.id || o.ghost || o.cutting || sl.hit.includes(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > 2 * RADIUS + 0.1) continue;
      sl.hit.push(o.id);
      o.kx += sl.dir[0] * v * SLIP_PUSH;
      o.ky += sl.dir[1] * v * SLIP_PUSH;
      g.bus.emit('bump', { player: p.id, other: o.id });
    }
  }
  const fade = Math.exp(-dtMs / KNOCK_FADE_MS);
  p.kx = Math.abs(p.kx) < 0.02 ? 0 : p.kx * fade;
  p.ky = Math.abs(p.ky) < 0.02 ? 0 : p.ky * fade;
  if (g.time - sl.t0 >= sl.slideMs + sl.recoverMs - 1e-6) {
    p.slip = null;
    p.vx = 0;
    p.vy = 0;
    g.bus.emit('chef:recover', { chef: p.id, team: p.team, wall: sl.stopped });
  }
}

// The chef that loaded the catapult stands there (anchored: no walking, no dash) until it throws with B; A does nothing.
export function aimStep(g: Game, p: Player, c: Controls, dtMs: number) {
  p.dashCd = Math.max(0, p.dashCd - dtMs);
  const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
  p.bHeld = c.b;
  Object.assign(p, { vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0, buffA: 0, buffB: 0 });
  if (bEdge) sabotageAimPress(g, p);
}

// End of the tick (hazards only): rubbish that ran out disappears, and a chef that ENTERED a rubbish tile slips.
export function hazardsTick(g: Game) {
  for (const f of [...g.floor])
    if (g.time >= f.expiresAt) {
      removeFloorItem(g, f.id);
      if (f.kind === 'trash') g.bus.emit('trash:decayed', { team: f.team, tile: [f.tx, f.ty] });
    }
  for (const p of g.players.values()) {
    if (p.ghost || p.slip || p.assist) continue; // Ayudante: the banana-skin never makes it slip
    const now = g.floor.filter((f) => f.kind === 'trash' && Math.hypot(p.x - (f.tx + 0.5), p.y - (f.ty + 0.5)) <= SLIP_TRIGGER);
    const before = p.inTrash ?? [];
    const entered = now.filter((f) => !before.includes(f.id));
    p.inTrash = now.map((f) => f.id);
    if (entered.length && g.time >= (p.immuneUntil ?? 0)) startSlip(g, p);
  }
}

// What A would pick up off the floor: the nearest item within reach, and in front of the chef unless it is under its feet; a dropped item
// before rubbish on the same tile (ids break ties). Null with full hands.
export function floorItemNear(g: Game, p: Player): FloorItem | null {
  if (p.item || !g.floor.length) return null;
  const len = Math.hypot(p.fx, p.fy) || 1;
  let best: FloorItem | null = null,
    bestKey = Infinity;
  for (const f of g.floor) {
    if (f.team !== p.team) continue;
    const dx = f.tx + 0.5 - p.x,
      dy = f.ty + 0.5 - p.y,
      d = Math.hypot(dx, dy);
    if (d > 1.1 || (d > 0.6 && (dx * p.fx + dy * p.fy) / (len * d) < 0.5)) continue;
    const key = d * 1000 + (f.kind === 'dropped' ? 0 : 1) * 10 + f.id * 1e-6;
    if (key < bestKey) {
      best = f;
      bestKey = key;
    }
  }
  return best;
}
// A: pick up what lies on the floor near the chef (rubbish or a dropped item), when its hands are empty and no station is in front of it.
export function pickFloor(g: Game, p: Player): boolean {
  const best = floorItemNear(g, p);
  if (!best) return false;
  removeFloorItem(g, best.id);
  p.item = best.item;
  g.bus.emit('trash:picked', { player: p.id, team: p.team, tile: [best.tx, best.ty], item: best.item, kind: best.kind });
  return true;
}
