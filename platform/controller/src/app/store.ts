// The phone's state, one object the other modules of app/ read and write (they are factories over it; start.ts wires them). Nothing here is game-specific.
import type { ClientMsg, HintLabels, Phase, TeamInfo } from '@pichi/core';
import type { GameControls, HowTo } from '@pichi/core/contract';
import type { ControllerGame, ControllerHost, ControllerOptions } from '../contract';

export const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export interface PadState {
  x: number;
  y: number;
  btn: number;
  presses: number[];
  seq: number;
  sig: { kind: string; seq: number };
  go: boolean;
}
export const NO_HINT: HintLabels = { a: null, b: null };

export interface Session {
  root: HTMLElement;
  $: <T extends HTMLElement>(id: string) => T;
  games: readonly ControllerGame[];
  catalog: ControllerOptions['catalog'];
  host: ControllerHost;
  pad: PadState;
  ws: WebSocket | null;
  joined: boolean;
  started: boolean;
  halted: boolean; // server refused us (e.g. room full): stop retrying until the page is shown again
  phase: Phase; // until the screen says otherwise the phone waits for the game to be picked
  game: string | null; // the game of the last config
  myId: number;
  myName: string; // as the relay registered it (trimmed)
  captainId: number | null; // who holds the crown (the relay says); the Captain gets the D-pad
  room: string;
  token: string;
  name: string;
  label: string; // the line of the hud
  signalsOn: boolean;
  teams: TeamInfo[] | null;
  teamsLocked: boolean;
  myTeam: number | null;
  controls: GameControls | null;
  hint: HintLabels;
  seenGame: string | null;
  shown: { game: string; name: string; howTo: HowTo } | null; // the game the screen last announced
}

export const send = (s: Session, m: ClientMsg) => {
  if (s.ws?.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(m));
};
export const setView = (s: Session, v: string) => {
  s.root.dataset.view = v;
};
export const setHud = (s: Session, text: string) => {
  s.label = text;
  s.$('hud').textContent = text;
};
