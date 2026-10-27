// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
// The state of a round: constants, items, stations, chefs, orders, teams, and the Game that holds them.
import { MAP_H, MAP_W, isFloor, type Grid, type StationKind } from '../maps';
import type { RosterEntry, TeamId, TeamResult } from '@pichi/core/lobby/teams';
import type { FloorItem, Sabotage, Slip } from '../sabotage-config';
import type { Recipe } from '../recipes/defs';
import type { Emitter, GameEvents } from '@pichi/core/events';
import type { Difficulty, Params } from '@pichi/core/difficulty';
import type { Rng } from '@pichi/core/rng';
import type { Kitchens } from '../versus/versus';
import type { Burn } from '../burn';
import type { Mid } from '../midround';
import type { Rec } from '../recipes/sim';
import type { MagnetCfg } from '../feel/magnet';
import type { SurfaceState } from '../surfaces/config';
import type { Mutate } from '../mutate/step';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile

// raw2/cut2 = cheese (Margarita), raw3/cut3 = pepperoni, raw4/cut4 = mushroom (a round with a Carta del día: the cheese crate gives the card's topping). dishQ / dishP / dishM = a pizza that baked with cheese / pepperoni / mushroom, dishC = a folded calzone, dishPQ = pepperoni and cheese together (two topping crates).
// trash / trashBag exist only in a round with hazards on (sabotage): rubbish picked off the floor, and the bag a team throws.
// burnt: a pizza that burnt in the oven (a round with `burn` on), taken on a plate: it cannot be delivered, it goes to the bin.
export type Item =
  | 'raw0'
  | 'raw1'
  | 'raw2'
  | 'raw3'
  | 'raw4'
  | 'cut0'
  | 'cut1'
  | 'cut2'
  | 'cut3'
  | 'cut4'
  | 'plate'
  | 'dish'
  | 'dishQ'
  | 'dishP'
  | 'dishM'
  | 'dishPQ'
  | 'dishC'
  | 'dirty'
  | 'trash'
  | 'trashBag'
  | 'burnt';

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
  fold?: number;
  folded?: true; // a round with a Carta del día, pot only: 0..1 of Picar folding the dough and tomato; folded = a calzone (it bakes longer)
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
export interface Order {
  id: number;
  expiresAt: number;
  warned: boolean;
  recipe: Recipe;
  vip?: boolean;
  birthday?: boolean;
} // birthday: the mid-round event's order, worth BIRTHDAY_POINTS flat
// a = new A presses since last tick; bTaps = new B presses since last tick (a quick tap can start and end between two ticks)
export interface Controls {
  x: number;
  y: number;
  a: number;
  b: boolean;
  bTaps?: number;
}
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
  adaptive: boolean; // adaptive pacing (recipes/pacing.ts): orders come by the load of the queue, not by the clock; false (the default) = the old schedule
  surf: SurfaceState | null; // ice and belts (surfaces/): null (the default, and every golden round) = every floor tile is plain
  mut: Mutate | null; // the kitchen that mutates at 1:30 (mutate/): null (the default, and every golden round) = the map never changes
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
