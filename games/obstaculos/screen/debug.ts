// Obstaculos' part of window.__pg: state for the bots (a phone cannot see the world) and hooks for the capture tool. Never used by the game itself.
// Moved out of apps/screen/src/main.ts (F4b) unchanged.
import { app } from '@pichi/screen-kit/shell/app-state';
import { phaserGame } from '@pichi/screen-kit/shell/game-host';
import { snapshot as snapshotObst } from '../index';
import { camp } from './campaign-link';
import { perf, run } from './run-state';

export const obstDebug = () => ({
  obst: () => {
    if (!run.obst) return null;
    const ss = run.obst.session,
      w = ss.world;
    const full = JSON.parse(JSON.stringify(snapshotObst(w)));
    delete full.grid;
    return {
      ...full,
      phase: app.phase,
      sess: ss.status,
      level: w.level.def.id,
      levelIndex: ss.levelIndex,
      tick: w.tick,
      countdownMs: ss.countdownMs,
      over: ss.over,
      world: w.status,
    };
  },
  obstGrid: () =>
    run.obst
      ? {
          w: run.obst.session.world.grid.w,
          h: run.obst.session.world.grid.h,
          cells: Array.from(run.obst.session.world.grid.cells),
          rows: run.obst.session.world.level.def.rows,
        }
      : null,
  obstPerf: () => {
    const q = (src: number[]) => {
      const a = [...src].sort((x, y) => x - y);
      return { p50: a[Math.floor(a.length * 0.5)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, max: a[a.length - 1] ?? 0 };
    };
    return { n: perf.stepMs.length, ...q(perf.stepMs), frame: q(perf.frameMs), fps: phaserGame().loop.actualFps };
  },
  obstWin: () => {
    if (!run.obst) return;
    const w = run.obst.session.world,
      g = w.level.markers.goal[0]!;
    for (const p of w.players)
      if (p.connected) {
        p.body.x = g.x * 48 + 7;
        p.body.y = (g.y + 1) * 48 - 46;
        p.body.vx = 0;
        p.body.vy = 0;
      }
  },
  obstFail: () => {
    if (!run.obst) return;
    for (const p of run.obst.session.world.players) p.body.y = 100_000;
  },
  obstSkip: (ms: number) => {
    if (!run.obst) return;
    for (let t = 0; t < ms; t += 1000 / 60) run.obst.step(1000 / 60);
  },
  camp: () => ({
    on: camp.on,
    resultOn: camp.resultOn,
    state: camp.state,
    expId: camp.flow.exp?.id ?? null,
    outcome: camp.flow.outcome,
    run: run.campRun,
    starting: app.starting,
    howTo: !!app.howTo,
    busy: camp.isBusy,
  }), // e2e: what the campaign believes
});
