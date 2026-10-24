// Versus sabotage rules (plan versus-sabotaje-basura, sections 2, 3 and 5), on top of the generic floor hazards of the sim (overcooked.ts).
// Pure and deterministic: no clock, no I/O, no RNG. The sim calls these hooks only when `g.sab` exists, i.e. a versus round with the
// option on and a catapult in each kitchen; otherwise none of this runs.
//
// The flow: items binned (and a slow trickle) fill the team's desechos; 3 desechos = a bag at the bin (A with empty hands takes it); A with
// the bag at the catapult loads it and the reticle starts sweeping the rival kitchen; B throws (or 3 s pass); 700 ms later the bag lands as a
// banana-skin on the rival floor (or is caught by an empty-handed rival, or bursts when no valid tile is near).
//
// Mirror: everything that picks a tile (the reticle order, the BFS tie-break, the neighbour of a double pile) is computed in the frame of ONE
// kitchen (the "canonical" one, team 1's) and mapped back through sigma, so a team-1 script reflected by sigma gets the reflected outcome.
import { DIRS, MAP_H, MAP_W, isFloor, type Pos, type SigmaName } from './maps';
import { SIGMAS } from './symmetry';
import { addFloorItem, pilesIn } from './floor';
import type { Game, Item, Player, Station } from './overcooked';
import {
  ADJUST_MAX, AIM_MAX_MS, CATCH_RADIUS, COMEBACK_BEHIND, COMEBACK_RATE, DESECHOS_DRIP_MS, DESECHOS_OF, DESECHOS_PER_BAG, LAND_AFTER_MS, RETICLE_STEP_MS, RULES,
  SMALL_KITCHEN_DECAY, WINDOW_MS, dropsItem, type Flight, type Sabotage, type SabotageMode, type SabTeam,
} from './sabotage-config';

const key = (x: number, y: number) => `${x},${y}`;

/** The sabotage state of a round, or null when it cannot run: not two teams, no catapult in a kitchen, or the kitchens are not twins under sigma. */
export function createSabotage(g: Game, mode: SabotageMode, sigma: SigmaName | undefined): Sabotage | null {
  if (mode === 'off' || !sigma || !g.versus || g.teams.length !== 2 || !g.kitchens) return null;
  const catapults = [0, 1].map((t) => g.stations.find((s) => s.kind === 'catapult' && s.owner === t));
  if (!catapults[0] || !catapults[1]) return null;
  const f = SIGMAS[sigma];
  const tiles = (t: number) => kitchenTiles(g, t);
  const a = new Set(tiles(0).map(([x, y]) => key(x, y)));
  const b = tiles(1);
  if (a.size !== b.length || !b.every(([x, y]) => { const [tx, ty] = f(x, y, MAP_W, MAP_H); return a.has(key(tx, ty)); })) return null; // not twins: no fair sabotage
  const rules = RULES[mode];
  g.hazards = true;
  g.slipDrops = dropsItem(mode, g.difficulty);
  g.spoilRaw = rules.spoilRaw;
  return {
    mode, rules, sigma,
    teams: g.teams.map((): SabTeam => ({ desechos: 0, bags: 0, dripAt: DESECHOS_DRIP_MS, cooldownUntil: 0, launches: [], aim: null, flights: [] })),
    catapults: catapults.map((s) => [s!.tx, s!.ty] as Pos),
  };
}

// --- Tiles of a kitchen, in the canonical frame --------------------------------------------------------------------------------------------
/** Floor tiles of a team's kitchen, in reading order. */
export function kitchenTiles(g: Game, team: number): Pos[] {
  const k = g.kitchens!;
  const out: Pos[] = [];
  g.grid.forEach((row, y) => row.forEach((_t, x) => { if (isFloor(g.grid, x, y) && k.comp[y]![x] === k.regions[team]) out.push([x, y]); }));
  return out;
}
/** Team 1's kitchen is the canonical frame: a tile of kitchen 0 goes through sigma, one of kitchen 1 stays. (sigma is its own inverse: the same call maps back.) */
const frame = (g: Game, target: number, [x, y]: Pos): Pos => (target === 0 ? SIGMAS[g.sab!.sigma](x, y, MAP_W, MAP_H) : [x, y]);

