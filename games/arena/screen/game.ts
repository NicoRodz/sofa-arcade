// Arena on the screen, through the shell's contract (ScreenGame): the sim runs here at a fixed step and the phones' packets steer the fighters.
// Everything the shell needs from a game is a hook below; the shell names no game.
import type { ScreenGame } from '@pichi/screen-kit/shell';
import { app, catalog, dispatch, showScene } from '@pichi/screen-kit/shell';
import { arenaManifest } from '../manifest';
import { renderLobby } from './lobby';
import { clearResults, renderResults, winsOf } from './results';
import { ArenaRun, run } from './run';
import { ArenaScene } from './scene';

const ID = arenaManifest.id;
const player = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info;

let scene: ArenaScene | undefined;
const arenaScene = (): ArenaScene =>
  (scene ??= new ArenaScene({
    state: () => (run.arena && app.config.game === ID && (app.phase === 'playing' || app.phase === 'results') ? run.arena.state : null),
    color: (slot) => player(slot)?.color ?? '#ffffff',
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
  }));

export const arenaScreen: ScreenGame = {
  manifest: arenaManifest,
  scenes: () => [{ key: 'arena', scene: arenaScene() }],
  frame(delta) {
    if (app.phase !== 'playing' || app.config.game !== ID || !run.arena || performance.now() < app.gateUntil) return;
    if (run.arena.advance(delta)) dispatch('timeout'); // the winner has been on screen long enough
  },
  lobby: {
    // a game with no options must not inherit the mode, teams or options of the one before (the relay would refuse the config)
    pickReset: () => ({ modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {} }),
    render: renderLobby,
  },
  startMatch() {
    const slots = [...app.players.values()].filter((p) => p.info.connected).map((p) => p.info.slot);
    run.arena = new ArenaRun(slots, app.config.seed);
    clearResults();
    showScene(ID);
    return undefined; // the phones keep the pad their config gave them
  },
  reset() {
    const ran = !!run.arena;
    run.arena = null;
    if (ran) showScene(catalog().defaultGame);
  },
  results: { render: renderResults, scoreOf: winsOf },
  players: {
    input(p, m) {
      if (app.config.game === ID && app.phase === 'playing') run.arena?.receive(p.info.slot, m.x, m.y, m.presses);
    },
  },
};
