// Obstaculos on the screen, through the shell's contract (ScreenGame, EXPERIMENTAL): everything apps/screen/src/main.ts used to do for this game
// behind `config.game === OBST_ID` is a hook here, so the shell names no game (F4b).
import { obstBus } from './bus';
import { app, renderUi } from '@pichi/screen-kit/shell';
import type { ScreenGame } from '@pichi/screen-kit/shell';
import type { Packet } from '../sim/world/input';
import { DEFAULT_OBST_OPTIONS, GAME_ID, toModeOptions } from '../index';
import { obstaculosManifest } from '../manifest';
import { initObstAudio, type MusicState } from './audio';
import { camp } from './campaign-link';
import { obstDebug } from './debug';
import { obstMenu, obstMenuAct } from './lobby-menu-hooks';
import { initLobbyView, renderLobby } from './lobby-view';
import { endObst, obstScene, startObst } from './match';
import { renderResults } from './results-panel';
import { run } from './run-state';

const IDLE_MUSIC: MusicState = {
  biome: 'beach',
  playing: false,
  progress: 0,
  danger: 0,
  stragglers: 0,
  moving: false,
  checkpointed: false,
  maxRopeTension: 0,
  lavaNear: false,
};

export const obstaculosScreen: ScreenGame = (() => {
  let audio: ReturnType<typeof initObstAudio> | undefined;
  return {
    manifest: obstaculosManifest,
    init() {
      audio = initObstAudio(
        obstBus,
        () => run.obst?.biome ?? 'beach',
        () => (run.obst && app.phase === 'playing' ? run.obst.musicState() : IDLE_MUSIC),
      );
      try {
        if (localStorage.getItem('pg.muted') === '1') audio.toggleMute();
      } catch {
        /* storage blocked */
      }
      initLobbyView();
      setInterval(() => {
        if (camp.armed) renderUi();
      }, 250); // the Captain's 3 s before a reset can be confirmed
    },
    scenes: () => [{ key: 'obstaculos', scene: obstScene(), leave: () => obstScene().endLevel() }],
    lobby: {
      // a game that has no versus must not inherit the teams or the options of the one before (the relay would refuse the whole config)
      pickReset: () => ({ modeId: 'coop', teams: null, teamsLocked: false, modeOptions: toModeOptions(DEFAULT_OBST_OPTIONS) }),
      afterPick: () => void camp.enter(),
      render: renderLobby,
      menu: obstMenu,
      menuAct: obstMenuAct,
      back: () => {
        if (camp.on) return false;
        void camp.enter(); // Esc in the quick-game setup goes back to the campaign's hub
        return true;
      },
      beforeStart: () => {
        run.campRun = null;
        return false;
      },
    },
    startMatch: startObst,
    reset(to) {
      endObst();
      if (to === 'menu') {
        run.campRun = null;
        void camp.exit();
      }
    },
    results: { render: renderResults, scoreOf: () => run.obst?.session.run.score ?? 0 },
    players: {
      updated: (p) => run.obst?.setConnected(p.info.slot, p.info.connected),
      left: (p) => run.obst?.setConnected(p.info.slot, false),
      removed: (p) => run.obst?.setConnected(p.info.slot, false),
      input: (p, m) => {
        if (app.config.game === GAME_ID && app.phase === 'playing')
          run.obst?.receive(p.info.slot, { x: m.x, y: m.y, presses: m.presses, signal: m.sig as Packet['signal'], goHeld: m.go });
      },
    },
    key: (key, repeat) => camp.shows(app.phase) && !app.starting && !app.howTo && camp.key(key, repeat),
    globalKey: (e) => {
      if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) audio?.toggleMute(); // the pizza audio listens to the same key
    },
    debug: obstDebug,
  };
})();
