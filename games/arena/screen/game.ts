// Arena on the screen, through the shell's contract (ScreenGame): the sim runs here at a fixed step and the phones' packets steer the fighters.
// Everything the shell needs from a game is a hook below; the shell names no game.
import type { ScreenGame } from '@pichi/screen-kit/shell';
import { app, catalog, dispatch, showScene } from '@pichi/screen-kit/shell';
import { arenaManifest } from '../manifest';
import { renderLobby } from './lobby';
import { clearResults, renderResults, winsOf } from './results';
import { ArenaRun, run } from './run';
import { ArenaScene } from './scene';
import { GridRun, gridRun } from './grid/grid-run';
import { GridScene } from './grid/grid-scene';
import { gridPlan } from './grid/mode';

const ID = arenaManifest.id;
const player = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info;

let scene: ArenaScene | undefined;
const arenaScene = (): ArenaScene =>
  (scene ??= new ArenaScene({
    state: () => (run.arena && app.config.game === ID && (app.phase === 'playing' || app.phase === 'results') ? run.arena.state : null),
    color: (slot) => player(slot)?.color ?? '#ffffff',
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
  }));

// F0: with `?control=A|B` the round is the grid prototype (see grid/); without it, Arena's pushing round
let gscene: GridScene | undefined;
const gridScene = (): GridScene =>
  (gscene ??= new GridScene({
    state: () => (gridRun.run && app.config.game === ID && (app.phase === 'playing' || app.phase === 'results') ? gridRun.run.state : null),
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
  }));

export const arenaScreen: ScreenGame = {
  manifest: arenaManifest,
  scenes: () => [{ key: 'arena', scene: gridPlan() ? gridScene() : arenaScene() }],
  frame(delta) {
    if (app.phase !== 'playing' || app.config.game !== ID || performance.now() < app.gateUntil) return;
    if ((gridRun.run ?? run.arena)?.advance(delta)) dispatch('timeout'); // the winner has been on screen long enough
  },
  lobby: {
    // a game with no options must not inherit the mode, teams or options of the one before (the relay would refuse the config)
    pickReset: () => ({ modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {} }),
    noOptions: true,
    render: renderLobby,
  },
  startMatch() {
    const slots = [...app.players.values()].filter((p) => p.info.connected).map((p) => p.info.slot);
    const plan = gridPlan();
    gridRun.run = plan ? new GridRun(slots, plan) : null;
    run.arena = plan ? null : new ArenaRun(slots, app.config.seed);
    clearResults();
    showScene(ID);
    return undefined; // the phones keep the pad their config gave them
  },
  reset() {
    const ran = !!(run.arena ?? gridRun.run);
    run.arena = null;
    gridRun.run = null;
    if (ran) showScene(catalog().defaultGame);
  },
  results: { render: renderResults, scoreOf: winsOf },
  players: {
    input(p, m) {
      if (app.config.game !== ID || app.phase !== 'playing') return;
      if (gridRun.run) gridRun.run.receive(p.info.slot, m.x, m.y);
      else run.arena?.receive(p.info.slot, m.x, m.y, m.presses);
    },
  },
};
