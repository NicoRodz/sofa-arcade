// What the Pizzas screens share while the game is on the TV: the round, the lobby's team / map / sabotage bookkeeping, the versus verdict.
// TRANSITIONAL (F4b): the module-level `let`s of apps/screen/src/main.ts that belong to Pizzas, as fields of `pz`. F4c moves all of apps/screen/src/pizzas
// into games/pizzas/screen (coop-view, versus-view, results-panel) and turns this into the game's own state.
import { GAMES, modeOf, type GameDef } from '@pichi/core/games';
import { gameBus } from '@pichi/screen-kit/bus';
import { app, connectedCount } from '@pichi/screen-kit/shell/app-state';
import type { PuestoMsg } from '@pichi/core';
import { createGame } from '@pichi/game-pizzas/sim';
import { lobbyN } from '@pichi/game-pizzas/sim/maps';
import { tallyKitchen } from '@pichi/game-pizzas/sim/kudos';
import { NO_LEAD, tallyDeliveries, type LeadState, type Series, type VersusReport } from '@pichi/game-pizzas/sim/versus/report';
import type { RoundView } from '@pichi/game-pizzas/screen/art/hud';
import type { PuestoView } from '@pichi/game-pizzas/screen/art/puestos';

export const PIZZAS = 'pizzas';
export const pz = {
  game: createGame(),
  roundNo: 0, // rounds started in this session: the mid-round event of each one comes from the lobby seed plus this, so a rematch (same orders, same seed) gets another event
  played: new Set<string>(), // maps already played in this session (coop and versus ids): the lobby proposes a new one by default
  teamsTouched: false, // somebody moved a player by hand: the lobby stops rebalancing the teams on its own
  lockBeforeStart: false, // the teams lock while a match runs; this is what the host had set
  teamNotice: '', // why the last move or mode change was refused
  roundView: { teams: null, hiddenScore: false } as RoundView,
  report: null as VersusReport | null, // versus: the verdict of the round that just ended (the results screen and the phones read it)
  lead: NO_LEAD as LeadState, // versus: who led last, for the comeback cue
  series: null as Series | null, // versus: who has won how many rounds of this group in this session
  mapGroup: 'classic' as 'classic' | 'series', // which set of coop maps the grid shows: the 19 classics or the Carta larga series (it has its own plates)
  mapTouched: false, // the host picked a map by hand: stop proposing defaults
  sabotageTouched: false, // the host picked a sabotage level by hand: the difficulty stops proposing one
  mapNotice: '',
  puestoStamp: 0,
  puestoMsg: undefined as PuestoMsg | undefined,
  overAt: null as number | null,
  acc: 0,
};
export const puestoOf = new Map<number, PuestoView>(); // suggested stations of the running round, by player id

export const nextEventsSeed = () => (app.config.seed + pz.roundNo++) >>> 0;
export const connectedN = () => lobbyN(connectedCount());
export const gameDef = (): GameDef => GAMES.find((x) => x.id === app.config.game) ?? GAMES[0];
export const modeNow = () => modeOf(gameDef(), app.config.modeId);
export const isVersus = () => app.config.modeId === 'versus';
// Ayudante (assist.ts): the players that chose it from their phones. The round reads them once, at the start; a change mid-round waits for the next one.
export const assistIds = () => [...app.players.values()].filter((p) => p.info.assist).map((p) => p.info.id);

// round stats for the results screen: deliveries per chef (the podium, and the MVP of each team)
export const tally = tallyDeliveries(gameBus);
export const stats = { delivered: tally.counts };
export const kitchen = tallyKitchen(gameBus); // pizzas rescued from the oven and fires put out, for the results
