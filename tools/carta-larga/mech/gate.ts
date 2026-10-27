// Bot job of 'gate', implemented by T1b: the porter. A chef that walks into a closed D waits at the door and calls; the lowest-id chef that is not waiting (else the lowest waiting one) goes and stands on a Z
// until nobody is near the door any more (90 ticks after the last call). It wraps the controls of the golden chefs: `gateAssist` rewrites them each tick (design section 8: pairJob, 600-tick expiry).
import { DIRS, isFloor } from '@pichi/game-pizzas/sim/maps';
import type { Controls, Game, Player } from '@pichi/game-pizzas/sim/overcooked';
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';
import { gateMap, isDoor, tileOf } from '@pichi/game-pizzas/sim/mech/gate/state';

export const gateBot: MechBot = { wants: (g) => !!g.mech?.gate && !g.mech.gate.open && !gateMap(g).timer };

export interface GateBotState {
  hold: number; // tick until which the porter stays on the plate
  waitTicks: number; // ticks chefs spent waiting at a closed door (pairWaitTicks of the report)
}
export const newGateBot = (): GateBotState => ({ hold: -1, waitTicks: 0 });
const HOLD = 90;
const idle: Controls = { x: 0, y: 0, a: 0, b: false };

/** Is the chef (not in a doorway) about to walk into a closed door? */
function facesDoor(g: Game, p: Player, c: Controls | undefined): boolean {
  if (!c || Math.hypot(c.x, c.y) < 0.3) return false;
  const cx = Math.floor(p.x),
    cy = Math.floor(p.y);
  if (isDoor(g, cx, cy)) return false;
  const dx = Math.abs(c.x) >= Math.abs(c.y) ? Math.sign(c.x) : 0;
  const dy = dx === 0 ? Math.sign(c.y) : 0;
  return isDoor(g, cx + dx, cy + dy);
}
const nearDoor = (g: Game, doors: readonly number[], p: Player) =>
  doors.some((d) => Math.max(Math.abs((d % 16) - Math.floor(p.x)), Math.abs(Math.floor(d / 16) - Math.floor(p.y))) <= 1);

/** First step of the way to the nearest plate, doors treated as walls unless open. */
function towardsPlate(g: Game, p: Player, plates: readonly number[]): [number, number] | null {
  const sx = Math.floor(p.x),
    sy = Math.floor(p.y);
  const prev = new Map<number, number>([[sy * 16 + sx, -1]]);
  const q = [sy * 16 + sx];
  for (let i = 0; i < q.length; i++) {
    const k = q[i]!;
    if (plates.includes(k)) {
      let c = k;
      while (prev.get(c) !== sy * 16 + sx && prev.get(c) !== -1) c = prev.get(c)!;
      return c === sy * 16 + sx ? null : [(c % 16) + 0.5, Math.floor(c / 16) + 0.5];
    }
    for (const [dx, dy] of DIRS) {
      const nx = (k % 16) + dx,
        ny = Math.floor(k / 16) + dy,
        nk = ny * 16 + nx;
      if (!isFloor(g.grid, nx, ny) || prev.has(nk) || (isDoor(g, nx, ny) && !g.mech!.gate!.open)) continue;
      prev.set(nk, k);
      q.push(nk);
    }
  }
  return null;
}

/** Rewrites the chefs' controls for this tick (`base` is what the golden chefs wanted). */
export function gateAssist(g: Game, base: Map<number, Controls>, st: GateBotState, t: number) {
  const m = g.mech?.gate && gateMap(g);
  if (!m) return;
  const chefs = [...g.players.values()].filter((p) => !p.ghost).sort((a, b) => a.id - b.id);
  const callers = chefs.filter((p) => !g.mech!.gate!.open && facesDoor(g, p, base.get(p.id)));
  for (const p of callers) base.set(p.id, idle); // wait at the door
  st.waitTicks += callers.length;
  if (m.timer) return; // the clock opens it: waiting is all there is to do
  if (callers.length) st.hold = t + HOLD;
  else if (g.mech!.gate!.open && chefs.some((p) => nearDoor(g, m.doors, p))) st.hold = Math.max(st.hold, t + 30); // somebody is still going through
  if (t >= st.hold) return;
  const porter = chefs.find((p) => !callers.includes(p)) ?? chefs[0];
  if (!porter) return;
  if (m.plates.includes(tileOf(porter))) {
    base.set(porter.id, idle);
    return;
  }
  const next = towardsPlate(g, porter, m.plates);
  if (next) {
    const dx = next[0] - porter.x,
      dy = next[1] - porter.y,
      l = Math.hypot(dx, dy) || 1;
    base.set(porter.id, { x: dx / l, y: dy / l, a: 0, b: false });
  }
}
