// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
import { Emitter, type GameEvents } from './events';
import { FIXED_MAPS, MAP_H, MAP_W, isFloor, parseMap, spawnPoints, type Grid, type Pos, type SigmaName, type StationKind } from './maps';
import { DEFAULT_DIFFICULTY, DIRTY_MS, WASH_MS, params as difficultyParams, teamSize, type Difficulty, type Params, type Tuning } from './difficulty';
import { mulberry32, type Rng } from './rng';
import { holdsPlace, matchStatus, rankTeams, teamMultipliers, type PauseChoice, type RosterEntry, type TeamId, type TeamResult } from './teams';
import { PANTRY_EVERY_MS, PANTRY_MAX, VIP_EVERY_MS, VIP_MULT, VIP_TTL_MS, kitchenRegions, stationOwner, teamStarts, type Kitchens } from './versus';
import { SLIP, SLIP_DASH_EXTRA, SLIP_MIN_SPEED, SLIP_PUSH, SLIP_TRIGGER, type FloorItem, type Sabotage, type SabotageMode, type Slip } from './sabotage-config';
import { createSabotage, isAiming, sabotageAimPress, sabotageBinned, sabotageCancelAim, sabotageLoad, sabotageTakeBag, sabotageTick } from './sabotage';
import { addFloorItem, removeFloorItem } from './floor';
import { burnTick, clearPot, createBurn, douse, fireAllowed, isDark, type Burn } from './burn';
import { BIRTHDAY_POINTS, EVENT_MAX_QUEUE, RUSH_ORDERS, createMid, midTick, type Mid, type MidFx } from './midround';
import { ASSIST_FACING_BONUS, ASSIST_REACH_MULT, ASSIST_STICK_CANCEL } from './assist';
import { applyMagnet, faceStation as magnetFace, floorWins, magnetHug, magnetPull, magnetStation, type MagnetCfg, type MagnetLevel } from './feel/magnet';
import { RAW_OF, RECIPE_PARTS, cutOf, cutType, dishFor, isDish, recipeBase, type Recipe } from './recipes/defs';
import { canFold, cookMsOf, crateItem, createRec, cutMsOf, foldStep, pickOrder, pickRecipe, type Rec } from './recipes/sim';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile

export type { StationKind } from './maps';
// raw2/cut2 = cheese (Margarita), raw3/cut3 = pepperoni, raw4/cut4 = mushroom (a round with a Carta del día: the cheese crate gives the card's topping). dishQ / dishP / dishM = a pizza that baked with cheese / pepperoni / mushroom, dishC = a folded calzone.
// trash / trashBag exist only in a round with hazards on (sabotage): rubbish picked off the floor, and the bag a team throws.
// burnt: a pizza that burnt in the oven (a round with `burn` on), taken on a plate: it cannot be delivered, it goes to the bin.
export type Item = 'raw0' | 'raw1' | 'raw2' | 'raw3' | 'raw4' | 'cut0' | 'cut1' | 'cut2' | 'cut3' | 'cut4' | 'plate' | 'dish' | 'dishQ' | 'dishP' | 'dishM' | 'dishC' | 'dirty' | 'trash' | 'trashBag' | 'burnt';
export { RAW_OF, RECIPE_PARTS, recipeBase, type Recipe }; // recipes/defs.ts: the five recipes (marinara, margarita; a Carta del día adds pepperoni, champiñón and calzone) and what each is worth (R13)
// R15: the tip multiplier for a delivery made after `streak` correct ones in a row.
export const tipMultiplier = (streak: number, t: Tuning) => Math.min(t.streakMax, 1 + Math.max(0, streak));

export interface Station {
  kind: StationKind;
  tx: number;
  ty: number;
  crate: number; // ingredient type, crates only
  item: Item | null; // boards and counters
  progress: number; // 0..1: board cutting or pot cooking
  inputs: number[]; // pot: ingredient types inside (0 dough, 1 tomato, 2 cheese)
  done: boolean; // pot: dish ready
  count: number; // plates: clean stock (finite-plate maps); dirty (return): dirty plates waiting; sink: dirty plates to wash
  clean: number; // sink: washed plates ready to take
  owner: TeamId | null; // the team whose kitchen it is: chefs of another team cannot use it. null: shared (nobody owns it)
  pantry?: true; // a crate of the shared pantry: it gives from the common stock (game.pantry) instead of for free
  // burn / fire only (absent otherwise: a round without them never sets these)
  readyAt?: number; // pot: match time the pizza got ready (it burns `burn.graceMs` later); shifted while the lights are out
  warned?: true; // pot: the warning beep sounded
  burnt?: true; // pot: the ready pizza burnt (smoke): it only serves for the bin
  fire?: number; // on fire: the ms of Picar already spent putting it out (present = burning, the station is out of use)
  fold?: number; folded?: true; // a round with a Carta del día, pot only: 0..1 of Picar folding the dough and tomato; folded = a calzone (it bakes longer)
}
export interface Player {
  id: number;
  slot: number;
  spawn: number; // index into game.spawns where this chef started (puesto i belongs to spawn i)
  x: number;
  y: number;
  fx: number; // facing, last non-null stick vector
  fy: number;
  vx: number; // R1: smoothed velocity, tiles/s
  vy: number;
  item: Item | null;
  cutting: boolean;
  chopAt: number; // station index being chopped, -1 if none
  bHeld: boolean; // B as of the previous tick: a rising edge with empty hands and no station in front is a dash (R2)
  dashMs: number; // time left in the running dash
  dashCd: number; // time until the next dash
  dashDx: number; // dash direction (unit vector)
  dashDy: number;
  dashHit: number[]; // chefs this dash already pushed (R5): one push each
  kx: number; // R5: knock velocity from a dash that hit this chef, tiles/s, fades out
  ky: number;
  buffA: number; // R6: A presses waiting for a station to show up in front
  buffAge: number; // ms since the newest of them
  buffB: number; // R6: ms left of a dash press that found nothing to do yet
  crossing: boolean; // R4: in a pair that is crossing through each other (slower, drawn see-through)
  team: TeamId; // the team this chef plays for (0 in a cooperative round)
  ghost: boolean; // a dropped chef: no collision, no input, no interaction, until it reconnects (GHOST_MS) or is removed
  // Ayudante (assist.ts): absent for every other chef, so a round without it never touches these
  assist?: true; // this chef plays on Ayudante: reach x1.5 with auto-aim, no inertia, one-tap chopping, no slipping
  chopLatch?: boolean; // Ayudante: B was tapped at a cuttable board / a sink and the chop goes on without holding it
  // hazards only (absent otherwise: a round without hazards never creates them)
  slip?: Slip | null; // sliding on rubbish: no control until it ends
  immuneUntil?: number; // match time until which rubbish does not make this chef slip
  inTrash?: number[]; // rubbish items whose trigger disc the chef is inside of now: slipping counts entering, not standing there
  dousing?: boolean; // burn only: the chef's Picar is going into a fire (the extinguisher), not into a board or a sink
}
export interface Order { id: number; expiresAt: number; warned: boolean; recipe: Recipe; vip?: boolean; birthday?: boolean } // birthday: the mid-round event's order, worth BIRTHDAY_POINTS flat
// a = new A presses since last tick; bTaps = new B presses since last tick (a quick tap can start and end between two ticks)
export interface Controls { x: number; y: number; a: number; b: boolean; bTaps?: number }
export const COLS = MAP_W;
export const ROWS = MAP_H;
export const MAX_SLOTS = 8;
export const COUNTDOWN_MS = 3000;
export const WARNING_MS = 10_000; // an order with less patience left than this raises orderWarning

