// The data of the oven that burns (Burn, Fire, FireV2), the score book (Ledger) and the mid-round events (EventKind, Planned, Rat, Mid). A leaf of the round state: the files that run them import Game, these only describe what Game holds.
import type { Rng } from '@pichi/core';
import type { Item } from '../round/item';
import type { FireParams } from '../hazards/hazard-v2';

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
export interface FireV2 {
  seed: number; // the round seed the fire sizes hash from
  bigOk: boolean; // false under the Suave sabotage: small fires only
  dousers: Map<number, number[]>; // station index -> the chefs holding Picar in front of it this tick
  count: number[]; // per kitchen: fires lit so far (the local index k)
}
export interface Ledger {
  points: Record<string, number>; // source -> net points (after the k of the handicap, as the score moves)
  count: Record<string, number>; // source -> how many entries
}
export interface Planned {
  kind: EventKind;
  startAt: number;
}
export type EventKind = 'rush' | 'inspector' | 'blackout' | 'birthday' | 'rat' | 'frost' | 'spill';
export interface Rat {
  x: number;
  y: number; // tile units, centre
  state: 'seek' | 'flee';
  item: Item | null; // what it carries
  from: number; // station index it stole from (-1: nothing yet)
  hole: [number, number]; // where it came in and where it leaves
  scared: boolean;
  idleMs: number;
  // the gentle rat only (feel/rat.ts): absent in a round without the magnet
  born?: number;
  heading?: number;
  runMs?: number;
  pauseMs?: number;
  target?: number;
  near?: boolean;
  // HAZARD_V2 (feel/rat-v2.ts): the dodge of a dash and the panting after it
  dodgeCd?: number;
  dodgeMs?: number;
  dodgeFrom?: [number, number];
  dodgeTo?: [number, number];
  pantMs?: number;
  dashers?: number[];
  evadeMs?: number; // feel/rat-evade.ts: a burst away from a chef in progress, its unit direction and cooldown
  evadeDx?: number;
  evadeDy?: number;
  evadeCd?: number;
}
export interface Mid {
  kind: EventKind;
  announceAt: number;
  startAt: number;
  endAt: number; // Infinity until it starts
  phase: 'wait' | 'announced' | 'active' | 'done';
  dark: boolean; // blackout in progress
  frost: boolean; // frost in progress: surfaces/physics reads it (every floor tile is ice)
  rat: Rat | null;
  rats?: Mid[]; // VERSUS_V3 (feel/rat-versus.ts): one sub-Mid per kitchen, each with its own `rat`; `rat` stays null
  rng: Rng; // the stream of the events (the instant, the kind, the hole of the rat)
  lossAt?: number; // HAZARD_V3: match time of the last item a hazard took (feel/rat-loot.ts)
  queue?: Planned[]; // HAZARD_V2: the events still to come after this one (events-v2.ts); absent = the old single event
}
