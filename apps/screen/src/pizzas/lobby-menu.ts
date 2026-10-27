// The Pizzas lobby as the Captain's touch form: feeds the pure builder in games/pizzas/screen/lobby-menu.ts with the live lobby state and carries out what a
// touch decided with the lobby's own functions (the same ones the clicks and the keys call), so every guard they have still applies.
// TRANSITIONAL (F4b): lives with the other lobby modules until F4c moves them into games/pizzas/screen.
import { SERIES_MAPS } from '@pichi/game-pizzas/sim/maps';
import { FOCUS_ROW, buildLobbyMenu, decideMenuAct, type MenuEffect, type PizzasLobbyState } from '@pichi/game-pizzas/screen/lobby-menu';
import { focusRow } from '@pichi/screen-kit/lobby/focus-nav-dom';
import { startRound } from '@pichi/screen-kit/shell/round-flow';
import { app, connectedCount, renderUi, setConfig } from '@pichi/screen-kit/shell/app-state';
import type { MenuActResult } from '@pichi/screen-kit/shell/game';
import type { MenuActBody, MenuBody } from '@pichi/core';
import { difficultyPatch } from './lobby';
import { setEvents, setMode, setMutate, setSabotage, shuffleTeams, startProblem } from './lobby-sync';
import { connectedN, gameDef, pz } from './state';

const lobbyState = (): PizzasLobbyState => ({
  config: app.config,
  def: gameDef(),
  connected: connectedCount(),
  n: connectedN(),
  startProblem: startProblem(),
  mapNotice: pz.mapNotice,
  teamNotice: pz.teamNotice,
});

export const pizzasMenu = (): MenuBody => buildLobbyMenu(lobbyState());

function run(e: MenuEffect) {
  switch (e.kind) {
    case 'difficulty':
      return setConfig({ difficulty: e.value, ...difficultyPatch(e.value) }); // the sabotage level follows the difficulty until the host picks one by hand
    case 'mode':
      return setMode(e.value);
    case 'sabotage':
      return setSabotage(e.value);
    case 'events':
      return setEvents(e.value);
    case 'mutate':
      return setMutate(e.value);
    case 'option':
      return setConfig({ modeOptions: { ...app.config.modeOptions, [e.id]: e.value } });
    case 'map':
      pz.mapTouched = true;
      pz.mapNotice = '';
      return setConfig({ map: e.value as typeof app.config.map });
    case 'group':
      // the TV shows the page the phone opened; a series map picked stays picked only on its own page, as with the click on the page's tab
      pz.mapGroup = e.value;
      if (e.value === 'classic' && SERIES_MAPS.some((m) => m.id === app.config.map)) return setConfig({ map: 'auto' });
      return renderUi();
    case 'shuffle':
      return shuffleTeams();
    case 'lock':
      pz.teamNotice = '';
      return setConfig({ teamsLocked: !app.config.teamsLocked });
    case 'start':
      return startRound();
  }
}

export function pizzasMenuAct(act: MenuActBody, rev: number): MenuActResult {
  const d = decideMenuAct(lobbyState(), act, rev);
  if (!d.ok) return d;
  run(d.effect);
  if (d.row && FOCUS_ROW[d.row]) focusRow(FOCUS_ROW[d.row]!); // the ring on the TV follows the finger
  return { ok: true };
}