export interface Game {
  bus: Emitter<GameEvents>;
  countdown: number; // ms before the round clock starts
  started: boolean;
  counting: boolean;
  endTick: number;
  grid: Grid;
  spawns: [number, number][];
  difficulty: Difficulty;
  n: number; // team size the parameters were scaled for
  params: Params;
  time: number;
  over: boolean;
  mapId?: string; // fixed map id, for the star table (undefined: generated map)
  players: Map<number, Player>;
  stations: Station[];
  hasCheese: boolean;
  finitePlates: boolean; // the map has a dirty-plate return and a sink: plates run out unless somebody washes
  crowd: Map<string, { ms: number; ghost: boolean }>; // R4: per pair of chefs, ms of opposed pushing and whether they are crossing
  // Teams: the per-team state (queue, score, streak, plates). A cooperative round is ONE team, so there is a single code path.
  teams: TeamState[];
  versus: boolean; // two or more teams: separate kitchens, twin queues, VIP, handicap, ghosts
  roster: RosterEntry[]; // who plays for which team and since when a phone is down (see dropPlayer)
  paused: { teams: TeamId[] } | null; // an empty team stopped the clock: resolvePause
  noWinner: boolean; // the host chose to go on without a winner after a team emptied
  result: MatchResult | null; // set when the round ends
  vip: { nextAt: number; rng: Rng; round: VipRound | null };
  pantry: Pantry | null; // versus maps that declare a shared pantry (V2): the stock both kitchens' pantry crates draw from
  // legacy single-team view: the fields of team 0 (the whole round in coop)
  score: number; // points of team 0 (versus: times k)
  delivered: number;
  streak: number; // R15: correct deliveries in a row; an expired order or a rejected dish resets it
  bestStreak: number;
  tips: number; // points earned as tips, for the results
  expired: number;
  rejected: number;
  orders: Order[];
  rng: Rng; // seeded: which orders are Margarita
  dirtyDue: number[]; // game times at which a delivered plate comes back dirty
  nextOrderAt: number;
  orderSeq: number;
  // private to the sim
  teamIds: number[][]; // declared players per team ([] playerIds + open when the round is cooperative without a roster)
  open: boolean; // coop without a declared roster: every chef joins team 0
  handicap: boolean; // apply the k of the smaller team (the host's option)
  pauseDismissed: boolean;
  kitchens: Kitchens | null;
  teamSpawns: [number, number][][]; // versus: start tiles of each kitchen
  // hazards (sabotage S1/S2). With `hazards` false (the default, and every coop round) none of this runs and nothing is drawn from the RNG.
  hazards: boolean;
  floor: FloorItem[]; // rubbish and dropped items on the floor
  floorSeq: number;
  slipDrops: boolean; // a chef that slips drops what it carries
  spoilRaw: boolean; // ... and a raw ingredient that falls becomes rubbish
  sab: Sabotage | null; // versus sabotage (sabotage.ts): the bags, the catapults, the throws
  burn: Burn | null; // the oven that burns and the fire (burn.ts): null (the default, and every golden round) = the oven never burns
  mid: Mid | null; // the event in the middle of the round (midround.ts): null (the default) = none
  rec: Rec | null; // the Carta del día of the round (recipes/sim.ts): null (the default) = the old recipes (Marinara, Margarita)
  assist: ReadonlySet<number>; // ids of the chefs that play on Ayudante (assist.ts); empty in a round that has none
  magnet: MagnetCfg | null; // magnetism for every chef (feel/magnet.ts): null (the default, and every golden round) = the plain targeting and feel
}

/** One team's side of the round. */
export interface TeamState {
  id: TeamId;
  n: number; // chefs the team started with (the star table reads it)
  score: number; // points, already times k and the VIP bonus
  gross: number; // the same before k (the results show both)
  delivered: number;
  streak: number;
  bestStreak: number;
  tips: number;
  expired: number;
  rejected: number;
  vips: number; // VIP orders won
  reachedAt: number; // match time of the last change of `score` (the fourth tie-break)
  k: number; // handicap multiplier now (1 in coop)
  orders: Order[];
  orderSeq: number;
  nextOrderAt: number;
  rng: Rng; // the team's own stream: the same seed for every team, so the queues are twins
  dirtyDue: number[];
}
/** The shared pantry: `stock` units both teams take from; below PANTRY_MAX one unit returns every PANTRY_EVERY_MS (`nextAt`, match time; Infinity when full). */
export interface Pantry { stock: number; nextAt: number }
export interface VipRound { recipe: Recipe; winners: { team: TeamId; at: number }[]; settled: boolean }
export interface MatchResult { order: TeamResult[]; winner: TeamId | null; aborted: boolean } // aborted: the host ended it from the pause

const LEGACY = ['score', 'delivered', 'streak', 'bestStreak', 'tips', 'expired', 'rejected', 'orders', 'rng', 'dirtyDue', 'nextOrderAt', 'orderSeq'] as const;

export const isSolid = (g: Game, tx: number, ty: number) => !isFloor(g.grid, tx, ty);

// {} in coop (one team): the events keep their old shape. Versus adds the team.
const tag = (g: Game, team: TeamId | null): { team?: number } => (g.versus && team !== null ? { team } : {});

// A new order for the team. In versus the recipe is drawn at EVERY slot, admitted or not, so both queues see the same recipe at the
// same instant whatever each team has delivered; coop draws only when the order is admitted (the golden rounds pin that).
export const spawnOrder = (g: Game, team: TeamState = g.teams[0]!, force = false) => {
  const room = team.orders.length < (force ? EVENT_MAX_QUEUE : g.params.maxOrders); // force: the rush event, which may fill the strip beyond the usual queue
  if (!room && !g.versus && !force) return;
  const recipe = pickRecipe(g, team.rng);
  if (!room) return;
  const o: Order = { id: team.orderSeq++, expiresAt: g.time + g.params.orderTtlMs, warned: false, recipe };
  team.orders.push(o);
  g.bus.emit('orderNew', { order: o.id, recipe, ...tag(g, team.id) });
};

// The golden order: the same recipe in every queue (one draw from its own stream), 30 s of patience, whatever the queue holds.
function spawnVip(g: Game) {
  const recipe = pickRecipe(g, g.vip.rng);
  g.vip.round = { recipe, winners: [], settled: false };
  g.vip.nextAt += VIP_EVERY_MS[g.difficulty];
  for (const t of g.teams) {
    const o: Order = { id: t.orderSeq++, expiresAt: g.time + VIP_TTL_MS, warned: false, recipe, vip: true };
    t.orders.push(o);
    g.bus.emit('orderNew', { order: o.id, recipe, team: t.id, vip: true });
  }
  g.bus.emit('vipNew', { recipe });
}

// End of the tick: the VIP has a winner, so the rival's golden order turns into a normal one (it keeps its pizza and its patience).
function settleVip(g: Game) {
  const r = g.vip.round;
  if (!r || r.settled || !r.winners.length) return;
  r.settled = true;
  for (const t of g.teams) {
    if (r.winners.some((w) => w.team === t.id)) continue;
    const o = t.orders.find((x) => x.vip);
    if (o) { delete o.vip; g.bus.emit('vipLost', { team: t.id }); }
  }
}

