// The Pizzas lobby's state and what keeps it coherent: modes and teams (Versus F1: the screen is the host, it owns the teams, the phones only ask),
// the map and sabotage proposals that follow who is connected. TRANSITIONAL (F4b): moved out of apps/screen/src/main.ts unchanged.
import { canStart, type LobbyConfig } from '@pichi/core';
import { movePlayer, reshuffleTeams } from '@pichi/core/lobby/teams';
import { NAV_SFX } from '@pichi/screen-kit/menu';
import { sendMsg } from '@pichi/screen-kit/net/socket';
import { app, connectedCount, connectedIds, renderUi, services, setConfig } from '@pichi/screen-kit/shell/app-state';
import { modeOf, type ModeId } from '@pichi/core/contract';
import { SABOTAGE_OPTION } from '../../sim/sabotage-config';
import { EVENTS_OPTION } from '../../sim/midround';
import { MUTATE_OPTION } from '../../sim/mutate/plan';
import { defaultMap, fixedMap, isMapChoice, mapStatus, replacementMap, type MapChoice } from '../../sim/maps';
import { versusMap } from '../../sim/versus/maps';
import {
  VERSUS_AUTO,
  VERSUS_RANDOM,
  defaultModeOptions,
  defaultVersusChoice,
  isVersusChoice,
  resolveVersusMap,
  syncTeams,
  teamSizes,
  versusAvailability,
  versusLobbyMaps,
  versusMapStatus,
} from '../../sim/versus/lobby';
import { versusStartProblem } from '../../sim/versus/start-fit';
import { PIZZAS, assistIds, connectedN, gameDef, isVersus, modeNow, pz } from '../state';

export function setMode(id: ModeId) {
  if (app.phase !== 'lobby' || id === app.config.modeId) return;
  const mode = modeOf(gameDef(), id);
  if (id === 'versus') {
    const av = versusAvailability(mode, connectedCount());
    if (!av.ok) {
      pz.teamNotice = av.reason;
      renderUi();
      return;
    }
  }
  pz.teamNotice = '';
  pz.teamsTouched = false;
  pz.mapTouched = false;
  pz.sabotageTouched = false;
  pz.mapNotice = '';
  pz.series = null; // another mode: the series starts over
  const teams = syncTeams(mode, null, connectedIds(), app.config.seed, false);
  setConfig({
    modeId: id,
    teams,
    teamsLocked: false,
    modeOptions: id === 'versus' ? defaultModeOptions(mode, app.config.difficulty) : {},
    map: id === 'versus' ? defaultVersusChoice(teamSizes(teams), pz.played) : defaultMap(connectedN(), pz.played).id,
  });
}
// A phone ("Cambiar de equipo") or the host (click on a chip) moves a player; the lobby decides (locked teams, unknown team, a player that is not here).
export function moveToTeam(playerId: number, teamId: number) {
  if (app.phase !== 'lobby' || !isVersus() || !app.config.teams || !connectedIds().includes(playerId)) return;
  const r = movePlayer(app.config.teams, playerId, teamId, app.config.teamsLocked);
  if (!r.ok) {
    pz.teamNotice = r.reason;
    renderUi();
    return;
  }
  pz.teamNotice = '';
  pz.teamsTouched = true;
  setConfig({ teams: r.teams });
}
export function shuffleTeams() {
  if (!app.config.teams) return;
  if (app.config.teamsLocked) {
    pz.teamNotice = 'Los equipos están bloqueados';
    renderUi();
    return;
  }
  pz.teamNotice = '';
  pz.teamsTouched = false;
  setConfig({ teams: reshuffleTeams(app.config.teams, (Math.random() * 2 ** 32) >>> 0) });
}
export function setSabotage(v: string) {
  if (app.phase !== 'lobby' || !isVersus() || app.config.modeOptions[SABOTAGE_OPTION] === v) return;
  pz.sabotageTouched = true;
  services.ui(NAV_SFX.move);
  setConfig({ modeOptions: { ...app.config.modeOptions, [SABOTAGE_OPTION]: v } });
}
// The mid-round events option (Sí / No, both modes of the pizza game): Sí on Normal and Difícil, No on Fácil, until the host picks. Pills and the E key.
export function setEvents(on: boolean) {
  if (app.phase !== 'lobby' || app.config.game !== PIZZAS) return;
  services.ui(NAV_SFX.move);
  setConfig({ modeOptions: { ...app.config.modeOptions, [EVENTS_OPTION]: on } });
}
// The mutating kitchen option (coop only): Sí on Normal and Difícil, No on Fácil, until the host picks.
export function setMutate(on: boolean) {
  if (app.phase !== 'lobby' || app.config.game !== PIZZAS || isVersus()) return;
  services.ui(NAV_SFX.move);
  setConfig({ modeOptions: { ...app.config.modeOptions, [MUTATE_OPTION]: on } });
}

