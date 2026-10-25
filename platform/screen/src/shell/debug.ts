// window.__pg: state for the bots (a phone cannot see the world) and hooks for the capture tool. Never used by the game itself.
// The shell's own hooks plus whatever each game publishes through ScreenGame.debug. Moved out of apps/screen/src/main.ts (F4b).
import type { ServerMsg } from '@pichi/core';
import { menuCards } from '../menu';
import { onMessage } from '../net/connection';
import { app, connectedCount, setPhase } from './app-state';
import { games } from './game';

export function exposeDebug() {
  const base = {
    deliver: (m: ServerMsg) => onMessage(m), // e2e: hand the screen a relay message directly (to prove the screen validates the Captain itself)
    captain: () => app.captainId,
    forceLobby: () => {
      if (app.phase === 'menu') setPhase('lobby');
    }, // capture tool: skip the menu (and its player range)
    menu: () => ({ sel: app.menuSel, cards: menuCards(connectedCount()).map((c) => `${c.id}:${c.state}`) }),
  };
  (window as unknown as { __pg: unknown }).__pg = Object.assign(
    base,
    ...games()
      .list()
      .map((g) => g.debug?.() ?? {}),
  );
}