export interface TeamSeat { playerIds: readonly number[] } // a declared team: the chefs that play for it (TeamInfo from teams.ts fits). Team id = position.

export function createGame(opts: { mapId?: string; difficulty?: Difficulty; n?: number; rows?: readonly string[]; spawns?: readonly [number, number][]; seed?: number; countdownMs?: number; bus?: Emitter<GameEvents>; teams?: readonly TeamSeat[]; handicap?: boolean; shared?: readonly Pos[]; hazards?: boolean; slipDrops?: boolean; spoilRaw?: boolean; sabotage?: SabotageMode; sigma?: SigmaName; assist?: readonly number[]; burn?: boolean; fire?: boolean; events?: boolean; eventsSeed?: number; recipes?: boolean; magnet?: boolean | MagnetLevel } = {}): Game {
  const grid = parseMap(opts.rows ?? FIXED_MAPS[0]!.rows, (opts.teams?.length ?? 1) > 1); // the catapult letter belongs to versus maps
  const difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const seats = opts.teams;
  if (seats && !seats.length) throw new RangeError('a round needs at least one team');
  const teamCount = seats?.length ?? 1;
  const versus = teamCount > 1;
  // the order flow is sized for the average team (versus: round((nA + nB) / 2), 3v2 plays at 3); coop keeps its own team size
  const n = opts.n ?? (seats ? Math.round(seats.reduce((a, t) => a + t.playerIds.length, 0) / teamCount) : 2);
  const p = difficultyParams(difficulty, n);
  const seed = opts.seed ?? 1;
  const kitchens = versus ? kitchenRegions(grid, teamCount, opts.spawns) : null;
  const stations: Station[] = [];
  const pantryAt = new Set(versus ? (opts.shared ?? []).map(([x, y]) => `${x},${y}`) : []); // only a versus round has a pantry; coop ignores the declaration
  grid.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind !== 'station') return;
    const pantry = t.station === 'crate' && pantryAt.has(`${tx},${ty}`);
    stations.push({ kind: t.station, tx, ty, crate: t.crate, item: null, progress: 0, inputs: [], done: false, count: 0, clean: 0, owner: pantry ? null : kitchens ? stationOwner(grid, kitchens, tx, ty) : 0, ...(pantry ? { pantry: true as const } : {}) });
  }));
  const handicap = versus && (opts.handicap ?? true);
  const assist = new Set(opts.assist ?? []);
  const ks = handicap ? teamMultipliers(seats!.map((t) => t.playerIds.length), Infinity, assist.size ? seats!.map((t) => t.playerIds.filter((id) => assist.has(id)).length) : undefined) : null; // null: an empty team, or no handicap
  const teams: TeamState[] = Array.from({ length: teamCount }, (_v, id) => ({
    id, n: seats ? seats[id]!.playerIds.length : teamSize(n), score: 0, gross: 0, delivered: 0, streak: 0, bestStreak: 0, tips: 0, expired: 0, rejected: 0, vips: 0, reachedAt: 0,
    k: ks?.[id] ?? 1, orders: [], orderSeq: 0, nextOrderAt: p.orderEveryMs, rng: mulberry32(seed), dirtyDue: [],
  }));
  const g = {
    bus: opts.bus ?? new Emitter<GameEvents>(), countdown: opts.countdownMs ?? 0, started: false, counting: false, endTick: Infinity, grid, spawns: spawnPoints(grid, MAX_SLOTS, opts.spawns), difficulty, n: teamSize(n), params: p, time: 0, over: false, mapId: opts.mapId, players: new Map(), stations,
    hasCheese: stations.some((s) => s.kind === 'crate' && s.crate === 2), finitePlates: stations.some((s) => s.kind === 'dirty') && stations.some((s) => s.kind === 'sink'), crowd: new Map(),
    teams, versus, roster: [], paused: null, noWinner: false, result: null, vip: { nextAt: VIP_EVERY_MS[difficulty], rng: mulberry32((seed ^ 0x9e3779b9) >>> 0), round: null }, pantry: stations.some((s) => s.pantry) ? { stock: PANTRY_MAX, nextAt: Infinity } : null,
    teamIds: seats ? seats.map((t) => [...t.playerIds]) : [], open: !seats, handicap, pauseDismissed: false, kitchens, teamSpawns: [],
    hazards: opts.hazards ?? false, floor: [], floorSeq: 0, slipDrops: opts.slipDrops ?? true, spoilRaw: opts.spoilRaw ?? false, sab: null, burn: null, mid: null, rec: opts.recipes ? createRec(stations, opts.mapId) : null, assist, magnet: null, // rec: before the first orders are drawn
  } as unknown as Game;
  // the legacy single-team fields are live views of team 0
  for (const key of LEGACY) Object.defineProperty(g, key, { get: () => teams[0]![key], set: (v) => { (teams[0] as unknown as Record<string, unknown>)[key] = v; }, enumerable: true, configurable: true });
  if (kitchens) g.teamSpawns = teams.map((t) => {
    const starts = teamStarts(grid, kitchens, t.id, opts.spawns);
    if (!starts.length) throw new Error(`team ${t.id} has no start tile in its kitchen`);
    return spawnPoints(grid, MAX_SLOTS, starts);
  });
  if (g.finitePlates) for (const t of teams) {
    const piles = stations.filter((s) => s.kind === 'plates' && s.owner === t.id);
    for (let i = 0; i < p.plates && piles.length; i++) piles[i % piles.length]!.count++;
  }
  for (const t of teams) for (let i = 0; i < p.initialOrders; i++) spawnOrder(g, t);
  if (opts.sabotage && opts.sabotage !== 'off') g.sab = createSabotage(g, opts.sabotage, opts.sigma); // null when the map cannot host it: the round plays without
  // the new rules, each behind its own flag (off by default): a pizza that waits burns (and, from Normal up and not under the Suave sabotage, sets the oven on fire); one event per round
  if (opts.burn) g.burn = createBurn(difficulty, !!opts.fire && fireAllowed(difficulty, g.sab?.mode), teamCount);
  if (opts.magnet) applyMagnet(g, opts.magnet === true ? 'normal' : opts.magnet); // magnetism: off unless the round's config asks
  if (opts.events) g.mid = createMid(g, opts.eventsSeed ?? seed); // `eventsSeed`: the coop lobby does not seed its orders (they are the same every round), but the event must still vary
  return g;
}

