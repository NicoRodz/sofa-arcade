// Versus sabotage (plan versus-sabotaje-basura): constants, types and the event contract. Pure data: no clock, no I/O, no logic.
// A team that feeds its bin builds up "desechos"; three of them are a bag of rubbish. The bag is carried to the catapult of the kitchen
// ('Y' in a versus map), loaded with A, aimed with a sweeping reticle and thrown with B over the barrier. It lands as a banana-skin on
// the rival floor: a chef who steps on it slips (a short slide with no control) and drops what it carries; the rival team picks the
// rubbish up and bins it, which feeds ITS catapult.
// Everything here is deterministic: the reticle is a function of the aim time, the landing tile is adjusted by a BFS in a fixed frame,
// nothing draws from an RNG (if it ever must, it goes in a substream: seed XOR SABOTAGE_SEED_TAG, never the orders' stream).
import type { Difficulty } from '@pichi/core/difficulty';
import type { Item } from './round/state';
import type { Pos, SigmaName } from './maps';

export const SABOTAGE_SEED_TAG = 0x5ab07a6e; // reserved for a substream: unused today

export type SabotageMode = 'off' | 'soft' | 'chaos';
export const SABOTAGE_MODES: readonly SabotageMode[] = ['off', 'soft', 'chaos'];
export const isSabotageMode = (v: unknown): v is SabotageMode => SABOTAGE_MODES.includes(v as SabotageMode);
export const SABOTAGE_LABEL: Record<SabotageMode, string> = { off: 'Apagado', soft: 'Suave', chaos: 'Caos' };
export const SABOTAGE_BLURB: Record<SabotageMode, string> = {
  off: 'Sin basura: solo cocinar',
  soft: 'Una bolsa a la vez, 2 cáscaras como máximo',
  chaos: 'Dos bolsas, 3 cáscaras, pilas dobles y lo que se cae se ensucia',
};
/** The key in the lobby's `modeOptions`. A missing key means "off" in the sim (the lobby always writes one, see defaultSabotage). */
export const SABOTAGE_OPTION = 'sabotage';
/** What the lobby proposes: Suave on Fácil and Normal, Caos on Difícil. The host can always change it. */
export const defaultSabotage = (d: Difficulty): SabotageMode => (d === 'hard' ? 'chaos' : 'soft');
/** The mode a round plays with, from the lobby's options (anything that is not a known mode is off). */
export const sabotageOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined): SabotageMode => {
  const v = modeOptions?.[SABOTAGE_OPTION];
  return isSabotageMode(v) ? v : 'off';
};

/** The legend character of the catapult in a versus map. Coop maps reject it (parseMap). */
export const CATAPULT_CHAR = 'Y';

// --- Rules per mode (design section 5) ---------------------------------------------------------------------------------------
export interface SabotageRules {
  cooldownMs: number; // between two launches of a team
  perMinute: number; // launches per sliding minute
  stock: number; // bags a team can have waiting at the bin
  maxPiles: number; // rubbish on one kitchen floor (flying bags count)
  decayMs: number; // a banana-skin disappears by itself after this long
  double: boolean; // the bag leaves two banana-skins (the target and a neighbour)
  spoilRaw: boolean; // a raw ingredient that falls becomes rubbish (it only serves for the bin)
}
export const RULES: Record<Exclude<SabotageMode, 'off'>, SabotageRules> = {
  soft: { cooldownMs: 12_000, perMinute: 3, stock: 1, maxPiles: 2, decayMs: 20_000, double: false, spoilRaw: false },
  chaos: { cooldownMs: 8_000, perMinute: 5, stock: 2, maxPiles: 3, decayMs: 35_000, double: true, spoilRaw: true },
};
/** The chef drops what it carries when it slips: always in Caos, otherwise from Normal up (Suave on Fácil only slips). Decision: the plan's "Suave / Normal y Caos" mixes the mode with the difficulty. */
export const dropsItem = (mode: Exclude<SabotageMode, 'off'>, d: Difficulty) => mode === 'chaos' || d !== 'easy';

// --- Desechos (what fills the bin) -----------------------------------------------------------------------------------------------
export const DESECHOS_PER_BAG = 3;
export const DESECHOS_DRIP_MS = 15_000; // base trickle: +1 this often
export const DESECHOS_OF = { item: 1, pizza: 2, trash: 1, bag: DESECHOS_PER_BAG } as const; // an item binned, a baked pizza binned, rival rubbish cleaned, a caught bag
export const COMEBACK_BEHIND = 2; // orders behind from which the trickle is faster
export const COMEBACK_RATE = 1.5;
export const SMALL_KITCHEN_DECAY = 0.7; // banana-skins that fall in the kitchen of a team with k > 1 last this share

