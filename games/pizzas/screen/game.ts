// Pizzas on the screen as a ScreenGame (index.ts re-exports it), assembled from this folder: match/ (the round and its tick loop), lobby/, results/, debug.
import type { PuestoId } from '../sim/puestos';
import { teamOf } from '@pichi/core/lobby';
import { pizzasBus } from './bus';
import { app, bindServices, dispatch, renderUi, setConfig } from '@pichi/screen-kit/shell';
import type { ScreenGame } from '@pichi/screen-kit/shell';
import { addPlayer, dropPlayer, removePlayer, returnPlayer } from '../sim';
import { pizzasManifest } from '../manifest';
import { drawLogo } from './art/ui';
import { initAudio } from './audio';
import { phoneResult } from '../sim/versus/report';
import { pizzasDebug } from './debug';
import { frame, initHost, school, scene } from './match/loop';
import { versusKey } from './match/key-nav';
import { difficultyPatch, initLobbyView, lobbyKey, renderLobby } from './lobby/lobby';
import { moveToTeam } from './lobby/sync';
import { pizzasMenu, pizzasMenuAct } from './lobby/menu';
import { startMatch } from './match/round';
import { renderResults } from './results/panel';
import { initVersusResults, rematch } from './results/versus-view';
import { PIZZAS, puestoOf, pz } from './state';

/** The lobby mark of Pizzas: the finished pizza, as it was the platform's logo before Sofa Arcade. */
function pizzasLogo(): HTMLElement {
  const cv = document.createElement('canvas');
  cv.width = 208;
  cv.height = 228;
  drawLogo(cv);
  return cv;
}

export const pizzasScreen: ScreenGame = {
  manifest: pizzasManifest,
  init() {
    const audio = initAudio(pizzasBus, () => ({
      phase: app.phase,
      started: pz.game.started && app.config.game === PIZZAS,
      timeLeftMs: app.phase === 'playing' && pz.game.started && app.config.game === PIZZAS ? pz.game.params.roundMs - pz.game.time : null,
    }));
    bindServices({ ui: (id) => audio.ui(id), playerJoined: () => audio.playerJoined() }); // the UI sounds of the whole shell are the pizza audio's for now
    initHost();
    initLobbyView();
    initVersusResults();
  },
  scenes: () => [{ key: 'main', scene: scene(), initial: true }],
  frame,
  activate: () => {
    pz.acc = 0; // the time of a stretch in which Pizzas did not run is not owed to its tick loop
  },
  lobby: {
    // a game that has no versus must not inherit the teams or the options of the one before (the relay would refuse the whole config)
    pickReset: (prev) => (prev !== PIZZAS ? { modeOptions: {} } : {}),
    logo: pizzasLogo,
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
      // back within the grace time: same team, same chef; later: the chef sits down again on its spawn tile (and a pause waiting for its team ends)
      if (back && app.phase === 'playing' && pz.game.versus) returnPlayer(pz.game, p.info.id, p.info.slot);
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
  key: (key, repeat) => versusKey(key, repeat) || school.key(key, repeat),
  debug: pizzasDebug,
};
