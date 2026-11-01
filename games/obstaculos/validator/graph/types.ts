// Shapes of the reachability graph: the environment a validation runs in, the open state, segments, edges, the graph itself.
import type { DifficultyParams } from '../../constants';
import type { Difficulty } from '@pichi/core';
import type { Cell, GameMode } from '../../types';
import type { Mechanic } from '../../mechanics';
import type { WorldId } from '../../sim/rules/campaign';
import type { PhysicsParams } from '../../sim/player/player';
import type { TileGrid } from '../../sim/world/tiles';
import type { Landing, Plan } from '../sim';

// allow: the mechanics the explorer knows (the learning test's bot); undefined = all of them.
// world: a campaign world (sim/campaign.ts): its coyote/buffer, hand zone and rope replace the legacy `diff` table. ropeLen overrides the rope (px).
export interface Env {
  n: number;
  mode: GameMode;
  diff: Difficulty;
  allow?: ReadonlySet<Mechanic>;
  world?: WorldId;
  ropeLen?: number;
}
// The numbers a validation runs with: the campaign world's (S1's campaignParams, N-dependent) or the legacy difficulty's.
export interface OpenState {
  open: Set<string>;
  doors: Set<number>;
  pick?: boolean;
} // pick: the pioneer has the pickaxe (ice walls can be climbed)
export type EdgeKind = 'jump' | 'tower' | 'hand' | 'throw' | 'swing' | 'ladder' | 'ride' | 'climb' | 'superjump';
export interface Edge {
  from: number;
  to: number;
  kind: EdgeKind;
  coop: boolean; // needs a teammate (tower, hand, throw, swing, balance)
  timing: boolean; // moving or crumbling surfaces, trampoline bounces, belts, one-shot timing
  steps: number;
  takeoffX: number;
  landX: number; // px; steps = simulated length
  plan?: Plan;
  k?: number;
  ring?: number;
  obj?: string;
  rise: number; // rise in px: takeoff floor minus landing floor (positive = up)
  landCell: Cell;
}
export interface Seg {
  id: number;
  row: number;
  x0: number;
  x1: number;
  tramp?: boolean;
} // tramp: boyas (the surface bounces)
export interface Graph {
  // shifted: platform tiles that exist only at the far end of a mover or balance (reachable by riding, never by a direct jump)
  grid: TileGrid;
  shifted: Uint8Array;
  segs: Seg[];
  cellSeg: Int32Array;
  adj: Edge[][];
  params: PhysicsParams;
  env: Env;
  ladders: { x: number; y0: number; y1: number }[];
  dp: DifficultyParams;
  ropeLen: number;
}

export interface GraphOpts {
  pioneer: boolean;
  catchTargets?: Set<number>;
  cache?: SimCache;
}

// Sim results of one validation, shared by the graphs it builds (the closure rebuilds the terrain whenever something opens, and most
// segments do not change). The key is the whole terrain within CACHE_COLS columns of the segment plus the plan, relative to the
// segment: translation by whole tiles does not change a trajectory.
export type SimCache = Map<string, Map<string, (Omit<Landing, 'cx' | 'ty'> & { dcx: number; dty: number }) | null>>;

export interface PathStep {
  edge: Edge;
}
