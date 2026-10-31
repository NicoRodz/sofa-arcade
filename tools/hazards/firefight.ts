// Firefighting layer for the scripted coop chefs of test/golden/bot.ts (measurement tool: nothing in the game imports it).
// The nearest chef runs to the fire after a reaction delay; on a BIG fire the second nearest comes too after a "call for help" delay (it needs two chefs holding B at once).
import { targetStation, type Controls, type Game, type Player, type Station } from '@pichi/game-pizzas/sim/overcooked';
import { route, decide, type Mem } from '@pichi/game-pizzas/test/golden/bot';

export const REACT_MS = 700; // the nearest chef notices the flames
export const HELP_MS = 1500; // the second chef hears "help" and comes
export interface FightState {
  since: Map<number, number>; // station index -> time its fire was first seen
}
export const newFight = (): FightState => ({ since: new Map() });

const dist = (p: Player, s: Station) => Math.hypot(p.x - (s.tx + 0.5), p.y - (s.ty + 0.5));

/** Who goes where this tick: chef id -> station to put out. */
export function assignFire(g: Game, st: FightState, helpMs = HELP_MS): Map<number, Station> {
  const out = new Map<number, Station>();
  const burning = g.stations.map((s, i) => [s, i] as const).filter(([s]) => s.fire !== undefined);
  for (const k of [...st.since.keys()]) if (g.stations[k]!.fire === undefined) st.since.delete(k);
  if (!burning.length) return out;
  for (const [, i] of burning) if (!st.since.has(i)) st.since.set(i, g.time);
  const prim = burning.find(([s]) => s.kind === 'pot') ?? burning[0]!;
  const seen = st.since.get(prim[1])!;
  const chefs = [...g.players.values()].filter((p) => !p.ghost).sort((a, b) => dist(a, prim[0]) - dist(b, prim[0]));
  const big = !!g.burn?.fires.some((f) => f?.big);
  if (chefs[0] && g.time - seen >= REACT_MS) out.set(chefs[0].id, prim[0]);
  if (big && chefs[1] && g.time - seen >= REACT_MS + helpMs) out.set(chefs[1].id, prim[0]);
  return out;
}

/** The chef's controls: put out its assigned fire, else the normal golden recipe. */
export function chefControls(g: Game, p: Player, rank: number, m: Mem, t: number, fight: Station | undefined): Controls {
  if (!fight) return decide(g, p, rank, m, t);
  m.since = g.time; // not "stuck": it is busy
  const { arrived, next } = route(g, p, fight);
  if (!arrived) {
    if (!next) return { x: 0, y: 0, a: 0, b: false };
    const dx = next[0] + 0.5 - p.x, dy = next[1] + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, a: 0, b: false };
  }
  const fx = fight.tx + 0.5 - p.x, fy = fight.ty + 0.5 - p.y, l = Math.hypot(fx, fy) || 1;
  return { x: fx / l, y: fy / l, a: 0, b: targetStation(g, p) === fight };
}
