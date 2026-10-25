// What the Obstaculos screens share while the game is on the TV: the expedition that runs, the campaign level it belongs to, the notice
// of the lobby and the summary the results read. Plain module state, like the `let`s of apps/screen/src/main.ts it came from (F4b).
import { app } from '@pichi/screen-kit/shell/app-state';
import { parseObstOptions, type Biome, type ObstOptions, type RunSummary } from '../index';
import type { ObstRun } from './host';

export const run = {
  obst: null as ObstRun | null,
  campRun: null as string | null, // the campaign level that runs now, null in a quick game
  notice: '', // why the lobby changed the level on its own
  summary: null as RunSummary | null,
};
export const perf = {
  stepMs: [] as number[], // ms the simulation step took, last 600 frames (perf check)
  frameMs: [] as number[], // ms a whole scene update took (simulation + drawing calls), same window
};
export const biomeColor: Record<Biome, string> = {
  beach: '#F2D49B',
  forest: '#4E7D3A',
  mine: '#B87333',
  glacier: '#BFE8F5',
  volcano: '#FF5A1F',
};
export const obstOpts = (): ObstOptions => parseObstOptions(app.config.modeOptions);
export const slotName = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info.name ?? `J${slot + 1}`;
