// The oven that burns, the fire and the extinguishing (council: "Horno que quema + fuego + extintor"). Pure and deterministic: no clock, no I/O,
// no RNG (nothing here draws from any stream, so the orders keep their sequence). The sim calls these hooks only when `g.burn` exists, i.e. a
// round whose config switched it on (the lobby does; the golden rounds and the old tests do not), and none of it changes the events of a round without it.
//
// The flow of a pizza: baked -> `graceMs` of grace (8 s on Normal and Hard, 15 s on Easy; a warning beep 3 s before the end) -> burnt (smoke; it
// cannot be delivered, the chef takes it on a plate and bins it) -> `FIRE_DELAY_MS` more -> fire in the oven. Easy has no fire.
// Fire: the oven is out of use and what it held is lost; every `FIRE_SPREAD_MS` it jumps to the counters next to a burning station (at most
// `FIRE_RINGS` jumps). One active fire per kitchen: another oven that burns meanwhile waits for it to end. A chef puts a station out by holding Picar (B)
// in front of it: `DOUSE_MS` of Picar (the sum of the chefs' time: two chefs go twice as fast).
// Decision (the council gave two ways): no extinguisher item. A wall extinguisher would need a new station on all 20 maps and the validator; holding Picar is the
// same verb the brief proposes as the fallback, and the art draws the extinguisher (a red cylinder in the chef's hands and a cloud of foam) while it happens.
// Mirror: a spread ignites EVERY counter next to the fire (no tie-break between neighbours), so a reflected kitchen burns as the reflected kitchen.
import type { Difficulty } from '@pichi/core';
import type { Game, Station } from '../round/state';
import type { SabotageMode } from '../sabotage-config';
import { mechOnFire, mechOvenRate } from '../mech/loop';
import { hazardParams, fireIsBig, type FireParams } from '../hazards/hazard-v2';
import { fireDouseTick, newFireV2, registerDouse, type FireV2 } from '../hazards/fire-v2';

export const GRACE_MS: Record<Difficulty, number> = { easy: 15_000, normal: 8_000, hard: 8_000 }; // from "ready" to "burnt"
export const WARN_BEFORE_MS = 3000; // the warning beep comes this long before the pizza burns
export const FIRE_DELAY_MS = 5000; // from "burnt" to the fire
export const FIRE_SPREAD_MS = 3000; // the fire jumps to the neighbours this often
export const FIRE_RINGS = 2; // ... and stops after this many jumps
export const DOUSE_MS = 3000; // of Picar to put one station out

export interface Fire {
  spreadAt: number;
  rings: number;
  big?: boolean; // v2: needs two chefs at once (fire-v2.ts)
  spreadMs?: number; // v2: this fire's own jump interval and ring limit
  maxRings?: number;
}
export interface Burn {
  graceMs: number;
  fire: boolean; // false: the pizza burns but the oven never catches fire
  fires: (Fire | null)[]; // the active fire of each kitchen (index = team; coop has one), null when none: at most one per kitchen
  v2?: FireV2 & { params(k: number): FireParams; chefs(k: number): number }; // HAZARD_V2 (createGame passes it; a bare createBurn is the old fire)
}

/** Fire exists from Normal up, and not under the Suave sabotage (the chaos cap: bags and banana-skins already fill that kitchen). */
export const fireAllowed = (d: Difficulty, sabotage: SabotageMode | undefined, v2 = false): boolean =>
  d !== 'easy' && (v2 || sabotage !== 'soft');

/** Seed + sabotage mode switch HAZARD_V2 on: Suave versus gets a (small) fire, Caos the big one too. */
export interface BurnV2Opts {
  seed: number;
  sabotage?: SabotageMode;
  chefs(k: number): number;
}
export const createBurn = (d: Difficulty, fire: boolean, teams: number, v2?: BurnV2Opts): Burn => {
  const b: Burn = { graceMs: GRACE_MS[d], fire, fires: Array.from({ length: teams }, () => null) };
  if (v2) {
    const base = newFireV2(v2.seed, v2.sabotage !== 'soft', teams);
    b.v2 = Object.assign(base, { params: (k: number) => hazardParams(d, v2.chefs(k)).fire, chefs: v2.chefs });
    b.graceMs = hazardParams(d).fire.graceMs;
  }
  return b;
};

const tag = (g: Game, team: number | null): { team?: number } => (g.versus && team !== null ? { team } : {});
const kitchenOf = (s: Station) => s.owner ?? 0;
const adjacent = (a: Station, b: Station) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;

/** True while the lights are out (the "Corte de luz" event): the ovens neither cook nor count the grace down. */
export const isDark = (g: Pick<Game, 'mid'>) => !!g.mid?.dark;

/** The oven is empty again (a chef took the pizza, or the fire ate it). */
export function clearPot(s: Station) {
  s.inputs = [];
  s.done = false;
  s.progress = 0;
  delete s.readyAt;
  delete s.warned;
  delete s.burnt;
  delete s.fold;
  delete s.folded;
  delete s.stage;
  delete s.bellLeft;
}