// `slot` picks the chef (colour); `spawn` the start tile (default: the same index). The screen passes the chef's rank so
// spawn i always holds the i-th chef and the puesto table (spawn i = puesto i) lines up even when slots have gaps.
// Versus: the chef goes to its declared team (the roster given to createGame) and starts in that team's kitchen, on the tile of its
// rank inside the team; `spawn` is ignored. Returns false when nobody is added: already in, or not on any team (a spectator).
export function addPlayer(g: Game, id: number, slot: number, spawn = slot): boolean {
  if (g.players.has(id)) return false;
  const team = g.open ? 0 : g.teamIds.findIndex((ids) => ids.includes(id));
  if (team < 0) return false;
  let at = spawn % g.spawns.length;
  let [sx, sy] = g.spawns[at] ?? [1, 1];
  if (g.versus) {
    const rank = Math.max(0, g.teamIds[team]!.indexOf(id));
    const list = g.teamSpawns[team]!;
    [sx, sy] = list[rank % list.length]!;
    const found = g.spawns.findIndex(([x, y]) => x === sx && y === sy);
    at = found >= 0 ? found : rank;
  }
  g.players.set(id, { id, slot, spawn: at, x: sx + 0.5, y: sy + 0.5, fx: 0, fy: 1, vx: 0, vy: 0, item: null, cutting: false, chopAt: -1, bHeld: false, dashMs: 0, dashCd: 0, dashDx: 0, dashDy: 0, dashHit: [], kx: 0, ky: 0, buffA: 0, buffAge: 0, buffB: 0, crossing: false, team, ghost: false, ...(g.assist.has(id) ? { assist: true as const } : {}) });
  g.roster.push({ id, teamId: team, droppedAt: null, ...(g.assist.has(id) ? { assist: true as const } : {}) });
  return true;
}
export const removePlayer = (g: Game, id: number) => {
  g.players.delete(id);
  g.roster = g.roster.filter((e) => e.id !== id);
  for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(id))) g.crowd.delete(k);
};

// R1: one integrator for the chef's velocity, v += (target - v) * (1 - e^(-dt/tau)). tau = 0 is "instant" (the old feel).
function steer(p: Player, c: Controls, g: Game, dtMs: number) {
  const { tauMs, tauStopMs } = g.params.tune;
  const moving = c.x !== 0 || c.y !== 0;
  const tau = p.assist ? 0 : moving ? tauMs : tauStopMs; // Ayudante: no inertia
  const k = tau > 0 ? 1 - Math.exp(-dtMs / tau) : 1;
  p.vx += (c.x * SPEED - p.vx) * k;
  p.vy += (c.y * SPEED - p.vy) * k;
  if (!moving && Math.hypot(p.vx, p.vy) < 0.02) { p.vx = 0; p.vy = 0; } // the tail of the exponential is a stop
}

const KNOCK_FADE_MS = 90; // R5: the push a dash gives fades with this time constant
const idleControls: Controls = { x: 0, y: 0, a: 0, b: false };
const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// R2 (phase 1: no third button): B pressed with empty hands and no station in front. Returns true when the dash started.
function startDash(g: Game, p: Player, c: Controls) {
  const [dx, dy] = unit(c.x || c.y ? c.x : p.fx, c.x || c.y ? c.y : p.fy);
  const { dashMs, dashCdMs } = g.params.tune;
  p.dashMs = dashMs; p.dashCd = dashCdMs; p.dashDx = dx; p.dashDy = dy; p.dashHit = [];
  p.fx = dx; p.fy = dy;
  g.bus.emit('dash', { player: p.id, dx, dy });
}

// R5: a dash that touches another chef gives it a short push; it never makes it drop what it carries.
function pushNeighbours(g: Game, p: Player) {
  for (const o of g.players.values()) {
    if (o.id === p.id || o.ghost || p.dashHit.includes(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > 2 * RADIUS + 0.1) continue;
    p.dashHit.push(o.id);
    if (!o.cutting) { o.kx += p.dashDx * g.params.tune.pushSpeed; o.ky += p.dashDy * g.params.tune.pushSpeed; }
    g.bus.emit('bump', { player: p.id, other: o.id });
  }
}

// Moves a chef along (ux, uy) up to `amt`, axis by axis so a wall only stops the component that hits it. Returns the distance gained.
function moveAway(g: Game, p: Player, ux: number, uy: number, amt: number): number {
  const ox = p.x, oy = p.y;
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
function separate(g: Game, controls: Map<number, Controls>, dtMs: number) {
  const list = [...g.players.values()].filter((p) => !p.ghost); // a ghost has no body
  for (const p of g.players.values()) p.crossing = false;
  const { yieldAfterMs } = g.params.tune;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]!, b = list[j]!;
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    let st = g.crowd.get(key);
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = 2 * RADIUS;
    const ca = controls.get(a.id) ?? idleControls, cb = controls.get(b.id) ?? idleControls;
    if (st?.ghost) {
      const still = Math.hypot(ca.x, ca.y) < 0.2 && Math.hypot(cb.x, cb.y) < 0.2;
      if (d >= min + 0.05 || (still && d < min)) g.crowd.delete(key); // clear, or both stopped halfway: solid again, they get pushed apart
      else { a.crossing = true; b.crossing = true; continue; }
      st = undefined;
    }
    if (d >= min) {
      if (st) { st.ms = Math.max(0, st.ms - dtMs); if (st.ms === 0) g.crowd.delete(key); }
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
    const pa = pushing(a, b, ca), pb = pushing(b, a, cb);
    if ((pa && pb) || (stuck && (pa || pb))) {
      st ??= { ms: 0, ghost: false };
      st.ms += dtMs;
      if (st.ms >= yieldAfterMs) { st.ghost = true; a.crossing = true; b.crossing = true; }
      g.crowd.set(key, st);
    } else if (st) { st.ms = Math.max(0, st.ms - dtMs); if (st.ms === 0) g.crowd.delete(key); }
  }
}

const blocked = (g: Game, x: number, y: number) => {
  for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++)
    for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) if (isSolid(g, tx, ty)) return true;
  return false;
};

// --- Hazards (sabotage S1): rubbish on the floor makes a chef slip --------------------------------------------------------------------
// The chef's centre enters a rubbish tile (within SLIP_TRIGGER of its centre) and it is not immune: it slides `dist` tiles along its
// velocity (or its facing when it is nearly still) with a constant deceleration, ignores the stick and the buttons, then gets up. What it
// carried falls on the tile it started from, where any chef of its team picks it up. It is immune from the start of the slide until
// `immuneMs` after getting up, and the rubbish stays where it was: it does not chain, it does not punish in a loop.
const onTile = (p: Player): [number, number] => [Math.floor(p.x), Math.floor(p.y)];
// The event that ends what a chef's Picar was doing: putting a fire out, scrubbing plates at a sink, or chopping.
const stopKind = (g: Game, p: Player) => (p.dousing ? 'douseStop' : g.stations[p.chopAt]?.kind === 'sink' ? 'washStop' : g.stations[p.chopAt]?.kind === 'pot' ? 'foldStop' : 'chopStop');