// --- The throw -------------------------------------------------------------------------------------------------------------------
export const RETICLE_STEP_MS = 250; // the reticle moves one tile this often
export const AIM_MAX_MS = 3000; // no B in this long and it fires by itself
export const WINDUP_MS = 200; // from B to the bag leaving the catapult
export const FLIGHT_MS = 500; // the parabola over the barrier
export const LAND_AFTER_MS = WINDUP_MS + FLIGHT_MS; // the shadow is on the target this long before the impact (700 ms of warning)
export const CATCH_RADIUS = 0.6; // an empty-handed rival chef this close to the landing tile catches the bag
export const ADJUST_MAX = 2; // the landing tile moves at most this many steps to a valid one; farther and the bag bursts
export const MIN_LANDING_TILES = 6; // validator: valid landing tiles in every kitchen
export const WINDOW_MS = 60_000; // the "per minute" window

// --- The slip (design section 4) ---------------------------------------------------------------------------------------------------
export const SLIP_TRIGGER = 0.35; // tiles: the chef's centre this close to the centre of the tile
export const SLIP_MIN_SPEED = 0.2; // share of SPEED under which the slide goes along the facing instead of the velocity
export const SLIP_DASH_EXTRA = 0.5; // tiles added when the chef enters dashing
export const SLIP_PUSH = 0.5; // the chef a slider runs into gets half of the slider's speed, and never slips from it
export interface SlipParams {
  dist: number;
  slideMs: number;
  recoverMs: number;
  immuneMs: number;
}
export const SLIP: Record<Difficulty, SlipParams> = {
  easy: { dist: 1.5, slideMs: 450, recoverMs: 100, immuneMs: 2000 },
  normal: { dist: 2.5, slideMs: 600, recoverMs: 150, immuneMs: 1500 },
  hard: { dist: 3.0, slideMs: 700, recoverMs: 200, immuneMs: 1200 },
};
/** Total time without control: the slide plus the getting up (550 / 750 / 900 ms). */
export const controlLostMs = (d: Difficulty) => SLIP[d].slideMs + SLIP[d].recoverMs;

// --- State -------------------------------------------------------------------------------------------------------------------------
/** A thing on the floor: rubbish that makes chefs slip, or what a chef dropped when it slipped (any chef of its kitchen's team picks it up). */
export interface FloorItem {
  id: number;
  tx: number;
  ty: number;
  item: Item; // 'trash' for rubbish; the dropped item otherwise
  kind: 'trash' | 'dropped';
  team: number; // the kitchen it is in
  by: number | null; // the team that threw the bag (null: dropped by a chef)
  bornAt: number; // match time
  expiresAt: number; // match time; Infinity = stays
}
/** What a chef who slips is doing: the slide starts at `t0` along `dir`, goes `dist` tiles in `slideMs`, then gets up for `recoverMs`. */
export interface Slip {
  t0: number;
  dir: Pos;
  dist: number;
  slideMs: number;
  recoverMs: number;
  stopped: boolean;
  hit: number[];
}

export interface Aim {
  player: number;
  t0: number;
  step: number;
} // step: last reticle index announced
export interface Flight {
  from: Pos;
  to: Pos;
  launchAt: number;
  landAt: number;
  by: number;
  target: number;
  double: boolean;
}
export interface SabTeam {
  desechos: number; // 0..DESECHOS_PER_BAG (fractional while the comeback trickle is faster)
  bags: number; // bags waiting at the bin
  dripAt: number; // match time of the next trickle drop
  cooldownUntil: number;
  launches: number[]; // match times of the last launches (the per-minute window)
  aim: Aim | null; // the catapult is loaded and the reticle is sweeping
  flights: Flight[];
}
export interface Sabotage {
  mode: Exclude<SabotageMode, 'off'>;
  rules: SabotageRules;
  sigma: SigmaName;
  teams: SabTeam[];
  catapults: Pos[]; // per team: the tile of its catapult (station)
}

// --- Event contract (all versus only: they always carry the team) ------------------------------------------------------------------
export interface SabotageEvents {
  'sabotage:bagReady': { team: number; bags: number }; // a bag is waiting at the bin
  'sabotage:aim': { team: number; player: number; at: Pos }; // the reticle moved to this tile of the rival kitchen (also the first one, when the bag is loaded)
  'sabotage:launch': { team: number; player: number; from: Pos; landAt: Pos; ms: number }; // B pressed (or the 3 s ran out); `ms` until the impact
  'sabotage:land': { team: number; target: number; tile: Pos; double: boolean; extra: Pos | null }; // team = who threw, target = the kitchen it fell in
  'sabotage:caught': { team: number; target: number; chef: number }; // an empty-handed rival caught the bag
  'sabotage:burst': { team: number; at: Pos }; // no valid tile near the target: the bag bursts on the barrier ("plof")
  'sabotage:blocked': { team: number; player: number; why: 'cooldown' | 'window' | 'piles' | 'busy' }; // the catapult refused the bag
  'chef:slip': { chef: number; team: number; at: Pos; dir: Pos; dist: number; dropped: Item | null };
  'chef:recover': { chef: number; team: number; wall: boolean }; // up again (wall: the slide ended against a wall)
  'trash:picked': { player: number; team: number; tile: Pos; item: Item; kind: 'trash' | 'dropped' };
  'trash:binned': { team: number; desechos: number; gained: number; item: Item }; // `desechos` is the team's counter after (bags taken out)
  'trash:decayed': { team: number; tile: Pos };
}
