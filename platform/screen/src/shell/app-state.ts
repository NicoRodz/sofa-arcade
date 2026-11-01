// The one state machine of the screen: menu -> lobby -> (school) -> playing -> results, the state every screen reads, and what the shell
// needs from the page (the iris, the UI sounds, the repaint) injected at boot so it never imports a game. EXPERIMENTAL (F4b).
// Moved out of apps/screen/src/main.ts: the module-level `let`s became fields of `app`; no logic changed.
import { ClockSync, canStart, newRoomCode, nextPhase, type LobbyConfig, type MatchStart, type Phase, type PhaseEvent } from '@pichi/core';
import type { SfxId } from '../audio/recipes';
import { menuCards } from '../menu';
import { defaultConfig } from './catalog';
import { sendMsg } from '../net/socket';
import type { HowToState } from '../howto';
import { clearResultsTimers } from '../results/timers';
import { games } from './game';
import type { PlayerRec } from './player';

export type { PlayerRec };

/** What the shell needs from outside; main.ts binds the real ones at boot (the defaults make the shell testable without a page). */
export interface Services {
  iris(swap: () => void, done?: () => void): void;
  ui(id: SfxId): void; // UI sound
  playerJoined(): void;
  cardArt(cv: HTMLCanvasElement, id: string): void; // the illustration of a menu card (the art of every game, announced ones included)
  starCanvas(): HTMLCanvasElement; // a star of the results screens (Pizzas' art today; it moves to the platform's art in F4d)
  render(): void; // repaint the menu / lobby
}
export const services: Services = {
  iris: (swap, done) => {
    swap();
    done?.();
  },
  ui: () => {},
  playerJoined: () => {},
  cardArt: () => {},
  starCanvas: () => document.createElement('canvas'),
  render: () => {},
};
export const bindServices = (s: Partial<Services>) => Object.assign(services, s);
export const renderUi = () => services.render();

const roomCode = (() => {
  const q = new URLSearchParams(location.search).get('room');
  try {
    const code = q || sessionStorage.getItem('pg.screenRoom') || newRoomCode();
    sessionStorage.setItem('pg.screenRoom', code);
    return code;
  } catch {
    return q || newRoomCode();
  }
})();

export const sync = new ClockSync();
// The lobby config starts from the bound catalog's defaults, read on first use: never at module load, or importing the shell barrel before bindCatalog() would throw.
let config: LobbyConfig | undefined = { ...defaultConfig(), seed: 1 } as LobbyConfig; // SABOTAGE P1 (temporary, CI check)
export const app = {
  players: new Map<number, PlayerRec>(),
  room: roomCode,
  captainId: null as number | null, // the phone that holds the crown (the relay elects it): the only one whose D-pad moves the menus
  lastKeyAt: null as number | null, // when the Mac keyboard last pressed something: it keeps the last word over the D-pad
  phase: 'menu' as Phase, // Pichiclub start: the screen picks the game, then that game's lobby
  get config(): LobbyConfig {
    return (config ??= { ...defaultConfig(), seed: (Math.random() * 2 ** 32) >>> 0 } as LobbyConfig);
  },
  set config(next: LobbyConfig) {
    config = next;
  },
  starting: false, // the iris is moving
  gateUntil: 0, // the logic waits for the iris to open
  howTo: null as HowToState | null,
  menuSel: 0,
  debugOverride: false,
};

/** The game on screen: the one in config.game (the lobby can only change it between rounds, so it is also the game of the round that runs or just ran). */
export const activeGame = () => games().require(app.config.game);
export const pickedGame = () => games().require(app.config.game);
export const connectedCount = () => [...app.players.values()].filter((p) => p.info.connected).length;
export const connectedIds = () =>
  [...app.players.values()]
    .filter((p) => p.info.connected)
    .sort((a, b) => a.info.slot - b.info.slot)
    .map((p) => p.info.id);
export const canStartNow = () => canStart([...app.players.values()].map((p) => p.info));

export const setConfig = (patch: Partial<LobbyConfig>) => {
  app.config = { ...app.config, ...patch };
  sendMsg({ t: 'config', ...app.config });
  renderUi();
};

// iris wipe between menu and lobby, the same one that opens a round
export function transition(swap: () => void) {
  if (app.starting) return;
  app.starting = true;
  services.iris(swap, endIris);
}

// The Captain's D-pad while the iris moves (1 s): the screen ignores keys then, so a tap used to vanish without a trace. The last key that
// differs from the one just applied waits here and runs the moment the iris is free; a repeat of the key that began the iris (a double tap)
// is dropped, or a second OK would also skip the card the first one opened.
const DOUBLE_TAP_MS = 1500;
let held: string | undefined;
let lastCaptain: { key: string; at: number; began: boolean } | undefined;
let sink: ((key: string) => void) | undefined;
export const bindCaptainKeySink = (fn: (key: string) => void) => {
  sink = fn;
};
/** A Captain key that passed the relay's filters: apply it, or hold it if the iris is moving. */
export function routeCaptainKey(key: string, apply: (key: string) => void) {
  const now = performance.now();
  if (app.starting) {
    // only a repeat of the key that itself began this iris is a double tap; any other key (two "down" in a row) is legitimate
    if (!(lastCaptain?.began && lastCaptain.key === key && now - lastCaptain.at < DOUBLE_TAP_MS)) held = key;
    return;
  }
  lastCaptain = { key, at: now, began: false };
  apply(key);
  if (lastCaptain) lastCaptain.began = app.starting; // did this key start the iris?
}
/** The iris is free again: run what the Captain pressed meanwhile. */
export function endIris() {
  app.starting = false;
  const key = held;
  held = undefined;
  if (key === undefined) return;
  lastCaptain = { key, at: performance.now(), began: false };
  sink?.(key);
  if (lastCaptain) lastCaptain.began = app.starting;
}
/** Tests: forget the held key. */
export function resetCaptainKeys() {
  held = undefined;
  lastCaptain = undefined;
}

export function setPhase(next: Phase) {
  if (next === app.phase) return;
  app.phase = next;
  let match: MatchStart | undefined;
  if (next === 'playing') {
    match = pickedGame().startMatch();
  } else if (next === 'results') {
    clearResultsTimers();
    activeGame().results.render();
  } else if (next === 'school') pickedGame().enterSchool?.();
  else if (next === 'lobby' || next === 'menu') {
    for (const g of games().list()) g.reset?.(next);
    if (next === 'menu')
      app.menuSel = Math.max(
        0,
        menuCards(connectedCount()).findIndex((c) => c.id === app.config.game),
      ); // coming back: the game just left stays highlighted
  }
  const x = activeGame().phaseExtras?.(next);
  sendMsg({
    t: 'phase',
    phase: next,
    scores: next === 'results' ? [...app.players.keys()].map((id) => ({ id, score: activeGame().results.scoreOf(id) })) : undefined,
    puestos: x?.puestos,
    ...(match ? { match } : {}),
    ...(x?.result ? { result: x.result } : {}),
  });
  renderUi();
}

export const dispatch = (ev: PhaseEvent) => {
  if (ev === 'start' && !canStartNow()) return;
  setPhase(nextPhase(app.phase, ev));
};
