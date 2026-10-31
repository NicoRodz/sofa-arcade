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
export const app = {
  players: new Map<number, PlayerRec>(),
  room: roomCode,
  captainId: null as number | null, // the phone that holds the crown (the relay elects it): the only one whose D-pad moves the menus
  lastKeyAt: null as number | null, // when the Mac keyboard last pressed something: it keeps the last word over the D-pad
  phase: 'menu' as Phase, // Pichiclub start: the screen picks the game, then that game's lobby
  config: { ...defaultConfig(), seed: (Math.random() * 2 ** 32) >>> 0 } as LobbyConfig,
  activeGame: defaultConfig().game, // the game of the round that is running (or just ran): config.game can change in the lobby meanwhile
  starting: false, // the iris is moving
  gateUntil: 0, // the logic waits for the iris to open
  howTo: null as HowToState | null,
  menuSel: 0,
  debugOverride: false,
};

export const activeGame = () => games().require(app.activeGame);
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
  services.iris(swap, () => {
    app.starting = false;
  });
}

export function setPhase(next: Phase) {
  if (next === app.phase) return;
  app.phase = next;
  let match: MatchStart | undefined;
  if (next === 'playing') {
    app.activeGame = app.config.game;
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