function ignite(g: Game, s: Station, origin: boolean) {
  s.fire = 0;
  if (s.kind === 'pot') clearPot(s);
  else s.item = null;
  const big = origin && !!g.burn!.fires[kitchenOf(s)]?.big;
  g.bus.emit(origin ? 'fire:start' : 'fire:spread', { station: g.stations.indexOf(s), ...(big ? { big } : {}), ...tag(g, s.owner) });
  if (g.mech) mechOnFire(g, s, origin ? 'start' : 'spread'); // mech/: a burning oven lights the oil next to it
}

/** A chef holds Picar in front of a station on fire: `dtMs` more of putting it out. When it is done the station is usable again. */
export function douse(g: Game, playerId: number, s: Station, dtMs: number) {
  if (g.burn!.v2) {
    registerDouse(g, playerId, g.stations.indexOf(s)); // v2: fireDouseTick settles it at the end of the tick, with every chef in front of the flame counted
    return;
  }
  s.fire = (s.fire ?? 0) + dtMs;
  if (s.fire < DOUSE_MS) return;
  putOut(g, playerId, s);
}

function putOut(g: Game, playerId: number, s: Station) {
  delete s.fire;
  const k = kitchenOf(s);
  g.bus.emit('fire:out', { player: playerId, station: g.stations.indexOf(s), ...tag(g, s.owner) });
  if (g.mech) mechOnFire(g, s, 'out'); // mech/: the extinguisher also cleans the oil in front
  if (!g.stations.some((o) => o.fire !== undefined && kitchenOf(o) === k)) {
    // the last flame of the kitchen: it may catch fire again
    g.burn!.fires[k] = null;
    g.bus.emit('fire:end', { ...tag(g, s.owner) });
  }
}

// The k-th fire of a kitchen (k counts the fires lit there): v2 sizes it from the seed (hazard-v2.ts), the old fire is always the same.
function newFire(g: Game, k: number): Fire {
  const v2 = g.burn!.v2;
  if (!v2) return { spreadAt: g.time + FIRE_SPREAD_MS, rings: 0 };
  const p = v2.params(k);
  const idx = v2.count[k]!++;
  const big = fireIsBig(v2.seed, idx, g.difficulty, v2.chefs(k), v2.bigOk);
  const spreadMs = big ? p.bigSpreadMs : p.spreadMs;
  return { spreadAt: g.time + spreadMs, rings: 0, big, spreadMs, maxRings: p.rings + (big ? p.bigRingsPlus : 0) };
}

/** How an oven stands: on fire, with a burnt pizza, with a ready one, or neither (empty or cooking). The art and the tests read it. */
export const ovenStage = (s: Station): 'idle' | 'ready' | 'burnt' | 'fire' =>
  s.fire !== undefined ? 'fire' : s.burnt ? 'burnt' : s.done ? 'ready' : 'idle';

/** End of the tick: pizzas that wait too long burn, burnt ones set the oven on fire, fire jumps. */
export function burnTick(g: Game, dtMs: number) {
  const b = g.burn!;
  const dark = isDark(g);
  for (const s of g.stations) {
    if (s.kind !== 'pot' || s.fire !== undefined || !s.done || s.readyAt === undefined) continue;
    if (dark || (g.mech && mechOvenRate(g, s) === 0)) {
      s.readyAt += dtMs;
      continue;
    } // lights out (or a frozen W oven, mech/): the grace time does not run
    const age = g.time - s.readyAt;
    const at = g.stations.indexOf(s);
    if (!s.burnt) {
      if (!s.warned && age >= b.graceMs - WARN_BEFORE_MS) {
        s.warned = true;
        g.bus.emit('oven:warn', { station: at, msLeft: Math.max(0, b.graceMs - age), ...tag(g, s.owner) });
      }
      if (age >= b.graceMs) {
        s.burnt = true;
        g.bus.emit('oven:burnt', { station: at, ...tag(g, s.owner) });
      }
    } else if (b.fire && age >= b.graceMs + (b.v2 ? b.v2.params(kitchenOf(s)).delayMs : FIRE_DELAY_MS) && !b.fires[kitchenOf(s)]) {
      // one active fire per kitchen: a second oven waits
      const k = kitchenOf(s);
      b.fires[k] = newFire(g, k);
      ignite(g, s, true);
    }
  }
  if (b.v2) fireDouseTick(g, dtMs, kitchenOf, (id, st) => putOut(g, id, st));
  b.fires.forEach((fire, k) => {
    if (!fire || g.time < fire.spreadAt) return;
    fire.spreadAt += fire.spreadMs ?? FIRE_SPREAD_MS;
    if (fire.rings >= (fire.maxRings ?? FIRE_RINGS)) return;
    fire.rings++;
    const burning = g.stations.filter((s) => s.fire !== undefined && kitchenOf(s) === k);
    const next = g.stations.filter(
      (s) => s.kind === 'counter' && s.fire === undefined && kitchenOf(s) === k && burning.some((f) => adjacent(f, s)),
    );
    for (const s of next) ignite(g, s, false);
  });
}