// Why the round cannot start yet ('' when it can). Versus also needs a legal split.
export function startProblem(): string {
  if (!canStart([...app.players.values()].map((p) => p.info))) return 'Esperando jugadores';
  if (isVersus()) {
    return versusStartProblem(modeNow(), app.config.teams, new Set(assistIds())); // a split like 5 contra 3 has no map (all greyed): it does not start on one it just refused
  }
  return '';
}

const patchConfig = (patch: Partial<LobbyConfig>) => {
  app.config = { ...app.config, ...patch };
  sendMsg({ t: 'config', ...app.config });
};
// Keeps the lobby coherent with who is connected: versus that stopped being possible falls back to coop (saying so), the teams follow the
// players, and the map proposal follows the teams. Returns true when the mode is versus.
export function syncLobby(n: number): boolean {
  if (isVersus()) {
    const av = versusAvailability(modeNow(), connectedCount());
    if (!av.ok) {
      pz.teamNotice = `${av.reason}: se volvió a Cooperativo`;
      pz.mapTouched = false;
      patchConfig({ modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {}, map: defaultMap(n, pz.played).id });
    }
  }
  if (!isVersus()) {
    if (isVersusChoice(app.config.map)) patchConfig({ map: defaultMap(n, pz.played).id });
    syncMap(n);
    return false;
  }
  const teams = syncTeams(modeNow(), app.config.teams, connectedIds(), app.config.seed, pz.teamsTouched);
  if (teams !== app.config.teams) patchConfig({ teams });
  syncVersusMap();
  return true;
}
function syncVersusMap() {
  const sizes = teamSizes(app.config.teams);
  const cur = app.config.map;
  if (!isVersusChoice(cur)) {
    patchConfig({ map: defaultVersusChoice(sizes, pz.played) });
    return;
  }
  const m = versusMap(cur);
  if (!pz.mapTouched) {
    const d = defaultVersusChoice(sizes, pz.played);
    if (cur !== d) patchConfig({ map: d });
    return;
  }
  if (m && versusMapStatus(m, sizes).state === 'blocked') {
    const r = versusLobbyMaps(sizes).find((x) => x.status.state === 'recommended')?.map;
    pz.mapNotice = `${m.name} no sirve para ${sizes.join(' contra ')}: se cambió a ${r?.name ?? 'Aleatorio'}`;
    patchConfig({ map: r ? (r.id as LobbyConfig['map']) : VERSUS_AUTO });
  } else if (!m) pz.mapNotice = '';
}

// The generated versus map of a seed is expensive enough (bounded attempts, each one validated) not to redo it on every render.
let vsGenCache: { key: string; rows: readonly string[] } | null = null;
export function versusGenerated(seed: number, difficulty: LobbyConfig['difficulty'], sizes: readonly number[]) {
  const key = `${seed}|${difficulty}|${Math.max(0, ...sizes)}`;
  if (vsGenCache?.key !== key) vsGenCache = { key, rows: resolveVersusMap(VERSUS_RANDOM, seed, difficulty, sizes, Math.random).rows };
  return vsGenCache;
}

// Keeps the selection useful for the people connected: proposes a default until the host picks by hand, and moves off a map
// that got blocked because someone joined or left (saying so).
function syncMap(n: number) {
  if (!pz.mapTouched) {
    const d = defaultMap(n, pz.played).id;
    if (app.config.map !== d) patchConfig({ map: d });
    return;
  }
  const cur =
    isMapChoice(app.config.map) && app.config.map !== 'auto' && app.config.map !== 'random'
      ? fixedMap(app.config.map as MapChoice)
      : undefined;
  if (cur && mapStatus(cur, n).state === 'blocked') {
    const r = replacementMap(cur, n);
    pz.mapNotice = `${cur.name} no sirve con ${n} ${n === 1 ? 'jugador' : 'jugadores'}: se cambió a ${r.name}`;
    patchConfig({ map: r.id });
  } else if (!cur) pz.mapNotice = '';
}