/** The sweep: every floor tile of the target kitchen in serpentine order (rows top to bottom in the canonical frame, alternating direction), real coordinates. */
export function sweepOrder(g: Game, target: number): Pos[] {
  const canon = kitchenTiles(g, target).map((p) => ({ p, c: frame(g, target, p) }));
  const rows = [...new Set(canon.map((t) => t.c[1]))].sort((a, b) => a - b);
  const out: Pos[] = [];
  rows.forEach((y, i) => {
    const row = canon.filter((t) => t.c[1] === y).sort((a, b) => (i % 2 ? b.c[0] - a.c[0] : a.c[0] - b.c[0]));
    for (const t of row) out.push(t.p);
  });
  return out;
}
/** Where the reticle is `elapsedMs` after the bag was loaded: one tile per RETICLE_STEP_MS, back and forth along the sweep. */
export function reticleAt(g: Game, target: number, elapsedMs: number): Pos {
  const list = sweepOrder(g, target);
  const n = list.length, cycle = Math.max(1, 2 * n - 2);
  const k = Math.floor(Math.max(0, elapsedMs) / RETICLE_STEP_MS) % cycle;
  return list[k < n ? k : cycle - k]!;
}

// --- Can a bag land here? --------------------------------------------------------------------------------------------------------------------
const targetOf = (g: Game, team: number) => (team + 1) % g.teams.length;
const pendingAt = (g: Game, target: number) => g.sab!.teams.reduce((n, t) => n + t.flights.filter((f) => f.target === target).length, 0);
const isValidLanding = (g: Game, target: number, [x, y]: Pos, ignore?: Flight): boolean => {
  const t = g.grid[y]?.[x];
  if (!t || t.kind !== 'floor' || t.spawn || g.kitchens!.comp[y]![x] !== g.kitchens!.regions[target]) return false;
  if (g.floor.some((f) => f.kind === 'trash' && f.tx === x && f.ty === y)) return false;
  return !g.sab!.teams.some((s) => s.flights.some((f) => f !== ignore && f.target === target && f.to[0] === x && f.to[1] === y));
};
/** The valid tile closest to `want` within ADJUST_MAX steps over the kitchen floor (ties by the canonical frame's reading order), or null: the bag bursts. */
export function adjustLanding(g: Game, target: number, want: Pos, ignore?: Flight): Pos | null {
  if (isValidLanding(g, target, want, ignore)) return want;
  const seen = new Set([key(want[0], want[1])]);
  let ring: Pos[] = [want];
  for (let d = 1; d <= ADJUST_MAX; d++) {
    const next: Pos[] = [];
    for (const [x, y] of ring) for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !isFloor(g.grid, nx, ny) || g.kitchens!.comp[ny]![nx] !== g.kitchens!.regions[target]) continue;
      seen.add(key(nx, ny));
      next.push([nx, ny]);
    }
    const ok = next.filter((p) => isValidLanding(g, target, p, ignore)).map((p) => ({ p, c: frame(g, target, p) })).sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
    if (ok.length) return ok[0]!.p;
    ring = next;
  }
  return null;
}
/** Valid landing tiles of a kitchen right now (the validator wants six at least on an empty map). */
export const landingTiles = (g: Game, target: number): Pos[] => kitchenTiles(g, target).filter((p) => isValidLanding(g, target, p));

// --- The catapult: can it take a bag now? -----------------------------------------------------------------------------------------------------
export type CatapultState = 'ready' | 'busy' | 'cooldown' | 'window' | 'piles';
export function catapultState(g: Game, team: number): CatapultState {
  const sab = g.sab!, st = sab.teams[team]!, target = targetOf(g, team);
  if (st.aim) return 'busy';
  if (g.time < st.cooldownUntil) return 'cooldown';
  if (st.launches.filter((t) => g.time - t < WINDOW_MS).length >= sab.rules.perMinute) return 'window';
  if (pilesIn(g, target) + pendingAt(g, target) >= sab.rules.maxPiles) return 'piles';
  return 'ready';
}
/** The cooldown of a team: the bigger team (k = 1) waits k times as long when the other team carries a handicap k > 1 (3v2). */
const cooldownOf = (g: Game, team: number) => {
  const kmax = Math.max(...g.teams.map((t) => t.k));
  return g.sab!.rules.cooldownMs * (g.teams[team]!.k === 1 && kmax > 1 ? kmax : 1);
};