function startSlip(g: Game, p: Player) {
  const sp = SLIP[g.difficulty];
  const vx = p.vx + p.kx, vy = p.vy + p.ky;
  const fast = Math.hypot(vx, vy) >= SLIP_MIN_SPEED * SPEED;
  const [dx, dy] = fast ? unit(vx, vy) : unit(p.fx, p.fy);
  const dist = sp.dist + (p.dashMs > 0 ? SLIP_DASH_EXTRA : 0);
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
function slipStep(g: Game, p: Player, c: Controls, dtMs: number) {
  const sl = p.slip!;
  const tune = g.params.tune;
  p.dashCd = Math.max(0, p.dashCd - dtMs);
  const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
  p.bHeld = c.b;
  p.buffA = 0; // the stick and A are ignored; B does not dash now, but it is remembered like any early press (R6) and goes off when the chef is up
  if (bEdge) p.buffB = tune.bufferMs; else p.buffB = Math.max(0, p.buffB - dtMs);
  const f = (s: number) => 2 * s - s * s;
  const s0 = Math.min(1, Math.max(0, (g.time - dtMs - sl.t0) / sl.slideMs)), s1 = Math.min(1, Math.max(0, (g.time - sl.t0) / sl.slideMs));
  const step = sl.dist * (f(s1) - f(s0));
  if (step > 0 && !sl.stopped) {
    const ox = p.x, oy = p.y;
    if (!blocked(g, p.x + sl.dir[0] * step, p.y)) p.x += sl.dir[0] * step;
    if (!blocked(g, p.x, p.y + sl.dir[1] * step)) p.y += sl.dir[1] * step;
    if (p.x === ox && p.y === oy) { sl.stopped = true; } // a wall or a station: it stops dead (no extra damage)
    const v = (2 * sl.dist / (sl.slideMs / 1000)) * (1 - s1);
    for (const o of g.players.values()) { // a chef in the way gets half the slider's speed, once, and never slips from it
      if (o.id === p.id || o.ghost || o.cutting || sl.hit.includes(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > 2 * RADIUS + 0.1) continue;
      sl.hit.push(o.id);
      o.kx += sl.dir[0] * v * SLIP_PUSH; o.ky += sl.dir[1] * v * SLIP_PUSH;
      g.bus.emit('bump', { player: p.id, other: o.id });
    }
  }
  const fade = Math.exp(-dtMs / KNOCK_FADE_MS);
  p.kx = Math.abs(p.kx) < 0.02 ? 0 : p.kx * fade; p.ky = Math.abs(p.ky) < 0.02 ? 0 : p.ky * fade;
  if (g.time - sl.t0 >= sl.slideMs + sl.recoverMs - 1e-6) {
    p.slip = null; p.vx = 0; p.vy = 0;
    g.bus.emit('chef:recover', { chef: p.id, team: p.team, wall: sl.stopped });
  }
}

// The chef that loaded the catapult stands there (anchored: no walking, no dash) until it throws with B; A does nothing.
function aimStep(g: Game, p: Player, c: Controls, dtMs: number) {
  p.dashCd = Math.max(0, p.dashCd - dtMs);
  const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
  p.bHeld = c.b;
  Object.assign(p, { vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0, buffA: 0, buffB: 0 });
  if (bEdge) sabotageAimPress(g, p);
}

// End of the tick (hazards only): rubbish that ran out disappears, and a chef that ENTERED a rubbish tile slips.
function hazardsTick(g: Game) {
  for (const f of [...g.floor]) if (g.time >= f.expiresAt) {
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
  let best: FloorItem | null = null, bestKey = Infinity;
  for (const f of g.floor) {
    if (f.team !== p.team) continue;
    const dx = f.tx + 0.5 - p.x, dy = f.ty + 0.5 - p.y, d = Math.hypot(dx, dy);
    if (d > 1.1 || (d > 0.6 && (dx * p.fx + dy * p.fy) / (len * d) < 0.5)) continue;
    const key = d * 1000 + (f.kind === 'dropped' ? 0 : 1) * 10 + f.id * 1e-6;
    if (key < bestKey) { best = f; bestKey = key; }
  }
  return best;
}
// A: pick up what lies on the floor near the chef (rubbish or a dropped item), when its hands are empty and no station is in front of it.
function pickFloor(g: Game, p: Player): boolean {
  const best = floorItemNear(g, p);
  if (!best) return false;
  removeFloorItem(g, best.id);
  p.item = best.item;
  g.bus.emit('trash:picked', { player: p.id, team: p.team, tile: [best.tx, best.ty], item: best.item, kind: best.kind });
  return true;
}

// The station in front of the chef, among the ones it may use (its own team's, or shared).
export function targetStation(g: Game, p: Player, plain = false): Station | null { // plain: the old probe even with the magnet on (what blocks a dash)
  if (p.assist) return assistStation(g, p);
  if (g.magnet && !plain) return magnetStation(g, p);
  const len = Math.hypot(p.fx, p.fy) || 1;
  const px = p.x + (p.fx / len) * REACH;
  const py = p.y + (p.fy / len) * REACH;
  let best: Station | null = null;
  let bestD = REACH_SLACK;
  for (const s of g.stations) {
    if (s.owner !== null && s.owner !== p.team) continue; // another team's kitchen: its stations are not there for this chef
    const d = Math.hypot(px - Math.max(s.tx, Math.min(px, s.tx + 1)), py - Math.max(s.ty, Math.min(py, s.ty + 1)));
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

// What A acts on: the target station, unless (magnetism, hazards) the chef faces a piece of rubbish at least as much as that station (feel/magnet.ts floorWins).
export function aStation(g: Game, p: Player): Station | null {
  const s = targetStation(g, p);
  return s && g.magnet && g.hazards && floorWins(p, s, floorItemNear(g, p)) ? null : s;
}

// Ayudante (assist.ts): the nearest usable station within ASSIST_REACH_MULT times the usual radius, whichever way the chef faces (a near tie goes to the one it
// already faces), and never through a wall. The normal rule measures from a probe in front of the chef; this one from the chef's centre to the station's tile.
const nearestPoint = (p: Player, s: Station): [number, number] => [Math.max(s.tx, Math.min(p.x, s.tx + 1)), Math.max(s.ty, Math.min(p.y, s.ty + 1))];
function assistStation(g: Game, p: Player): Station | null {
  const reach = (REACH + REACH_SLACK) * (ASSIST_REACH_MULT + (g.magnet?.assistExtra ?? 0));
  const len = Math.hypot(p.fx, p.fy) || 1;
  let best: Station | null = null, bestKey = Infinity;
  for (const s of g.stations) {
    if (s.owner !== null && s.owner !== p.team) continue;
    const [nx, ny] = nearestPoint(p, s);
    const dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
    if (d > reach) continue;
    let clear = true; // a wall (or another station) between the chef and the point it would reach blocks it
    for (let t = 0.05; t < 0.96 && clear; t += 0.05) { const tx = Math.floor(p.x + dx * t), ty = Math.floor(p.y + dy * t); if ((tx !== s.tx || ty !== s.ty) && isSolid(g, tx, ty)) clear = false; }
    if (!clear) continue;
    const key = d - ASSIST_FACING_BONUS * (d > 1e-6 ? (dx * p.fx + dy * p.fy) / (len * d) : 1);
    if (key < bestKey) { best = s; bestKey = key; }
  }
  return best;
}
// Ayudante: is the stick pushing into the station (within 60 degrees of the way to it)? Walking into what you are chopping is not walking away.
function pushesInto(p: Player, s: Station, c: Controls) {
  const [nx, ny] = nearestPoint(p, s);
  const dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy), m = Math.hypot(c.x, c.y);
  return d > 1e-6 && m > 1e-6 && (c.x * dx + c.y * dy) / (m * d) > 0.5;
}
// Ayudante, stick idle: the chef turns to the station it will use (the screen draws it facing it).
function faceStation(p: Player, s: Station) {
  const [nx, ny] = nearestPoint(p, s);
  const dx = nx - p.x, dy = ny - p.y;
  if (Math.hypot(dx, dy) > 1e-6) { const [ux, uy] = unit(dx, dy); p.fx = ux; p.fy = uy; }
}

// A pizza cooks once it has dough and tomato; cheese can still go on until it is done (then it is a Margarita).
const baked = (s: Station) => s.inputs.includes(0) && s.inputs.includes(1);

function interact(g: Game, p: Player, s: Station) {
  if (s.fire !== undefined) return; // on fire: nothing works until it is put out
  switch (s.kind) {
    case 'crate':
      if (p.item) break;
      if (s.pantry) { // the shared pantry: a unit of the common stock, or nothing when it ran out (the other team may have emptied it)
        const pantry = g.pantry!;
        if (pantry.stock <= 0) break;
        if (pantry.stock === PANTRY_MAX) pantry.nextAt = g.time + PANTRY_EVERY_MS; // the refill clock starts when the stock leaves the maximum
        pantry.stock--;
      }
      p.item = crateItem(g, s.crate);
      break;
    case 'plates':
      if (!g.finitePlates) { if (!p.item) p.item = 'plate'; }
      else if (!p.item) { if (s.count > 0) { s.count--; p.item = 'plate'; } }
      else if (p.item === 'plate') { s.count++; p.item = null; } // put a clean plate back on the pile
      break;
    case 'dirty': // return window: take one dirty plate
      if (!p.item && s.count > 0) { s.count--; p.item = 'dirty'; }
      break;
    case 'sink':
      if (p.item === 'dirty') { s.count++; p.item = null; }
      else if (p.item === 'plate') { s.clean++; p.item = null; } // the sink also works as a pile of clean plates
      else if (!p.item && s.clean > 0) { s.clean--; p.item = 'plate'; }
      break;
    case 'counter':
      if (p.item && !s.item) { s.item = p.item; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; }
      break;
    case 'board':
      if (p.item && !s.item && cutOf(p.item)) { s.item = p.item; s.progress = 0; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; s.progress = 0; }
      break;
    case 'pot': {
      const t = cutType(p.item);
      if (t >= 0 && !s.done && !s.folded && !s.inputs.includes(t) && s.inputs.length < 3) {
        s.inputs.push(t);
        if (!baked(s)) s.progress = 0;
        p.item = null;
      } else if (p.item === 'plate' && s.done) {
        if (g.burn && s.warned && !s.burnt) g.bus.emit('oven:rescued', { player: p.id, station: g.stations.indexOf(s), ...tag(g, s.owner) }); // out of the oven after the warning, before it burnt
        p.item = s.burnt ? 'burnt' : dishFor(s.inputs, !!s.folded);
        clearPot(s);
      }
      break;
    }
    case 'trash':
      if (g.sab && !p.item) { sabotageTakeBag(g, p); break; } // sabotage: empty hands take the bag that is waiting
      if (g.finitePlates && (p.item === 'plate' || p.item === 'dirty')) break; // plates are not rubbish: they would be lost for good
      if (g.finitePlates && (isDish(p.item) || p.item === 'burnt')) g.teams[p.team]!.dirtyDue.push(g.time + DIRTY_MS); // the plate under the pizza comes back
      if (g.sab && p.item) sabotageBinned(g, p, p.item); // what is binned feeds the team's catapult
      p.item = null;
      break;
    case 'catapult':
      if (g.sab) sabotageLoad(g, p, s);
      break;
    case 'window':
      if (isDish(p.item) && g.teams[p.team]!.orders.length) {
        const team = g.teams[p.team]!;
        const at = pickOrder(g, team.orders, p.item!); // recipes/sim.ts: the golden order first, then the birthday one, then the order that asked for this plate (a Margarita also satisfies a Marinara order, never the other way round)
        if (at < 0) { // R16: the wrong plate is refused, goes back dirty and pays nothing
          if (g.finitePlates) team.dirtyDue.push(g.time + DIRTY_MS);
          p.item = null;
          team.rejected++;
          resetStreak(g, team);
          g.bus.emit('dishRejected', { player: p.id, ...tag(g, team.id) });
          break;
        }
        const o = team.orders.splice(at, 1)[0]!;
        const { tune, orderTtlMs } = g.params;
        const birthday = !!o.birthday; // the event's order: BIRTHDAY_POINTS flat, no tip (the streak still counts)
        const base = birthday ? BIRTHDAY_POINTS : recipeBase(o.recipe, tune); // R13
        const left = Math.min(1, Math.max(0, o.expiresAt - g.time) / orderTtlMs);
        const mult = birthday ? 1 : tipMultiplier(team.streak, tune); // R15: the streak multiplies only the tip
        const tip = birthday ? 0 : Math.round(base * tune.tipPct * left) * mult; // R14: up to +50% of the base, by the patience left
        const vip = !!o.vip; // won the golden order: x2. Another team delivering it in this same tick wins it too (settleVip runs at the end of the tick)
        const raw = (base + tip) * (vip ? VIP_MULT : 1);
        const gain = Math.round(raw * team.k); // the handicap k of this instant
        team.score += gain;
        team.gross += raw;
        team.reachedAt = g.time;
        team.tips += tip;
        team.delivered++;
        team.streak++;
        team.bestStreak = Math.max(team.bestStreak, team.streak);
        if (g.finitePlates) team.dirtyDue.push(g.time + DIRTY_MS);
        p.item = null;
        g.bus.emit('delivered', { player: p.id, points: gain, tip, base, mult, ...(g.versus ? { team: team.id, k: team.k, ...(vip ? { vip: true as const } : {}) } : {}) });
        g.bus.emit('streak', { n: team.streak, mult: tipMultiplier(team.streak, tune), ...tag(g, team.id) });
        if (vip) {
          const round = g.vip.round!;
          team.vips++;
          round.winners.push({ team: team.id, at: g.time });
          g.bus.emit('vipWon', { team: team.id, player: p.id, tie: round.winners.length > 1 });
        }
      }
      break;
  }
}

function resetStreak(g: Game, team: TeamState) {
  if (team.streak === 0) return;
  team.streak = 0;
  g.bus.emit('streak', { n: 0, mult: 1, ...tag(g, team.id) });
}

// Runs one A press and reports what happened as events.
function act(g: Game, p: Player, s: Station) {
  const team = g.teams[p.team]!;
  const before = { held: p.item, shelf: s.item, baked: baked(s), done: s.done, delivered: team.delivered, rejected: team.rejected };
  interact(g, p, s);
  if (team.delivered !== before.delivered || team.rejected !== before.rejected) return; // 'delivered' or 'dishRejected' already emitted
  if (!before.held && p.item) g.bus.emit('itemPicked', { player: p.id, item: p.item, from: s.kind });
  else if (before.held && !p.item) g.bus.emit('itemDropped', { player: p.id, item: before.held, at: s.kind });
  else g.bus.emit('interactInvalid', { player: p.id });
  if (s.kind === 'pot' && !before.baked && baked(s)) g.bus.emit('potStart', { station: g.stations.indexOf(s), ...tag(g, s.owner) });
}

function countdown(g: Game, dtMs: number) {
  const prev = Math.ceil(g.countdown / 1000);
  if (!g.counting) { g.counting = true; g.bus.emit('countdownTick', { n: prev, kind: 'start' }); }
  g.countdown = Math.max(0, g.countdown - dtMs);
  const now = Math.ceil(g.countdown / 1000);
  if (now !== prev) g.bus.emit('countdownTick', { n: now, kind: 'start' });
}

// The two mid-round events that touch the queues: a rush is three orders in every queue (drawn at every slot, so the twin queues stay twins); the birthday order is worth BIRTHDAY_POINTS flat.
const MID_FX: MidFx = {
  rush(g) { for (const t of g.teams) for (let i = 0; i < RUSH_ORDERS; i++) spawnOrder(g, t, true); },
  birthday(g) {
    for (const t of g.teams) {
      const o: Order = { id: t.orderSeq++, expiresAt: g.time + g.params.orderTtlMs, warned: false, recipe: 'marinara', birthday: true };
      if (t.orders.length >= EVENT_MAX_QUEUE) t.orders.unshift(o); else t.orders.push(o); // a full strip still shows it
      g.bus.emit('orderNew', { order: o.id, recipe: 'marinara', ...tag(g, t.id), birthday: true });
    }
  },
};

export function tick(g: Game, controls: Map<number, Controls>, dtMs = TICK_MS) {
  if (g.over) return;
  if (g.countdown > 0) { countdown(g, dtMs); return; }
  if (!g.started) { g.started = true; g.bus.emit('roundStart', {}); }
  if (g.versus && !refreshRoster(g)) return; // an empty team stopped the clock
  const dt = dtMs / 1000;
  g.time += dtMs;

  for (const p of g.players.values()) {
    if (p.ghost) continue;
    const c = controls.get(p.id) ?? idleControls;
    if (g.hazards && p.slip) { slipStep(g, p, c, dtMs); continue; } // sliding: the stick and the buttons do nothing
    if (g.sab && isAiming(g, p)) { aimStep(g, p, c, dtMs); continue; } // loaded the catapult: anchored there until B (or 3 s)
    const tune = g.params.tune;
    const target = targetStation(g, p);
    if (p.assist && target && !c.x && !c.y) faceStation(p, target); // Ayudante: turns to its station by itself
    p.dashCd = Math.max(0, p.dashCd - dtMs);
    const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
    p.bHeld = c.b;
    const wasCutting = p.cutting, wasDousing = !!p.dousing;
    // B held: cut / grate / stretch on a board with a raw item, or scrub plates at a sink with dirty ones; with a fire in front (burn only), put it out
    const burning = !!(g.burn && target && target.fire !== undefined);
    const cuttable = !!(target && ((target.kind === 'board' && target.item && cutOf(target.item)) || (target.kind === 'sink' && target.count > 0) || burning || canFold(g, target)));
    if (g.magnet && target && !p.assist) magnetPull(g, p, target, cuttable && (c.b || (c.bTaps ?? 0) > 0), !c.x && !c.y, dtMs); // magnetism: Picar turns the chef to its board (or the oven it folds at); a slow chef beside a station drifts to face it
    if (p.assist) { // Ayudante: a tap of B starts the chop (or the extinguisher: the same latch, it goes on until the fire is out) and it goes on while the chef stays and there is something to do; the stick (or the item being done) ends it
      if (bEdge && cuttable) p.chopLatch = true;
      else if (p.chopLatch && (!cuttable || (Math.hypot(c.x, c.y) > ASSIST_STICK_CANCEL && !pushesInto(p, target!, c)))) p.chopLatch = false;
    }
    p.cutting = !!((c.b || p.chopLatch) && cuttable);
    if (g.burn) p.dousing = p.cutting && burning;
    const at = target ? g.stations.indexOf(target) : -1;
    const wasAt = p.chopAt;
    if (wasCutting && (!p.cutting || at !== wasAt)) g.bus.emit(wasDousing ? 'douseStop' : g.stations[wasAt]?.kind === 'sink' ? 'washStop' : g.stations[wasAt]?.kind === 'pot' ? 'foldStop' : 'chopStop', { player: p.id, station: wasAt });
    if (p.cutting && (!wasCutting || at !== wasAt)) g.bus.emit(p.dousing ? 'douseStart' : target!.kind === 'sink' ? 'washStart' : target!.kind === 'pot' ? 'foldStart' : 'chopStart', { player: p.id, station: at });
    p.chopAt = p.cutting ? at : -1;
    if (p.cutting) { p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0; p.dashMs = 0; }
    // R2 + R6: a B press with free hands and nothing in front is a dash; if the cooldown ends within bufferMs it still goes
    const free = !p.item && !(g.magnet && !p.assist ? cuttable || targetStation(g, p, true) : target) && !p.cutting; // magnetism: only what the old probe finds (or a chop) stops a dash
    const ready = p.dashMs <= 0 && p.dashCd <= 0;
    if (!free) p.buffB = 0;
    else if (bEdge && ready) startDash(g, p, c);
    else if (bEdge) p.buffB = tune.bufferMs;
    else if (p.buffB > 0 && ready) { startDash(g, p, c); p.buffB = 0; }
    else p.buffB = Math.max(0, p.buffB - dtMs);
    if (p.cutting && target?.kind === 'sink') {
      target.progress += dtMs / WASH_MS;
      if (target.progress >= 1) {
        target.count--; target.clean++;
        target.progress = 0;
        g.bus.emit('washDone', { player: p.id, station: at });
      }
    } else if (p.cutting && target && p.dousing) {
      douse(g, p.id, target, dtMs); // the fire is out when the Picar of the chefs in front of it adds up to DOUSE_MS
    } else if (p.cutting && target?.kind === 'pot') { foldStep(g, p.id, target, dtMs); // recipes/sim.ts: Picar at an oven with dough and tomato folds the calzone
    } else if (p.cutting && target) {
      target.progress += dtMs / cutMsOf(g, target.item);
      if (target.progress >= 1) {
        target.item = cutOf(target.item!);
        target.progress = 0;
        g.bus.emit('chopDone', { player: p.id, station: at });
      }
    } else {
      if (c.x || c.y) { p.fx = c.x; p.fy = c.y; }
      if (p.dashMs > 0) {
        const v = SPEED * g.params.tune.dashMult;
        p.vx = p.dashDx * v; p.vy = p.dashDy * v;
        p.dashMs = Math.max(0, p.dashMs - dtMs);
        if (p.dashMs <= 0 && !(g.magnet && (p.dashMs = magnetHug(g, p, v, TICK_MS)) > 0)) { p.vx = p.dashDx * SPEED; p.vy = p.dashDy * SPEED; } // back to walking pace; R1 takes it from there (magnetism: a station right ahead keeps the dash going until it touches it)
      } else steer(p, c, g, dtMs);
      const slow = p.crossing ? g.params.tune.yieldSpeed : 1;
      const nx = p.x + (p.vx + p.kx) * dt * slow;
      if (!blocked(g, nx, p.y)) p.x = nx; else { p.vx = 0; p.kx = 0; }
      const ny = p.y + (p.vy + p.ky) * dt * slow;
      if (!blocked(g, p.x, ny)) p.y = ny; else { p.vy = 0; p.ky = 0; }
      const fade = Math.exp(-dtMs / KNOCK_FADE_MS);
      p.kx = Math.abs(p.kx) < 0.02 ? 0 : p.kx * fade;
      p.ky = Math.abs(p.ky) < 0.02 ? 0 : p.ky * fade;
      if (p.dashMs > 0) pushNeighbours(g, p);
    }
    // R6: an A press with no station in front waits bufferMs for one to show up
    if (c.a > 0) { p.buffA += c.a; p.buffAge = 0; }
    while (p.buffA > 0) {
      const s = aStation(g, p);
      if (!s) {
        if (g.hazards && pickFloor(g, p)) { p.buffA--; continue; } // nothing in front: whatever lies on the floor close by
        break;
      }
      p.buffA--;
      if (g.magnet) magnetFace(p, s); // Tomar turns the chef to what it takes
      act(g, p, s);
    }
    if (p.buffA > 0) { p.buffAge += dtMs; if (p.buffAge > tune.bufferMs) p.buffA = 0; }
  }

  separate(g, controls, dtMs);
  if (g.hazards) hazardsTick(g);
  if (g.sab) sabotageTick(g);
  settleVip(g);

  const dark = isDark(g); // the "Corte de luz" event: the ovens do not cook
  for (const s of g.stations) {
    if (s.kind === 'pot' && !s.done && baked(s) && !dark) {
      s.progress += dtMs / cookMsOf(g, s);
      if (s.progress >= 1) { s.progress = 1; s.done = true; if (g.burn) s.readyAt = g.time; g.bus.emit('potReady', { station: g.stations.indexOf(s) }); }
    }
  }
  if (g.burn) burnTick(g, dtMs);
  if (g.mid) midTick(g, dtMs, MID_FX);

  for (const team of g.teams) while (team.dirtyDue.length && team.dirtyDue[0]! <= g.time) { // delivered plates come back dirty, to the team's own return
    team.dirtyDue.shift();
    const back = g.stations.filter((s) => s.kind === 'dirty' && s.owner === team.id).sort((a, b) => a.count - b.count)[0];
    if (back) { back.count++; g.bus.emit('dirtyNew', { station: g.stations.indexOf(back), ...tag(g, team.id) }); }
  }

  const pantry = g.pantry;
  while (pantry && pantry.stock < PANTRY_MAX && g.time >= pantry.nextAt) {
    pantry.stock++;
    pantry.nextAt = pantry.stock < PANTRY_MAX ? pantry.nextAt + PANTRY_EVERY_MS : Infinity;
    g.bus.emit('pantryRefill', { stock: pantry.stock });
  }

  if (g.versus && g.time >= g.vip.nextAt) spawnVip(g);
  for (const team of g.teams) {
    if (g.time >= team.nextOrderAt) {
      spawnOrder(g, team);
      team.nextOrderAt += g.params.orderEveryMs;
    }
    const alive = team.orders.filter((o) => o.expiresAt > g.time);
    for (const o of team.orders) if (!alive.includes(o)) g.bus.emit('orderExpired', { order: o.id, ...tag(g, team.id) });
    const lost = team.orders.length - alive.length;
    const before = team.score;
    team.score = Math.max(0, team.score + lost * g.params.penalty); // the penalty is not multiplied by k
    if (team.score !== before) team.reachedAt = g.time;
    if (lost) { team.expired += lost; resetStreak(g, team); }
    team.orders = alive;
    for (const o of alive) if (!o.warned && o.expiresAt - g.time < WARNING_MS) { o.warned = true; g.bus.emit('orderWarning', { order: o.id, ...tag(g, team.id) }); }
  }

  const left = Math.ceil((g.params.roundMs - g.time) / 1000);
  if (left <= 10 && left > 0 && left < g.endTick) { g.endTick = left; g.bus.emit('countdownTick', { n: left, kind: 'end' }); }
  if (g.time >= g.params.roundMs) finish(g, false);
}

const resultOf = (t: TeamState): TeamResult => ({ teamId: t.id, score: t.score, delivered: t.delivered, vip: t.vips, reachedAt: t.reachedAt });

// Ends the round: ranks the teams (score, deliveries, VIPs, who got there first; a draw has no winner). `aborted`: the host ended it from the pause.
function finish(g: Game, aborted: boolean) {
  g.over = true;
  const { order, winner } = rankTeams(g.teams.map(resultOf));
  g.result = { order, winner: aborted || g.noWinner ? null : winner, aborted };
  if (!g.versus) { g.bus.emit('roundEnd', { score: g.score, delivered: g.delivered }); return; }
  const lead = order[0]!;
  g.bus.emit('roundEnd', { score: lead.score, delivered: lead.delivered, winner: g.result.winner, results: order });
}

// --- Chefs that drop (versus; teams.ts has the policy) -------------------------------------------------------------------------
// Each tick before the clock moves: a chef whose grace time ran out leaves the kitchen, k follows the chefs that still hold a place,
// and a team with nobody stops the clock until the host picks. Returns false while the match is paused.
function refreshRoster(g: Game): boolean {
  if (g.paused) return false;
  for (const e of g.roster) {
    if (e.droppedAt === null || holdsPlace(e, g.time) || !g.players.has(e.id)) continue;
    g.players.delete(e.id);
    for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(e.id))) g.crowd.delete(k);
    g.bus.emit('playerGone', { player: e.id, team: e.teamId });
  }
  const st = matchStatus(g.teams.map((t) => t.id), g.roster, g.time, g.handicap ? 'score-k' : 'none');
  if (st.paused && !g.pauseDismissed) {
    g.paused = { teams: st.emptyTeams };
    g.bus.emit('matchPaused', { teams: st.emptyTeams });
    return false;
  }
  g.teams.forEach((t, i) => {
    if (st.k[i] === t.k) return;
    t.k = st.k[i]!;
    g.bus.emit('teamK', { team: t.id, k: t.k });
  });
  return true;
}

/**
 * The chef's phone dropped. It stays as a ghost (no body, no input, no interaction) for GHOST_MS of match time; what it held goes to the
 * nearest free counter of its kitchen (it keeps it when none is free). False when it was not playing or was already down.
 */
export function dropPlayer(g: Game, id: number): boolean {
  const p = g.players.get(id);
  const e = g.roster.find((r) => r.id === id);
  if (!p || !e || e.droppedAt !== null) return false;
  if (p.cutting) g.bus.emit(stopKind(g, p), { player: id, station: p.chopAt });
  e.droppedAt = g.time;
  if (p.assist) p.chopLatch = false;
  Object.assign(p, { ghost: true, cutting: false, chopAt: -1, vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0, buffA: 0, buffB: 0, crossing: false });
  if (p.dousing) p.dousing = false;
  if (p.slip) p.slip = null; // hazards only: the slide ends where it was
  if (g.sab) sabotageCancelAim(g, p); // the bag it had loaded goes back to its team's bin
  for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(id))) g.crowd.delete(k);
  if (p.item) {
    const free = g.stations.filter((s) => s.kind === 'counter' && !s.item && s.fire === undefined && (s.owner === null || s.owner === p.team));
    const near = free.sort((a, b) => Math.hypot(a.tx + 0.5 - p.x, a.ty + 0.5 - p.y) - Math.hypot(b.tx + 0.5 - p.x, b.ty + 0.5 - p.y))[0];
    if (near) { near.item = p.item; p.item = null; }
  }
  g.bus.emit('playerDropped', { player: id, team: p.team });
  return true;
}

/** The phone is back. True when the chef is still in the match (within GHOST_MS): same team, same chef. False: too late, it watches. */
export function rejoinPlayer(g: Game, id: number): boolean {
  const p = g.players.get(id);
  const e = g.roster.find((r) => r.id === id);
  if (!p || !e || e.droppedAt === null || !holdsPlace(e, g.time)) return false;
  e.droppedAt = null;
  p.ghost = false;
  g.bus.emit('playerBack', { player: id, team: p.team });
  return true;
}

/** The host's answer to an empty team: carry on without a winner, or end the round now (also without one). */
export function resolvePause(g: Game, choice: PauseChoice) {
  if (!g.paused) return;
  g.paused = null;
  if (choice === 'end') { finish(g, true); return; }
  g.noWinner = true;
  g.pauseDismissed = true;
  g.bus.emit('matchResumed', {});
}
