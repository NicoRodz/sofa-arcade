// The hook loop (design section 7). Every function here is called only behind `if (g.mech)`: a round with every flag off never gets in, so it is the round of before.
// Modules run in registry order; a hook that returns a value is chained (friction), or-ed (claimsB, onInteract), and-ed (canEnter), or multiplied (ovenRate).
import type { Controls, Game, Player, Station } from '../round/state';
import { MECH_MODULES } from './registry';
import type { FirePhase, MechModule } from './types';

function* active(g: Game): Generator<MechModule> {
  const f = g.flags!.mech;
  for (const m of MECH_MODULES) if (f[m.id]) yield m;
}

export function mechStart(g: Game) {
  for (const m of active(g)) m.onLoad(g);
  for (const m of active(g)) m.init(g);
}
export function mechBeforeMove(g: Game, controls: ReadonlyMap<number, Controls>, dtMs: number) {
  for (const m of active(g)) m.beforeMove(g, controls, dtMs);
}
/** Can the chef's body go from (x, y) to (nx, ny)? Only a change of tile asks the modules. */
export function mechCanMove(g: Game, p: Player, x: number, y: number, nx: number, ny: number): boolean {
  const tx = Math.floor(nx),
    ty = Math.floor(ny);
  if (tx === Math.floor(x) && ty === Math.floor(y)) return true;
  const dir = [Math.sign(tx - Math.floor(x)), Math.sign(ty - Math.floor(y))] as const;
  let ok = true;
  for (const m of active(g)) ok = m.canEnter(g, tx, ty, dir, p) && ok; // every module sees the move, one `false` is enough to refuse it
  return ok;
}
export function mechFriction(g: Game, x: number, y: number, tauMs: number): number {
  const tx = Math.floor(x),
    ty = Math.floor(y);
  let tau = tauMs;
  for (const m of active(g)) tau = m.friction(g, tx, ty, tau);
  return tau;
}
export function mechClaimsB(g: Game, p: Player, target: Station | null): boolean {
  let claimed = false;
  for (const m of active(g)) claimed = m.claimsB(g, p, target) || claimed;
  return claimed;
}
export function mechInteract(g: Game, p: Player, c: Controls, target: Station | null, dtMs: number): boolean {
  let used = false;
  for (const m of active(g)) used = m.onInteract(g, p, c, target, dtMs) || used;
  return used;
}
/** The controls a chef's step sees: every module may rewrite them in turn (heavy tray). */
export function mechControls(g: Game, p: Player, c: Controls): Controls {
  let out = c;
  for (const m of active(g)) out = m.controls(g, p, out);
  return out;
}
/** Do these two chefs pass through each other (the coupled pair of the heavy tray)? */
export function mechNoCollide(g: Game, a: Player, b: Player): boolean {
  let no = false;
  for (const m of active(g)) no = m.noCollide(g, a, b) || no;
  return no;
}
export function mechOvenRate(g: Game, s: Station): number {
  let rate = 1000;
  for (const m of active(g)) rate = Math.trunc((rate * m.ovenRate(g, s)) / 1000);
  return rate;
}
export function mechOnFire(g: Game, s: Station, phase: FirePhase) {
  for (const m of active(g)) m.onFire(g, s, phase);
}

/** After the chefs moved: stations, tiles, the v2 mutation, and the fingerprint (the last hook of the tick). */
export function mechAfterChefs(g: Game, dtMs: number) {
  for (const m of active(g)) m.tickStations(g, dtMs);
  for (const m of active(g)) m.tickTiles(g, dtMs);
  for (const m of active(g)) m.mutation(g);
}
/** FNV-1a over the integers every active module contributes (and the number of the module, so two modules cannot swap values unseen). */
export function mechHash(g: Game): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0;
  };
  for (const m of active(g)) {
    mix(MECH_MODULES.indexOf(m) + 1);
    for (const v of m.hashExtra(g)) mix(v);
  }
  return h;
}
export function mechHashTick(g: Game) {
  g.mech!.hash = mechHash(g);
}
