// Pizzas on the screen as a ScreenGame, assembled from the transitional modules in this folder. F4c replaces it with the game's own
// games/pizzas/screen (index, coop-view, versus-view, results-panel) and deletes the ramas that still read `pz` from the shell.
import type { PuestoId } from '@pichi/game-pizzas/sim/puestos';
import { teamOf } from '@pichi/core/lobby/teams';
import { gameBus } from '@pichi/screen-kit/bus';
import { app, bindServices, dispatch, renderUi, setConfig } from '@pichi/screen-kit/shell/app-state';
import type { ScreenGame } from '@pichi/screen-kit/shell/game';
import { addPlayer, dropPlayer, rejoinPlayer, removePlayer } from '@pichi/game-pizzas/sim';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import { initAudio } from '@pichi/game-pizzas/screen/audio';
import { phoneResult } from '@pichi/game-pizzas/sim/versus/report';
import { pizzasDebug } from './debug';
import { initHost, school, scene } from './host';
import { difficultyPatch, initLobbyView, lobbyKey, renderLobby } from './lobby';
import { moveToTeam } from './lobby-sync';
import { pizzasMenu, pizzasMenuAct } from './lobby-menu';
import { startMatch } from './round';
import { renderResults } from './results';
import { initVersusResults, rematch } from './results-versus';
import { PIZZAS, puestoOf, pz } from './state';

export const pizzasScreen: ScreenGame = {
  manifest: pizzasManifest,
  init() {
    const audio = initAudio(gameBus, () => ({
      phase: app.phase,
      started: pz.game.started && app.activeGame === PIZZAS,
      timeLeftMs: app.phase === 'playing' && pz.game.started && app.activeGame === PIZZAS ? pz.game.params.roundMs - pz.game.time : null,
    }));
    bindServices({ ui: (id) => audio.ui(id), playerJoined: () => audio.playerJoined() }); // the UI sounds of the whole shell are the pizza audio's for now
    initHost();
    initLobbyView();
    initVersusResults();
  },
  scenes: () => [{ key: 'main', scene: scene(), initial: true }],
  lobby: {
    // a game that has no versus must not inherit the teams or the options of the one before (the relay would refuse the whole config)
    pickReset: (prev) => (prev !== PIZZAS ? { modeOptions: {} } : {}),
    render: renderLobby,
    key: lobbyKey,
    difficulty: difficultyPatch,
    beforeStart: () => school.offer(),
    menu: pizzasMenu,
    menuAct: pizzasMenuAct,
  },
  startMatch,
  enterSchool: () => school.begin(),
  reset(to) {
    if (to !== 'lobby') return;
    scene().endRound();
    if (app.config.modeId === 'versus' && app.config.teamsLocked !== pz.lockBeforeStart) setConfig({ teamsLocked: pz.lockBeforeStart }); // the match is over: the host's own lock again
  },
  phaseExtras: (phase) => ({
    puestos: phase === 'playing' ? pz.puestoMsg : undefined,
    ...(phase === 'results' && pz.game.versus && pz.report ? { result: phoneResult(pz.report) } : {}),
  }),
  results: {
    render: renderResults,
    // cooperative: every player carries the team score; versus: the score of the player's own team
    scoreOf: (id) =>
      pz.game.versus ? (pz.game.teams[pz.game.players.get(id)?.team ?? teamOf(app.config.teams, id)?.id ?? 0]?.score ?? 0) : pz.game.score,
    enter: () => (pz.game.versus ? rematch() : dispatch('again')),
  },
  players: {
    joined: (p) => addPlayer(pz.game, p.info.id, p.info.slot),
    updated: (p, back) => {
      if (back && app.phase === 'playing' && pz.game.versus) rejoinPlayer(pz.game, p.info.id); // back within the grace time: same team, same chef
    },
    left: (p) => {
      if (app.phase === 'playing' && pz.game.versus) dropPlayer(pz.game, p.info.id); // a ghost for GHOST_MS: what it held goes to a free counter
    },
    removed: (p) => removePlayer(pz.game, p.info.id),
  },
  message(m) {
    switch (m.t) {
      case 'setTeam':
        moveToTeam(m.playerId, m.teamId); // a phone asked to change team
        break;
      case 'schoolDone': {
        const q = app.players.get(m.playerId);
        if (q) q.info = { ...q.info, school: true };
        if (m.skip) school.skip(m.playerId);
        break;
      } // a phone knows the school (or pressed Saltar in it)
      case 'assist': {
        // a phone switched Ayudante on or off in the lobby
        const p = app.players.get(m.playerId);
        if (p) {
          p.info = m.on ? { ...p.info, assist: true } : (({ assist: _a, ...rest }) => rest)(p.info);
          renderUi();
        }
        break;
      }
      case 'puesto': {
        // the phone picked another puesto with "Cambiar": the screen lights it up again
        if (app.phase === 'playing' && app.players.has(m.playerId))
          puestoOf.set(m.playerId, { ids: m.puestos as PuestoId[], stamp: ++pz.puestoStamp });
        break;
      }
    }
  },
  key: (key, repeat) => school.key(key, repeat),
  debug: pizzasDebug,
};
