// The game contract (plan reestructura-repo, section 3). EXPERIMENTAL: minimal on purpose; Arena (F6) is the third implementer that proves it.
// Pure types (this package has no DOM lib): the screen-side half of the contract, `ScreenGame`, lives in @pichi/screen-kit/shell/game because it
// talks to Phaser and the DOM.
//
// Where it differs from section 3 (each point has evidence in the code, see ARCHITECTURE.md):
//  - GameManifest IS the old registry entry (GameDef): same field names (name, minPlayers, maxPlayers, controls, howTo, modes), so the relay,
//    the phones and the tests did not change. `icon`, `color`, `options`, `tickHz` of the sketch are not there: nothing reads them yet.
//  - GameSim is declared but no game implements it yet: Pizzas steps through tick() with a fixed TICK_MS owned by the screen and Obstaculos
//    owns its own accumulator (ObstSession.advance(dtMs) per render frame, with the interpolation alpha). F4c/F5 adapt them.
import type { PublicPlayer } from '../protocol';
import type { TeamInfo } from '../lobby/teams';
import type { ControlLabel, GameControls, GameInfo } from './controls';
import type { GameOutcome } from './outcome';
import type { ModeId, ModeSpec } from './options';

export interface GameManifest extends GameInfo {
  id: string; // stable: it travels in the protocol and keys the stats
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number; // the range is inclusive; the menu card shows it and disables itself outside it
  modes?: readonly ModeSpec[];
  defaultMode?: ModeId;
}

/** What the phone paints: the stick and the two buttons (today the same shape as the manifest's `controls`). */
export type ControlLayout = GameControls;
export type { ControlLabel };

export interface GameSetup<O = Record<string, unknown>> {
  seed: number;
  players: readonly PublicPlayer[];
  teams: readonly TeamInfo[] | null;
  mode: ModeId;
  options: O;
}
export interface PlayerInput<I> {
  playerId: number;
  input: I;
}

/** Deterministic, pure simulation: no DOM, no Phaser, no clock. */
export interface GameSim<S, I, E, O = Record<string, unknown>> {
  init(setup: GameSetup<O>): S;
  step(state: S, inputs: readonly PlayerInput<I>[]): E[]; // one tick; may mutate S
  outcome(state: S): GameOutcome | null; // null: it goes on
  decodeInput(raw: unknown): I | null;
}

/** What a phone sends for one frame of its controls (the `input` message without transport fields). */
export interface ControlEvent {
  x: number;
  y: number;
  btn: number;
  presses: readonly number[];
}
export interface ControllerGame<I, V = unknown> {
  id: string;
  controls(view: V | null): ControlLayout;
  toInput(ev: ControlEvent): I;
}
