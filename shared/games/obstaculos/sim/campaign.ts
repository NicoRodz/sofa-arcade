// Campaign layer for 2 players ("Obstaculos en cadena: campana y profundizacion", plan §3, §4, §5.1). It is OPT-IN: a world made without
// `WorldOptions.campaign` has `world.camp === null` and plays exactly as before (the 15 levels, the quick match and every old hash).
//
// ===== MECHANIC IDS (owner: S1, the only writer of sim/ and the rules; S2 reads them for `introduces` / `requires`) =====
//   signals     dynamic 1  debut 1-2   PlayerStep.signal; events obst.signal, obst.countdown; works from the bubble
//   anchor      dynamic 2  debut 1-4   B on the ground = planted = infinite rope mass (campaign); the one pulled by a hanger slides 0.5 tile/s
//   superjump   dynamic 3  debut 2-2   two ground jumps <= 150 ms apart: jump height x1.3 for both; event obst.superJump
//   Layer-for-2 rules (no id: they are always on in a campaign world): rope +20 %, edge assist (obst.edgeAssist), throw arc (PlayerSnap.arc),
//   shared hearts (death -> bubble beside the partner; both down -> checkpoint; 0 hearts -> refill, obst.heartsOut), camera hints, bubble v2.
//   Later phases (A5/A6) add ids here: balance, target, softEnemies, ice, wind, pickaxe, lantern, bungee, sinking, geyser.
//
// ===== INTERFACE FOR S2 (levels and validator) =====
//   createWorld({ ..., campaign: { world: WorldId, n?: number } })   n defaults to the number of slots
//   campaignParams(n, worldId)                          every number of the layer as a function of N (N=2 frozen by test, see campaign.test.ts)
//   physicsForCampaign(params, p90LatencyMs)            PhysicsParams (coyote, buffer, stickyEdges) of that world: the validator must use THESE, not physicsFor(diff)
//   params.ropeLen                                      rope length in px (the legacy ROPE_LEN x 1.2 = 201.6); RopeLink.base carries it
//   params.superJumpMult                                jump HEIGHT x1.3 (v0 x sqrt(1.3)); superJumpV0(params) gives the launch speed in px/s
//   params.band                                         world band of D in the plan's 0..1 scale (the metric of this repo is 0..100: multiply by 100)
//   WORLD_ORDER, worldForDifficulty(world, diff)        lobby Easy = previous world's numbers, Hard = next world's
// A level in the campaign is a plain LevelDef (rows, params, hazard...). Nothing in LevelDef changed.
import { DIFFICULTY_PARAMS, JUMP_V0, LATENCY_FRAME_MS, ROPE_LEN } from '../constants';
import type { Difficulty } from '../../../difficulty';
import type { DifficultyParams } from '../constants';
import type { PhysicsParams } from './player';

export type WorldId = 'beach' | 'forest' | 'glacier' | 'mine' | 'volcano' | 'summit';
export const WORLD_ORDER: readonly WorldId[] = ['beach', 'forest', 'glacier', 'mine', 'volcano', 'summit'];

// Plan §3, per world. `rescueSec` is the existing bubbleSec (time out of camera before the bubble). `hearts` Infinity = unlimited.
interface WorldRow { band: readonly [number, number]; hearts: number; checkpointEverySec: number; forgiveMult: number; rescueSec: number; hazardMult: number }
export const WORLD_TABLE: Record<WorldId, WorldRow> = {
  beach: { band: [0, 0.15], hearts: Infinity, checkpointEverySec: 15, forgiveMult: 1.5, rescueSec: 1, hazardMult: 0.6 },
  forest: { band: [0.15, 0.35], hearts: 6, checkpointEverySec: 25, forgiveMult: 1.3, rescueSec: 2, hazardMult: 0.8 },
  glacier: { band: [0.35, 0.55], hearts: 5, checkpointEverySec: 30, forgiveMult: 1.15, rescueSec: 3, hazardMult: 0.9 },
  mine: { band: [0.5, 0.7], hearts: 5, checkpointEverySec: 40, forgiveMult: 1, rescueSec: 3, hazardMult: 1 },
  volcano: { band: [0.65, 0.9], hearts: 4, checkpointEverySec: 45, forgiveMult: 1, rescueSec: 4, hazardMult: 1.1 },
  summit: { band: [0.85, 1], hearts: 3, checkpointEverySec: 60, forgiveMult: 0.9, rescueSec: 5, hazardMult: 1.2 },
};

// Lobby difficulty inside the campaign (plan §3): Easy plays with the previous world's numbers, Hard with the next one's.
export function worldForDifficulty(world: WorldId, d: Difficulty): WorldId {
  const i = WORLD_ORDER.indexOf(world);
  const j = d === 'easy' ? i - 1 : d === 'hard' ? i + 1 : i;
  return WORLD_ORDER[Math.max(0, Math.min(WORLD_ORDER.length - 1, j))]!;
}