// --- Desechos and bags ------------------------------------------------------------------------------------------------------------------------
function addDesechos(g: Game, team: number, n: number) {
  const sab = g.sab!, st = sab.teams[team]!;
  if (st.bags >= sab.rules.stock) return 0; // the stock is full: the counter does not go on
  const before = st.desechos + st.bags * DESECHOS_PER_BAG;
  st.desechos += n;
  while (st.desechos >= DESECHOS_PER_BAG - 1e-9 && st.bags < sab.rules.stock) {
    st.desechos = Math.max(0, st.desechos - DESECHOS_PER_BAG);
    st.bags++;
    g.bus.emit('sabotage:bagReady', { team, bags: st.bags });
  }
  if (st.bags >= sab.rules.stock) st.desechos = Math.min(st.desechos, DESECHOS_PER_BAG - 1);
  return st.desechos + st.bags * DESECHOS_PER_BAG - before;
}
const worth = (item: Item) => (item === 'trashBag' ? DESECHOS_OF.bag : item === 'dish' || item === 'dishQ' ? DESECHOS_OF.pizza : item === 'trash' ? DESECHOS_OF.trash : DESECHOS_OF.item);

/** A chef bins an item at X: it feeds the team's desechos (an item 1, a baked pizza 2, rubbish 1, a caught bag 3). */
export function sabotageBinned(g: Game, p: Player, item: Item) {
  const gained = addDesechos(g, p.team, worth(item));
  g.bus.emit('trash:binned', { team: p.team, desechos: Math.floor(g.sab!.teams[p.team]!.desechos), gained, item });
}
/** A with empty hands at X takes a bag when one is waiting. */
export function sabotageTakeBag(g: Game, p: Player) {
  const st = g.sab!.teams[p.team]!;
  if (st.bags <= 0) return;
  st.bags--;
  p.item = 'trashBag';
}

// --- Loading, aiming, throwing ----------------------------------------------------------------------------------------------------------------
/** A with a bag at the catapult of the chef's kitchen. The bag is loaded and the reticle starts, or the catapult refuses it (the chef keeps the bag). */
export function sabotageLoad(g: Game, p: Player, s: Station) {
  const sab = g.sab!, st = sab.teams[p.team]!;
  if (p.item !== 'trashBag' || s.owner !== p.team) return;
  const state = catapultState(g, p.team);
  if (state !== 'ready') { g.bus.emit('sabotage:blocked', { team: p.team, player: p.id, why: state }); return; }
  p.item = null;
  st.aim = { player: p.id, t0: g.time, step: 0 };
  Object.assign(p, { vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0 });
  g.bus.emit('sabotage:aim', { team: p.team, player: p.id, at: reticleAt(g, targetOf(g, p.team), 0) });
}
export const isAiming = (g: Game, p: Player) => !!g.sab && g.sab.teams[p.team]?.aim?.player === p.id;

function launch(g: Game, team: number) {
  const sab = g.sab!, st = sab.teams[team]!, aim = st.aim!, target = targetOf(g, team);
  const want = reticleAt(g, target, g.time - aim.t0);
  st.aim = null;
  st.cooldownUntil = g.time + cooldownOf(g, team);
  st.launches = st.launches.filter((t) => g.time - t < WINDOW_MS);
  st.launches.push(g.time);
  const from = sab.catapults[team]!;
  const to = adjustLanding(g, target, want);
  if (!to) { g.bus.emit('sabotage:burst', { team, at: from }); return; } // nothing valid near: it bursts on the barrier, and the cooldown runs anyway
  st.flights.push({ from, to, launchAt: g.time, landAt: g.time + LAND_AFTER_MS, by: team, target, double: sab.rules.double });
  g.bus.emit('sabotage:launch', { team, player: aim.player, from, landAt: to, ms: LAND_AFTER_MS });
}
/** B (a press) from the chef that is aiming throws. Returns true when the press was used. */
export function sabotageAimPress(g: Game, p: Player): boolean {
  if (!isAiming(g, p)) return false;
  launch(g, p.team);
  return true;
}
/** The aiming chef leaves (its phone dropped): the bag goes back to the bin's stock. */
export function sabotageCancelAim(g: Game, p: Player) {
  if (!isAiming(g, p)) return;
  const st = g.sab!.teams[p.team]!;
  st.aim = null;
  st.bags++;
}

