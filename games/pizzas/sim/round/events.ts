// Typed events emitted by the pure game logic. The sound layer (and anything else) subscribes to these;
// the logic knows nothing about who listens.
import type { TeamResult } from '@pichi/core/lobby/teams';
import type { Item, Recipe, StationKind } from '../index';
import type { SabotageEvents } from '../sabotage-config';
import type { EventKind } from '../midround';

// `team` (optional, on the team-level events): the id of the team the event belongs to, for the HUD and the sounds. It is present
// only in versus (two or more teams); a cooperative round is one team and its events carry no team, exactly as before the teams refactor.

/** Events of the surfaces: their sounds are wired by the game's own audio director, not by the shared recipe table. */
export type SurfaceEvent = 'surface:slide' | 'surface:belt';
/** Events of the mutating kitchen (sim/mutate): sounded by the game's own audio director too. */
export type MutateEvent = 'mutate:warn' | 'mutate:apply';
/** Events of the map mechanics (games/pizzas/sim/mech): sounded by the game's own audio director (screen/audio/mech.ts). */
export type MechEvent = 'mech:need' | 'mech:fire' | 'mech:wiped' | 'mech:spray' | 'mech:drip' | 'mech:bridgeBreak';

export interface GameEvents extends SabotageEvents {
  itemPicked: { player: number; item: Item; from: StationKind };
  itemDropped: { player: number; item: Item; at: StationKind };
  interactInvalid: { player: number };
  dash: { player: number; dx: number; dy: number }; // R2: unit direction
  bump: { player: number; other: number }; // R5: a dash hit another chef
  'surface:slide': { player: number }; // surfaces (only a round with them): a chef stepped onto ice at speed
  'surface:belt': { player: number }; // ... onto a floor belt
  'mutate:warn': { id: string; title: string; blurb: string; inMs: number; dests?: readonly (readonly [number, number])[] }; // mutate flag: the alarm and the banner, the map changes in `inMs`
  'mutate:apply': { id: string; tiles: { x: number; y: number; to: string }[]; moved: number }; // the tiles changed (grid already new); `moved` chefs/items relocated
  chopStart: { player: number; station: number }; // station = index in game.stations
  chopStop: { player: number; station: number };
  chopDone: { player: number; station: number };
  washStart: { player: number; station: number };
  washStop: { player: number; station: number };
  washDone: { player: number; station: number }; // one plate got clean
  dirtyNew: { station: number; team?: number }; // a dirty plate showed up at the return
  potStart: { station: number; team?: number };
  potReady: { station: number; team?: number };
  orderNew: { order: number; recipe: Recipe; team?: number; vip?: true; birthday?: true }; // birthday: the "Pedido de cumpleaños" event (worth 150 flat)
  orderWarning: { order: number; team?: number };
  orderExpired: { order: number; team?: number };
  delivered: { player: number; points: number; tip: number; base: number; mult: number; team?: number; k?: number; vip?: true }; // coop: points = base + tip (the tip already times the streak multiplier). Versus: points = what the team scored, (base + tip) x2 if it won the VIP, times k
  dishRejected: { player: number; team?: number }; // R16: the wrong plate at the window
  streak: { n: number; mult: number; team?: number }; // R15: deliveries in a row (0 = lost) and the multiplier the next one gets
  countdownTick: { n: number; kind: 'start' | 'end' }; // start: 3, 2, 1, 0 = go; end: last seconds of the round
  roundStart: Record<string, never>;
  roundEnd: { score: number; delivered: number; winner?: number | null; results?: TeamResult[] }; // versus: score/delivered of the leader, winner (null: draw or no winner) and every team ranked
  // versus only (always carry the team)
  vipNew: { recipe: Recipe }; // the golden order appeared in every queue
  vipWon: { team: number; player: number; tie: boolean }; // first delivery of the VIP (tie: another team delivered it in the same tick, both win)
  vipLost: { team: number }; // the rival won: this team's VIP order is a normal order now
  comeback: { team: number }; // NOT from the sim: the host raises it when the team that was behind takes the lead (versusReport.nextLead; never while the scoreboard is hidden)
  pantryRefill: { stock: number }; // the shared pantry (V2) got a unit back (the takes are plain itemPicked)
  teamK: { team: number; k: number }; // the handicap multiplier of a team changed (a chef dropped for good)
  playerDropped: { player: number; team: number }; // the chef is a ghost for GHOST_MS; what it carried went to the nearest free counter
  playerBack: { player: number; team: number }; // it reconnected in time: same team, same chef
  playerGone: { player: number; team: number }; // the grace time ran out: the chef left the kitchen
  matchPaused: { teams: number[] }; // these teams are empty: the host picks 'continue' or 'end' (resolvePause)
  matchResumed: Record<string, never>;
  // the oven that burns and the fire (burn.ts; only in a round whose config switched it on). `team` only in versus, as everywhere; `station` is an index in game.stations
  'oven:warn': { station: number; msLeft: number; team?: number }; // a ready pizza is about to burn: the warning beep
  'oven:burnt': { station: number; team?: number }; // it burnt: smoke, it cannot be delivered, it goes to the bin
  'oven:rescued': { player: number; station: number; team?: number }; // a chef took the pizza out after the warning, in time
  'mech:need': { player: number; station: number; kind: string }; // map mechanics: this chef is called (the other handle of the kneader, the bellows of the wood oven)
  'mech:fire': { tile: number }; // oil caught fire on this tile (index y * 16 + x)
  'mech:wiped': { tile: number }; // a chef wiped the oil or put the flame out on this tile
  'mech:spray': { tile: number }; // the sprinkler at this tile started a burst
  'mech:drip': { tile: number }; // HAZARD_V3: the sprinkler at this tile drips, the burst comes in 2 s
  'mech:bridgeBreak': { tile: number }; // a worn bridge broke
  'fire:start': { station: number; team?: number; big?: boolean }; // the oven caught fire
  'fire:spread': { station: number; team?: number }; // the fire jumped to this counter
  'fire:out': { player: number; station: number; team?: number }; // a chef put this station out
  'fire:end': { team?: number }; // the last flame of the kitchen is out
  douseStart: { player: number; station: number }; // a chef holds Picar in front of a station on fire (the extinguisher)
  douseStop: { player: number; station: number };
  // the calzone (recipes/sim.ts; only in a round with a Carta del día): a chef holds Picar at an oven with dough and tomato, and at the end the dough is folded
  foldStart: { player: number; station: number };
  foldStop: { player: number; station: number };
  foldDone: { player: number; station: number; team?: number };
  // events in the middle of the round (midround.ts). The global ones carry no team.
  'event:announce': { kind: EventKind; inMs: number }; // the banner: it starts in `inMs`
  'event:start': { kind: EventKind; durationMs: number };
  'event:end': { kind: EventKind };
  'event:inspector': { passed: boolean; points: number; team?: number }; // the verdict for a team when the inspector leaves
  // EVENTS_V2 (ev2/): the ambience (a mood per event, the latest wins), the closing card, and the cake's steps. Only a round with `eventsV2` emits them.
  'ev2:mood': { kind: EventKind; on: boolean };
  'ev2:close': { kind: EventKind; points: number; ok: boolean; title: string; detail: string; by?: number };
  'ev2:cake': { step: 'candle' | 'served' | 'expired'; player?: number };
  'rat:appear': { at: [number, number]; team?: number }; // team: only in a versus round (VERSUS_V3: one rat per kitchen)
  'rat:steal': { station: number; item: Item; team?: number };
  'rat:scared': { player: number; returned: boolean; bonus?: number; team?: number }; // a dash scared it; returned: it dropped the item back on its counter; bonus: points the gentle rat pays
  'rat:dodge': { player: number; team?: number }; // HAZARD_V2: the rat jumped aside from this chef's dash and now pants (feel/rat-v2.ts)
  'rat:target': { station: number; team?: number }; // the gentle rat picked this counter (the screen draws an arrow to it)
  'rat:near': { station: number; team?: number }; // ...and is about to get there
  'rat:gone': { stolen: boolean; team?: number }; // it left (stolen: with an item)
}
export { Emitter } from '@pichi/core/emitter'; // a Pizzas bus is an Emitter<GameEvents>: one import serves both