export interface CampaignParams {
  n: number; // players the level was designed and validated for (2..8)
  world: WorldId;
  // --- rope and anchor (plan §4 #2, §5.1, §5.2)
  ropeMult: number; // x the legacy ROPE_LEN
  ropeLen: number; // px
  anchorHolds: number; // hangers one anchor holds without sliding
  slideTilesPerSec: number; // a grounded player dragged by a hanger (or an anchor over its limit) slides this fast towards the edge
  // --- edge assist (plan §5.1): a hanger whose head reaches the ledge climbs on its own
  edgeAssist: boolean;
  edgeReachPx: number; // the head may be this far below the ledge top (px)
  // --- super jump (plan §4 #3)
  superJumpWindowMs: number;
  superJumpMult: number; // jump height multiplier
  // --- forgiveness and rules (plan §3)
  forgiveMult: number;
  hearts: number;
  hazardMult: number;
  rescueSec: number;
  checkpointEverySec: number;
  band: readonly [number, number];
  restartAtStart: boolean; // 0 hearts: Summit goes back to the start, the rest to the checkpoint
  // --- bubble v2 (plan §5.1): mashing A speeds the bubble up
  bubbleMashMax: number; // max boost levels
  bubbleMashGain: number; // speed multiplier gained per level
  // --- signals (plan §4 #1)
  signalShowSec: number;
  signalHoldSec: number; // holding "go" this long starts the 3-2-1
  // --- camera (plan §5.1): read by screen/render/camera.ts
  camPadTiles: number;
  camLookAtGoal: boolean;
}

// N=2 is frozen by campaign.test.ts (snapshot). N>2 only adds what the plan's §5.2 table says; everything else stays as at N=2.
export function campaignParams(n: number, world: WorldId = 'forest'): CampaignParams {
  const N = Math.max(2, Math.min(8, Math.round(n)));
  const row = WORLD_TABLE[world];
  const extra = N - 2;
  return {
    n: N, world,
    ropeMult: 1.2, ropeLen: ROPE_LEN * 1.2,
    anchorHolds: N <= 2 ? 1 : 2, slideTilesPerSec: 0.5,
    edgeAssist: true, edgeReachPx: 24,
    superJumpWindowMs: 150 + 30 * extra, superJumpMult: 1.3,
    forgiveMult: row.forgiveMult,
    hearts: Number.isFinite(row.hearts) ? row.hearts + Math.floor(extra / 2) : Infinity,
    hazardMult: row.hazardMult, rescueSec: row.rescueSec, checkpointEverySec: row.checkpointEverySec, band: row.band,
    restartAtStart: world === 'summit',
    bubbleMashMax: 4, bubbleMashGain: 0.5,
    signalShowSec: 2, signalHoldSec: 0.4,
    camPadTiles: 3, camLookAtGoal: true,
  };
}

export const superJumpV0 = (c: CampaignParams): number => JUMP_V0 * Math.sqrt(c.superJumpMult);

// Coyote and buffer of the world (plan §3 "Coyote/buffer"): the Normal base x the world's multiplier, plus the adaptive latency term.
export function physicsForCampaign(c: CampaignParams, p90LatencyMs = 0): PhysicsParams {
  const n = DIFFICULTY_PARAMS.normal;
  const coyote = Math.round(n.coyoteBase * c.forgiveMult) + Math.ceil(Math.max(0, p90LatencyMs) / LATENCY_FRAME_MS);
  return { coyote: Math.min(Math.round(n.coyoteCap * c.forgiveMult), coyote), buffer: Math.round(n.bufferFrames * c.forgiveMult), stickyEdges: c.world === 'beach' };
}

// The legacy DifficultyParams a campaign world runs with (lives, bubble delay, hazard speed come from the world; the rest is Normal's).
export function dparamsForCampaign(c: CampaignParams): DifficultyParams {
  const n = DIFFICULTY_PARAMS.normal;
  return { ...n, lives: c.hearts, bubbleSec: c.rescueSec, bubbleCostsLife: false, hazardSpeed: c.hazardMult, handZoneTiles: c.world === 'beach' ? DIFFICULTY_PARAMS.easy.handZoneTiles : n.handZoneTiles, stickyEdges: c.world === 'beach', band: [c.band[0] * 100, c.band[1] * 100] };
}

// --- signals (dynamic 1)
export type SignalKind = 'arrowL' | 'arrowR' | 'arrowU' | 'arrowD' | 'wait' | 'go';
export const SIGNAL_KINDS: readonly SignalKind[] = ['arrowL', 'arrowR', 'arrowU', 'arrowD', 'wait', 'go'];
