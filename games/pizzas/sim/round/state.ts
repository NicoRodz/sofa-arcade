// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
// The state of a round: constants, items, stations, chefs, orders, teams, and the Game that holds them.
import { MAP_H, MAP_W, isFloor, type Grid, type SigmaName } from '../maps';
import type { RosterEntry, TeamId, TeamResult } from '@pichi/core/lobby';
import type { Difficulty, Params, Rng } from '@pichi/core';
import type { Emitter, GameEvents } from './events';
import type { Station, Player, Order } from './entities';
import type { FloorItem, Sabotage } from '../sabotage-config';
import type { Recipe, Rec } from '../recipes/types';
import type { Ev2 } from '../ev2/types';
import type { Burn, Ledger, Mid } from '../rules/types';
import type { MagnetCfg } from '../feel/types';
import type { Mutate } from '../mutate/types';
import type { MechState } from '../mech/state';
import type { MechFlags } from '../mech/ids';
import type { RatFrame } from '../feel/rat-frame';
import type { SurfaceState } from '../surfaces/config';
import type { Kitchens } from '../versus/versus';

export type { Item } from './item';
export type { Station, Player, Order, Controls } from './entities';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile

export const COLS = MAP_W;
export const ROWS = MAP_H;
export const MAX_SLOTS = 8;

/** The single-team fields of a round that read and write team 0's (createGame defines them as live views of it). */
export const LEGACY = [
  'score',
  'delivered',
  'streak',
  'bestStreak',
  'tips',
  'expired',
  'rejected',
  'orders',
  'rng',
  'dirtyDue',
  'nextOrderAt',
  'orderSeq',
] as const;
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
  hz: boolean; // HAZARD_V2 numbers under the flags (create option `hazards`, default on)
  caves: { at: readonly (readonly [number, number])[]; seed: number } | null; // HAZARD_V3 map 15: the rat comes in by one cave and leaves by the other (feel/rat-caves.ts)
  hz3: boolean; // HAZARD_V3 (hazards/hazard-v3.ts): the harder numbers of the hazards and the penalties; off unless the round asks (create option `hazardsV3`)
  vz3: { sigma?: SigmaName; seed: number } | null; // VERSUS_V3 (feel/rat-versus.ts): the rat per kitchen and the Ola de frio in a versus round; null unless the round asks (`versusV3`, versus only)
  ratFrame?: RatFrame; // VERSUS_V3: set on the view of kitchen 0 (feel/rat-frame.ts), so its rat breaks ties as kitchen 1's does
  ledger: Ledger | null; // the score book by source (hazards/score-ledger.ts): only a round with hazardsV3 or `ledger: true` keeps one
  burn: Burn | null; // the oven that burns and the fire (burn.ts): null (the default, and every golden round) = the oven never burns
  mid: Mid | null; // the event in the middle of the round (midround.ts): null (the default) = none
  rec: Rec | null; // the Carta del día of the round (recipes/sim.ts): null (the default) = the old recipes (Marinara, Margarita)
  assist: ReadonlySet<number>; // ids of the chefs that play on Ayudante (assist.ts); empty in a round that has none
  frostEvent: boolean; // the Ola de frio event is in the pool of this round's events (the lobby turns it on; the golden rounds never see it)
  upgrades: boolean; // `upgradeOrders`: the Pizza de la casa with upgrades (recipes/casa.ts); false (the default) = the card drops it
  slices: boolean; // `sliceAfterBake`: a casa plate can be cut into portions on a board
  compound: boolean; // `compoundOrders`: the Bandeja familiar (recipes/bandeja.ts), coop only
  adaptive: boolean; // adaptive pacing (recipes/pacing.ts): orders come by the load of the queue, not by the clock; false (the default) = the old schedule
  surf: SurfaceState | null; // ice and belts (surfaces/): null (the default, and every golden round) = every floor tile is plain
  mut: Mutate | null; // the kitchen that mutates at 1:30 (mutate/): null (the default, and every golden round) = the map never changes
  magnet: MagnetCfg | null; // magnetism for every chef (feel/magnet.ts): null (the default, and every golden round) = the plain targeting and feel
  // map mechanics (mech/): BOTH keys are absent unless some flag is on, so a round without them is the round of before, key for key
  flags?: { mech: MechFlags }; // flags.mech.<id>, off by default; the lobby turns on the ones a map declares
  ev2?: Ev2; // EVENTS_V2 (ev2/state.ts): the events with presence; absent unless the round asked for `eventsV2` (coop with events)
  mech?: MechState; // the state of the active mechanics (their slices, and the hash of them)
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
export interface Pantry {
  stock: number;
  nextAt: number;
}
export interface VipRound {
  recipe: Recipe;
  winners: { team: TeamId; at: number }[];
  settled: boolean;
}
export interface MatchResult {
  order: TeamResult[];
  winner: TeamId | null;
  aborted: boolean;
} // aborted: the host ended it from the pause

export const isSolid = (g: Game, tx: number, ty: number) => !isFloor(g.grid, tx, ty);

// {} in coop (one team): the events keep their old shape. Versus adds the team.
export const tag = (g: Game, team: TeamId | null): { team?: number } => (g.versus && team !== null ? { team } : {});

export interface TeamSeat {
  playerIds: readonly number[];
} // a declared team: the chefs that play for it (TeamInfo from teams.ts fits). Team id = position.
