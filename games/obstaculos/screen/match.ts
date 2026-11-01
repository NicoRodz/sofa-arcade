// An Obstaculos round on the TV: the expedition runs in its own Phaser scene (the real world at 60 Hz, see host.ts), fed by the phones' last
// packet. Moved out of apps/screen/src/main.ts (F4b): startObst / endObst, the scene's host and the perf counters.
import type { MatchStart } from '@pichi/core';
import { catalog, app, dispatch, showScene } from '@pichi/screen-kit/shell';
import { obstBus } from './bus';
import { resolveLevel, GAME_ID } from '../index';
import { ObstaclesScene } from './render/scene';
import { ObstRun } from './host';
import { camp } from './campaign-link';
import { obstOpts, perf, run, slotLook, slotName } from './run-state';

let scene: ObstaclesScene | undefined;
export function obstScene(): ObstaclesScene {
  if (scene) return scene;
  const s: ObstaclesScene = new ObstaclesScene(
    {
      step(delta) {
        if (app.phase !== 'playing' || app.config.game !== GAME_ID || !run.obst || performance.now() < app.gateUntil) return;
        const t0 = performance.now();
        run.obst.step(delta);
        perf.stepMs.push(performance.now() - t0);
        if (perf.stepMs.length > 600) perf.stepMs.shift();
      },
      world: () =>
        run.obst && app.config.game === GAME_ID && (app.phase === 'playing' || app.phase === 'results') ? run.obst.world() : null,
      afterRender: (v) => run.obst?.afterRender(v),
    },
    obstBus,
  );
  const base = s.update.bind(s);
  s.update = (t: number, d: number) => {
    const a = performance.now();
    base(t, d);
    if (app.phase === 'playing' && app.config.game === GAME_ID) {
      perf.frameMs.push(performance.now() - a);
      if (perf.frameMs.length > 600) perf.frameMs.shift();
    }
  };
  scene = s;
  return s;
}

export function startObst(): MatchStart | undefined {
  const live = [...app.players.values()].filter((p) => p.info.connected);
  const o = obstOpts();
  const level = resolveLevel(o.level, live.length, o.tether);
  const spec = run.campRun ? camp.runSpec(run.campRun) : null; // a campaign level: its own tilemap and mode, one level per run, saved the moment it ends
  const cr = spec && !('ok' in spec) ? spec : null;
  if (!cr) run.campRun = null;
  run.summary = null;
  run.obst = new ObstRun(
    {
      mode: cr ? cr.mode : o.tether,
      difficulty: app.config.difficulty,
      level: cr ? 1 : level,
      seed: app.config.seed,
      slots: live.map((p) => p.info.slot),
      ...(cr ? { levels: [cr.def], campaign: { world: cr.world } } : {}),
    },
    {
      names: slotName,
      looks: slotLook,
      bus: obstBus,
      onOver: () => {
        run.summary = run.obst?.session.summary() ?? null;
        if (cr) void camp.over().then(() => dispatch('timeout'));
        else dispatch('timeout');
      },
      ...(cr ? { onLevelEnd: (e) => camp.levelEnd(e) } : {}),
    },
  );
  showScene(GAME_ID);
  if (run.campRun)
    return {
      gameId: GAME_ID,
      modeId: 'coop',
      mapId: 'campaign',
      difficulty: app.config.difficulty,
      teams: null,
      modeOptions: { campaign: true },
    }; // the phones show the signal pad
  return undefined;
}

export function endObst() {
  const ran = !!run.obst; // an Obstaculos round was on (config.game may be anything again by the time the screen goes back to the menu)
  run.obst = null;
  if (ran) showScene(catalog().defaultGame);
}
