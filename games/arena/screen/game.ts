// Arena on the screen, through the shell's contract (ScreenGame): the sim runs here at a fixed step and the phones' packets steer the bodies.
// Everything the shell needs from a game is a hook below; the shell names no game. Manchazo (F1) is the round by default; see match/round.ts.
import { teamOf } from '@pichi/core/lobby';
import type { ScreenGame } from '@pichi/screen-kit/shell';
import { app, catalog, dispatch, renderUi, showScene } from '@pichi/screen-kit/shell';
import { arenaManifest } from '../manifest';
import { renderLobby } from './lobby';
import { clearResults, renderResults, winsOf } from './results';
import { ArenaRun, run } from './run';
import { ArenaScene } from './scene';
import { GridRun, gridRun } from './grid/grid-run';
import { GridScene } from './grid/grid-scene';
import { gridPlan } from './grid/mode';
import { hideLobbyHint, startBlocker } from './match/lobby';
import { roundKind } from './match/round';
import { ManchazoRun, matchRun, nextMapSeed } from './match/run';
import { parseSeed } from '../map';
import { MatchScene } from './match/scene';
import { createSabotageHints } from './match/phone-hints';
import { createEventAlert } from './match/event-alert';
import { eventDebug } from './match/debug-events';
import { livingDebug } from './match/debug-living';
import { sendMsg } from '@pichi/screen-kit/net';
import { KINDS, type SabotageKind } from '../sim';

const ID = arenaManifest.id;
const player = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info;
const showing = () => app.config.game === ID && (app.phase === 'playing' || app.phase === 'results');

let scene: ArenaScene | undefined;
const arenaScene = (): ArenaScene =>
  (scene ??= new ArenaScene({
    state: () => (run.arena && showing() ? run.arena.state : null),
    color: (slot) => player(slot)?.color ?? '#ffffff',
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
  }));

// F0: with `?control=A|B` the round is the grid prototype (see grid/)
let gscene: GridScene | undefined;
const gridScene = (): GridScene =>
  (gscene ??= new GridScene({
    state: () => (gridRun.run && showing() ? gridRun.run.state : null),
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
  }));

// F1: Manchazo, the default round
let mscene: MatchScene | undefined;
const matchScene = (): MatchScene =>
  (mscene ??= new MatchScene({
    state: () => (matchRun.run && showing() ? matchRun.run.state : null),
    name: (slot) => player(slot)?.name ?? `J${slot + 1}`,
    teamName: (team) => app.config.teams?.[team]?.name ?? `Equipo ${team + 1}`,
  }));

// F3: what button 2 says on each phone (the sabotage in hand), from the round's state every frame
const hints = createSabotageHints(sendMsg, (slot) => player(slot)?.id);

// F4: every event announced on the TV buzzes every phone
const alerts = createEventAlert(sendMsg, (slot) => player(slot)?.id);

const sceneOf = () => {
  const kind = roundKind();
  return kind === 'push' ? arenaScene() : kind === 'grid' ? gridScene() : matchScene();
};

export const arenaScreen: ScreenGame = {
  manifest: arenaManifest,
  renderScale: 2, // F6: Manchazo is the one game drawn at 3840x2160 on a 4K TV (the logical canvas stays 1920x1080)
  scenes: () => [{ key: 'arena', scene: sceneOf() }],
  frame(delta) {
    hints.sync(matchRun.run && showing() ? matchRun.run.state : null, performance.now());
    alerts.sync(matchRun.run && showing() ? matchRun.run.state : null);
    if (app.phase !== 'playing' || app.config.game !== ID || performance.now() < app.gateUntil) return;
    if ((matchRun.run ?? gridRun.run ?? run.arena)?.advance(delta)) dispatch('timeout'); // the final board has been on screen long enough
  },
  lobby: {
    // a game must not inherit the mode, teams or options of the one before (the relay would refuse the config): Manchazo's one mode, teams dealt by the lobby
    pickReset: () => ({ modeId: 'versus', teams: null, teamsLocked: false, modeOptions: {} }),
    noOptions: true,
    render: renderLobby,
    // "A manchar" with a split that cannot play (one player, an empty team): the round does not start
    beforeStart() {
      if (roundKind() === 'push' || !startBlocker()) return false;
      renderUi();
      return true;
    },
  },
  startMatch() {
    const slots = [...app.players.values()].filter((p) => p.info.connected).map((p) => p.info.slot);
    const kind = roundKind();
    const plan = gridPlan();
    const teams = [...app.players.values()].filter((p) => p.info.connected).map((p) => teamOf(app.config.teams, p.info.id)?.id ?? 0);
    matchRun.run = kind === 'manchazo' ? new ManchazoRun(slots, teams, app.config.seed, nextMapSeed(app.config.seed)) : null;
    gridRun.run = kind === 'grid' && plan ? new GridRun(slots, plan) : null;
    run.arena = kind === 'push' ? new ArenaRun(slots, app.config.seed) : null;
    clearResults();
    showScene(ID);
    return undefined; // the phones keep the pad their config gave them
  },
  reset() {
    const ran = !!(run.arena ?? gridRun.run ?? matchRun.run);
    run.arena = null;
    gridRun.run = null;
    matchRun.run = null;
    hideLobbyHint();
    if (ran) showScene(catalog().defaultGame);
  },
  results: { render: renderResults, scoreOf: winsOf },
  // for the capture tool only: the round jumps to its last tick, so the results can be shot without waiting 90 s
  debug: () => ({
    manchazoSkipToEnd() {
      const g = matchRun.run?.state.grid;
      if (g) g.tick = g.durationTicks - 1;
    },
    // for the capture tool only: puts a sabotage (by name, or its index in the catalog) in the hand of a slot
    manchazoGive(slot: number, kind: SabotageKind | number) {
      const s = matchRun.run?.state;
      const i = s?.grid.bodies.findIndex((b) => b.slot === slot) ?? -1;
      if (s?.match.sab && i >= 0) s.match.sab.held[i] = typeof kind === 'number' ? KINDS[kind]! : kind;
    },
    ...eventDebug(() => matchRun.run?.state), // for the capture tool only: start an event, drop the Hourglass, put a body on a tile
    ...livingDebug(() => matchRun.run?.state), // for the capture tool only: re-time a living element, claim a brush pivot
    // for the capture tool only: the next round plays the map of this seed code (`2·7KQ2M`); the phones cannot do this
    manchazoNextMapSeed(code: string) {
      matchRun.forced = parseSeed(code)?.seed ?? null;
    },
  }),
  players: {
    input(p, m) {
      if (app.config.game !== ID || app.phase !== 'playing') return;
      if (matchRun.run) matchRun.run.receive(p.info.slot, m.x, m.y, m.presses);
      else if (gridRun.run) gridRun.run.receive(p.info.slot, m.x, m.y);
      else run.arena?.receive(p.info.slot, m.x, m.y, m.presses);
    },
  },
};
