// What the Pizzas screens share while the game is on the TV: the round, the lobby's team / map / sabotage bookkeeping, the versus verdict.
// The module-level `let`s of the old main.ts that belong to Pizzas, as fields of `pz`: private to this package (the shell never reads it).
import { modeOf, type GameDef } from '@pichi/core/contract';
import { catalog, app, connectedCount } from '@pichi/screen-kit/shell';
import { pizzasBus } from './bus';
import type { PuestoMsgPz } from '../sim/puestos';
import { createGame } from '../sim';
import { lobbyN, type MapFamily } from '../sim/maps';
import { tallyKitchen } from '../sim/kudos';
import { NO_LEAD, tallyDeliveries, type LeadState, type Series, type VersusReport } from '../sim/versus/report';
import type { RoundView } from './art/hud';
import type { MapGroup } from './lobby-menu';
import type { PuestoView } from './art/puestos';

export const PIZZAS = 'pizzas';
export const pz = {
  game: createGame(),
  roundNo: 0, // rounds started in this session: the mid-round event of each one comes from the lobby seed plus this, so a rematch (same orders, same seed) gets another event
  played: new Set<string>(), // maps already played in this session (coop and versus ids): the lobby proposes a new one by default
  autoLast: undefined as MapFamily | undefined, // family of the last coop map played: `auto` does not repeat it twice in a row
  teamsTouched: false, // somebody moved a player by hand: the lobby stops rebalancing the teams on its own
  lockBeforeStart: false, // the teams lock while a match runs; this is what the host had set
  teamNotice: '', // why the last move or mode change was refused
  roundView: { teams: null, hiddenScore: false } as RoundView,
  report: null as VersusReport | null, // versus: the verdict of the round that just ended (the results screen and the phones read it)
  lead: NO_LEAD as LeadState, // versus: who led last, for the comeback cue
  series: null as Series | null, // versus: who has won how many rounds of this group in this session
  mapGroup: 'classic' as MapGroup, // which set of coop maps the grid shows: the 19 classics, the Carta larga series (its own plates) or the Taller series (the new mechanics)
  showOthers: false, // the coop grid unfolds its "Otros mapas (N)" (the maps that cannot be picked for this group)
  mapTouched: false, // the host picked a map by hand: stop proposing defaults
  sabotageTouched: false, // the host picked a sabotage level by hand: the difficulty stops proposing one
  mapNotice: '',
  puestoStamp: 0,
  puestoMsg: undefined as PuestoMsgPz | undefined,
  overAt: null as number | null,
  acc: 0,
};
export const puestoOf = new Map<number, PuestoView>(); // suggested stations of the running round, by player id

export const nextEventsSeed = () => (app.config.seed + pz.roundNo++) >>> 0;
export const connectedN = () => lobbyN(connectedCount());
export const gameDef = (): GameDef => catalog().games.find((x) => x.id === app.config.game) ?? catalog().games[0]!;
export const modeNow = () => modeOf(gameDef(), app.config.modeId);
export const isVersus = () => app.config.modeId === 'versus';
// Ayudante (assist.ts): the players that chose it from their phones. The round reads them once, at the start; a change mid-round waits for the next one.
export const assistIds = () => [...app.players.values()].filter((p) => p.info.assist).map((p) => p.info.id);

// round stats for the results screen: deliveries per chef (the podium, and the MVP of each team)
export const tally = tallyDeliveries(pizzasBus);
export const stats = { delivered: tally.counts };
export const kitchen = tallyKitchen(pizzasBus); // pizzas rescued from the oven and fires put out, for the results