function land(g: Game, f: Flight) {
  const st = g.sab!.teams[f.by]!;
  st.flights.splice(st.flights.indexOf(f), 1);
  const to = adjustLanding(g, f.target, f.to) ; // something may have landed there meanwhile
  if (!to) { g.bus.emit('sabotage:burst', { team: f.by, at: f.to }); return; }
  // an empty-handed rival chef close to the landing tile catches the bag: no rubbish falls
  let catcher: Player | null = null, best = CATCH_RADIUS + 1e-9;
  for (const c of g.players.values()) {
    if (c.ghost || c.slip || c.item || c.team !== f.target) continue;
    const d = Math.hypot(c.x - (to[0] + 0.5), c.y - (to[1] + 0.5));
    if (d < best) { catcher = c; best = d; }
  }
  if (catcher) {
    catcher.item = 'trashBag';
    g.bus.emit('sabotage:caught', { team: f.by, target: f.target, chef: catcher.id });
    return;
  }
  const rules = g.sab!.rules;
  const decay = rules.decayMs * (g.teams[f.target]!.k > 1 ? SMALL_KITCHEN_DECAY : 1);
  addFloorItem(g, { tx: to[0], ty: to[1], item: 'trash', kind: 'trash', team: f.target, by: f.by, ttlMs: decay });
  let extra: Pos | null = null;
  if (f.double && pilesIn(g, f.target) + pendingAt(g, f.target) < rules.maxPiles) { // Caos: a second one on the neighbour that comes first in the canonical frame
    const near = DIRS.map(([dx, dy]): Pos => [to[0] + dx, to[1] + dy]).filter((p) => isValidLanding(g, f.target, p)).map((p) => ({ p, c: frame(g, f.target, p) })).sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
    if (near.length) { extra = near[0]!.p; addFloorItem(g, { tx: extra[0], ty: extra[1], item: 'trash', kind: 'trash', team: f.target, by: f.by, ttlMs: decay }); }
  }
  g.bus.emit('sabotage:land', { team: f.by, target: f.target, tile: to, double: !!extra, extra });
}

// --- One tick (after the chefs moved) ---------------------------------------------------------------------------------------------------------
export function sabotageTick(g: Game) {
  const sab = g.sab!;
  g.teams.forEach((team, i) => {
    const st = sab.teams[i]!;
    // the trickle: +1 every DESECHOS_DRIP_MS (a team two orders behind gets it COMEBACK_RATE times faster)
    while (g.time >= st.dripAt) {
      addDesechos(g, i, 1);
      const behind = Math.max(...g.teams.map((t) => t.delivered)) - team.delivered >= COMEBACK_BEHIND;
      st.dripAt += DESECHOS_DRIP_MS / (behind ? COMEBACK_RATE : 1);
    }
    // the reticle: announced every step, fires by itself after AIM_MAX_MS
    if (st.aim) {
      if (g.time - st.aim.t0 >= AIM_MAX_MS) launch(g, i);
      else {
        const step = Math.floor((g.time - st.aim.t0) / RETICLE_STEP_MS);
        if (step !== st.aim.step) { st.aim.step = step; g.bus.emit('sabotage:aim', { team: i, player: st.aim.player, at: reticleAt(g, targetOf(g, i), g.time - st.aim.t0) }); }
      }
    }
  });
  // landings, in a fixed order: team by team, by landing time (they fall in different kitchens, so they do not depend on each other)
  for (let i = 0; i < g.teams.length; i++) for (const f of [...sab.teams[i]!.flights].sort((a, b) => a.landAt - b.landAt)) if (g.time >= f.landAt) land(g, f);
}
