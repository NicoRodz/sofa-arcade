// The game contract, the phone's half (plan pichiclub-refactor, F5d). The platform runs the pad, the lobby, the Captain's remote and the socket; a game plugs in what
// is its own: the line under the setup, what to show for a phase (stations, verdict), the messages only it understands and its school. The platform never names a game.
// Pure types: apps/controller/src/games.ts lists the games of this build and hands them to `startController` (app/start.ts).
import type { BuzzKind, ClientMsg, LobbyConfig, Phase, PhaseInfo, ServerMsg } from '@pichi/core';
import type { GameCatalog } from '@pichi/core/contract';

export interface ControllerHost {
  send(m: ClientMsg): void;
  /** The pad view: the game's own widgets (a card over the pad) live inside it. */
  readonly slot: HTMLElement;
  buzz(kind: BuzzKind): void;
  /** This phone's player id, undefined until the relay says (`joined`). */
  myId(): number | undefined;
  /** The team of this phone (versus), null when it is on none. */
  myTeam(): number | null;
  phase(): Phase;
}

export type SchoolMsg = Extract<ServerMsg, { t: 'school' }>;
/** A game's training card on the phone: the platform feeds it the screen's `school` messages and shows it in the `school` phase. */
export interface ControllerSchool {
  apply(m: SchoolMsg): void;
  show(on: boolean): void;
  announce(): void;
  refreshCaptain(): void;
}
export interface SchoolDeps {
  token: string;
  send: (m: ClientMsg) => void;
  isCaptain: () => boolean;
}

export interface ControllerGame {
  readonly id: string;
  /** The line under the game's name while waiting in the lobby (what the setup is). */
  setupLabel(cfg: LobbyConfig): string;
  /** Once, when the page is ready: bind the game's widgets. */
  init?(host: ControllerHost): void;
  /** Every `phase` message of the match this game is running (stations, verdict). Called after the platform's own handling. */
  onPhase?(p: PhaseInfo, host: ControllerHost): void;
  /** Every message of the relay, before the platform's own handling; true = consumed (the platform skips it). */
  onMessage?(m: ServerMsg, host: ControllerHost): boolean;
  school?: (deps: SchoolDeps) => ControllerSchool;
  dispose?(): void;
}

export interface ControllerOptions {
  games: readonly ControllerGame[];
  root: HTMLElement;
  /** Names the game of a lobby the phone has no ControllerGame for. */
  catalog: GameCatalog;
}
