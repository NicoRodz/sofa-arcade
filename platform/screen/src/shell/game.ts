// The screen side of the game contract (core/contract has the pure half). EXPERIMENTAL (F4b).
//
// What the shell asks of a game. It started as the list of places where main.ts branched on the game (`config.game === OBST_ID`,
// `activeGame === 'pizzas'`): each branch became one hook, so the shell names no game. Obstaculos implements all of them;
// Pizzas implements them from apps/screen/src/pizzas/ until F4c moves that code into games/pizzas/screen.
//
// Where it differs from section 3 (evidence: apps/screen/src/main.ts before F4b):
//  - `mount(ctx) -> GameView{render(s, events, alpha)}` is `startMatch()` + `scenes()`: a game's Phaser scene pulls its state each frame
//    (ObstaclesScene host.world / afterRender, MainScene host.step), and Obstaculos advances by render-frame delta with its own
//    accumulator (ObstSession.advance), so there is no shell-owned tick for `GameSim.step` to hang from yet.
//  - There is no options schema driving the lobby: the Obstaculos lobby is a level grid with per-level compatibility, the Pizzas
//    lobby is map cards + teams + sabotage. Each game paints its own lobby half (`lobby.render`) into the page's existing markup.
import type Phaser from 'phaser';
import type { Difficulty } from '@pichi/core/difficulty';
import { createRegistry, type Registry } from '@pichi/core/registry';
import type { GameManifest } from '@pichi/core/contract';
import { catalog } from './catalog';
import type { LobbyConfig, MatchStart, MenuActBody, MenuBody, PhaseInfo, Phase, ServerMsg } from '@pichi/core';
import type { PlayerRec } from './player';

export interface SceneSpec {
  key: string; // the Phaser scene key
  scene: Phaser.Scene;
  initial?: true; // the scene Phaser boots with: the shell wakes it, never starts it
  leave?(): void; // the shell is switching to another game's scene (the level ends)
}

/** What the game answers to one touch of the Captain's menu: done, or refused (`stale`: the lobby changed under the phone; `disabled`: not allowed now) with a line for the phone. */
export type MenuActResult = { ok: true } | { ok: false; code: 'stale' | 'disabled'; msg: string };

export interface LobbyHooks {
  /** Config patch when this game is picked in the menu: a game must not inherit the teams or options of the one before (the relay would refuse the config). */
  pickReset(prev: string): Partial<LobbyConfig>;
  afterPick?(): void;
  /** The mark beside the lobby title (a canvas or svg that fills its box): the game's identity. Absent: the Sofa Arcade sofa. */
  logo?(): HTMLElement;
  /** The game's half of the lobby (everything below the difficulty pills); it also hides what belongs to the other games. */
  render(): void;
  /** Lobby-only keys (after the how-to card, the menu and the school had theirs). True when used. */
  key?(key: string, repeat: boolean): boolean;
  /** The difficulty pill was clicked: extra config the game wants with it. */
  difficulty?(d: Difficulty): Partial<LobbyConfig>;
  /** Esc / the back button: true when the game handled it (it did not leave the lobby). */
  back?(): boolean;
  /** "A cocinar" was pressed: true when the game takes over (the school). */
  beforeStart?(): boolean;
  /** The lobby as a touch form for the Captain's phone (null: none right now, the phone keeps its D-pad). The shell sends it whenever it changes. */
  menu?(): MenuBody | null;
  /** One touch of the Captain's phone (the shell already checked who sent it and that the lobby is open); `rev` is the snapshot's current revision. */
  menuAct?(act: MenuActBody, rev: number): MenuActResult;
}

export interface ResultsHooks {
  render(): void;
  scoreOf(id: number): number;
  /** Enter on the results screen (default: back to the lobby). */
  enter?(): void;
}

export interface PlayerHooks {
  joined?(p: PlayerRec): void; // a player the screen did not know
  updated?(p: PlayerRec, back: boolean): void; // every state / join message; back: it reconnected
  left?(p: PlayerRec): void; // its phone dropped (it may come back)
  removed?(p: PlayerRec): void; // gone for good
  input?(p: PlayerRec, m: Extract<ServerMsg, { t: 'input' }>): void;
}

export interface ScreenGame {
  manifest: GameManifest;
  /** Once, at boot, after the page and the shell exist: DOM listeners, audio, the game's own screens. */
  init?(): void;
  scenes?(): SceneSpec[];
  lobby: LobbyHooks;
  /** The phase became 'playing' with this game picked: build the round and show its scene. Returns what the phones need to know. */
  startMatch(): MatchStart | undefined;
  /** The screen went back to the lobby or the menu: forget the round (every game gets this, only the one that ran has something to do). */
  reset?(to: 'lobby' | 'menu'): void;
  /** The phase became 'school' (the guided practice, Pizzas only today). */
  enterSchool?(): void;
  /** Phase message extras while this game is the active one (what the phones show: the puestos of the round, the verdict of a versus round). */
  phaseExtras?(phase: Phase): Partial<Pick<PhaseInfo, 'puestos' | 'result'>>;
  results: ResultsHooks;
  players?: PlayerHooks;
  /** A relay message the shell does not handle itself. */
  message?(m: ServerMsg): void;
  /** Keys before the how-to card: the school and the campaign own the keys while they run. True when used. */
  key?(key: string, repeat: boolean): boolean;
  /** Every keydown of the page, before the shell (mute, ...). */
  globalKey?(e: KeyboardEvent): void;
  /** Hooks for the capture tool and the end-to-end checks (merged into window.__pg). Never used by the game itself. */
  debug?(): Record<string, unknown>;
}

let registry: Registry<ScreenGame> = createRegistry<ScreenGame>([]);
/** The games this screen runs. Refuses to start when a published manifest (the catalog) has no ScreenGame or a ScreenGame has no manifest there. */
export const registerGames = (games: readonly ScreenGame[]) => {
  const GAME_IDS = catalog().ids;
  const reg = createRegistry(games);
  const missing = GAME_IDS.filter((id) => !reg.get(id));
  const unknown = reg.ids().filter((id) => !GAME_IDS.includes(id));
  if (missing.length || unknown.length)
    throw new Error(`screen games do not match the manifests: missing ${missing.join(',') || '-'}, unknown ${unknown.join(',') || '-'}`);
  registry = reg;
};
export const games = () => registry;
