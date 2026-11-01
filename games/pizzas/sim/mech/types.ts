export type { MechState } from './state';
import type { Controls, Game, Player, Station } from '../round/state';
import type { MechId } from './ids';

/** Where a station fire changes (burn.ts): it starts at an oven, spreads to a counter, or is put out. */
export type FirePhase = 'start' | 'spread' | 'out';

/** Per-mechanic checks and generator pieces: stubs in T0 (see each folder). */
export type MechValidator = (rows: readonly string[], n: number) => string[]; // problems found, [] = fine
export interface MechStamp {
  template: readonly string[]; // sub-grid the generator pastes (empty in a stub)
}
export interface MechBot {
  wants: (g: Game) => boolean; // does the bot have to play this mechanic's job now (false in a stub)
}
export interface MechArt {
  draw: () => void; // drawn by code over the kitchen (nothing in a stub)
}

/**
 * Hooks in the fixed order of a tick: onLoad, init (createGame) -> beforeMove -> [per chef: claimsB, canEnter / friction while walking, onInteract] ->
 * tickStations -> tickTiles -> mutation -> hashExtra. Modules run in registry order (MECH_IDS), entities by id. onFire and ovenRate are the extra hooks T0 adds
 * (the fire and the oven of W / ovenHeat live in burn.ts and round/stations.ts).
 */
export interface MechModule {
  id: MechId;
  tanda: string; // who implements it
  onLoad(g: Game): void; // the grid and stations exist: scan the map (find the handles of M, the plates of Z...)
  init(g: Game): void; // create this module's slice of game.mech
  beforeMove(g: Game, controls: ReadonlyMap<number, Controls>, dtMs: number): void; // raft, belt: before any chef moves
  canEnter(g: Game, tx: number, ty: number, dir: readonly [number, number], actor: Player): boolean; // false = the tile is a wall for this move
  friction(g: Game, tx: number, ty: number, tauMs: number): number; // the velocity time constant of a chef standing on the tile (oil: ice)
  claimsB(g: Game, p: Player, target: Station | null): boolean; // B held here is this mechanic's job: no dash, the chef stands still (handle, bellows, extinguisher on a tile)
  onInteract(g: Game, p: Player, c: Controls, target: Station | null, dtMs: number): boolean; // after the chef walked; true = it used this chef's A presses
  tickStations(g: Game, dtMs: number): void; // M progress, W fuel, temp, overflow
  tickTiles(g: Game, dtMs: number): void; // oil, fire, sprinkler, bridges
  mutation(g: Game): void; // the v2 mutation's slot
  hashExtra(g: Game): readonly number[]; // integers that enter game.mech.hash
  ovenRate(g: Game, s: Station): number; // permil of the normal baking speed of this oven (1000 = as always, 0 = frozen); the chain is the product
  onFire(g: Game, s: Station, phase: FirePhase): void; // a station caught fire / the fire spread / it was put out
  controls(g: Game, p: Player, c: Controls): Controls; // T2: the stick and buttons the chef's step really sees (chained over the modules); the heavy tray slows the carrier and merges a coupled pair
  noCollide(g: Game, a: Player, b: Player): boolean; // T2: true = these two chefs do not push each other apart (or-ed): the helper of the heavy tray
  validate: MechValidator;
  stamp: MechStamp;
}
