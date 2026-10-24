// Campaign layer for 2 players ("Obstaculos en cadena: campana y profundizacion", plan §3, §4, §5.1). It is OPT-IN: a world made without
// `WorldOptions.campaign` has `world.camp === null` and plays exactly as before (the 15 levels, the quick match and every old hash).
//
// ===== MECHANIC IDS (owner: S1, the only writer of sim/ and the rules; S2 reads them for `introduces` / `requires`) =====
//   signals     dynamic 1  debut 1-2   PlayerStep.signal; events obst.signal, obst.countdown; works from the bubble
//   anchor      dynamic 2  debut 1-4   B on the ground = planted = infinite rope mass (campaign); the one pulled by a hanger slides 0.5 tile/s
//   superjump   dynamic 3  debut 2-2   two ground jumps <= 150 ms apart: jump height x1.3 for both; event obst.superJump
//   Layer-for-2 rules (no id: they are always on in a campaign world): rope +20 %, edge assist (obst.edgeAssist), throw arc (PlayerSnap.arc),
//   shared hearts (death -> bubble beside the partner; both down -> checkpoint; 0 hearts -> refill, obst.heartsOut), camera hints, bubble v2.
//   balance     dynamic 4  debut 2-3   MODELED  campaign rule: ANY load difference moves the plates (also against an empty one) at balanceTilesPerSec (2); event obst.balance
//   target      dynamic 5  debut 2-4   MODELED  param {kind:'target', opens:'A'} on an activator letter a-f; touched with the feet off the ground it opens its gate for targetSec (4); obst.target
//   softEnemies dynamic 6  debut 2-6   SIM_ONLY LevelDef.enemies [{x,y,range}]: patrol, shove (never kill), landing on one stuns it 3 s; obst.enemy (action stun | push)
//   ice         dynamic 7  debut 3-1   SIM_ONLY tile 'I' (solid): ground acceleration and braking x0.15 on it; a planted anchor on ice slides; obst.ice when stepping onto it
//   wind        dynamic 8  debut 3-2   SIM_ONLY LevelDef.wind {dir, periodSec, gustSec, zone?}: 1 s warning, then a gust drifts whoever is in the air by windPxPerSec; obst.wind
//   pickaxe     dynamic 9  debut 3-4   MODELED  marker 'p' + 'I' walls: UP beside ice with the item climbs 1 tile/s; B passes it (range = the rope when tied); obst.pickaxe
//   Throw niche (no new id, 'throw' keeps its name): in a campaign the thrown player's rope stretches x1.5 for 1.2 s and the launch is x1.3 faster, so a TIED throw crosses a
//   5-tile pit that no jump (4) or tower (3) does. The validator models it (kind 'throw' edges also for followers, see below). The learning test still pairs tower/throw (see
//   campaign/learning.ts EQUIVALENT): drop the pair once a level built with the 5-tile pit debuts the throw.
//   Later phases (A6) add ids here: lantern, bungee, sinkers, geyser.
//
// ===== A5 INTERFACE FOR S2 (levels and validator for the dynamics above; nothing below builds a level) =====
//   LevelDef authoring (all additive; a level without them is the old one):
//     'I' ice tile, 'p' pickaxe marker (one item per marker), a-f letter with {kind:'target', opens}, enemies: [{x, y, range}] (cell of the feet, patrol +-range tiles),
//     wind: {dir: 1|-1, periodSec, gustSec, zone?: Rect in tiles} (a gust is the LAST gustSec of each period, announced windWarnSec before). Balance plates keep their old params
//     ({kind:'balance', partner, travel, speed}); in a campaign `speed` is ignored (balanceTilesPerSec), `travel` still limits the plates.
//   WHAT THE VALIDATOR MODELS (validator/graph.ts, validate.ts; tests in validator/dynamics.test.ts):
//     balance   n=2 in a campaign env: 'ride' edges go DOWN only and need no partner (alone on a plate it descends; the empty one rises with nobody). Up needs a heavier partner side
//               (a heavy box counts 2, n>=3 players): with 2 players it is NOT modelled, so a level that needs somebody to go UP by balance is unsolvable for the validator.
//     target    an opener like a latch lever: reachable when a jump from a reached segment passes through its cells (<= 3 tiles above); the gate then stays open for good in the model.
//               The 4 s clock is a LINT (validate.ts lint): the gate must be <= 20 tiles (manhattan) from the target. The real route time is the sim bot's to show.
//     pickaxe   S.pick: once a reached segment touches a 'p' marker, 'climb' edges exist from the foot of every ice wall to the standing cell above it, for the pioneer AND the
//               followers (the climber passes the item down the rope and the partner climbs too, see sim/pickaxe.ts). Not capped by the rope: walls taller than a tower are its niche.
//     throw     campaign + chain + n=2: throw edges reach dx <= ropeLen x throwSlack with the faster launch, and are also follower edges (pulled across: falls, hangs, hauled up when
//               the partner walks away) provided the landing is at most 1 tile above the takeoff (a wall stays the hand's job) and no spikes/liquid lie within ropeLen + half a
//               body BELOW the far ledge (pullSafe): dig such pits deep, 6+ tiles under the ledge.
//     ice       only as the friction parameter in the real stepPlayer of every trajectory (physicsOfWorld): slow starts are in; SLIDING after a landing is NOT.
//   WHAT IT DOES NOT MODEL (S2: verify with the real-sim bots, never with the validator, and keep a margin):
//     wind      the drift is not in any trajectory. A 1 s airtime moves a body up to 140 px (2.9 tiles; 112 px at N>=3): leave that much landing and no hazard downwind.
//     softEnemies  invisible to the graph: they only shove at 360 px/s, so never put one where a jump must land or a plate must be held.
//     balance up, target clock, ice sliding: as above.
//   TO MODEL LATER (if the playtest asks): wind as a pessimistic push in simPlan; a time budget (steps) per target-gate pair; the balance counts for a heavy box.
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
  // --- A5 (plan §4 #4-#9). Everything below is new in A5: the values above did not change.
  balanceTilesPerSec: number; // #4 balance: the plate with the larger load goes down at this speed (any difference moves it, also against an empty plate)
  targetSec: number; // #5 target: seconds its gate stays open after a touch in flight (+1 s every 2 players beyond 2)
  enemyStunSec: number; // #6 soft enemies: stunned this long when a player lands on them
  enemyExtra: number; // #6: extra enemies the level gets (+1 every 2 players beyond 2), cloned from the level's own list
  enemyTilesPerSec: number; // #6: patrol speed
  enemyPushPxPerSec: number; // #6: a touched player is shoved sideways this fast (a bit above the run speed: they cannot be walked through)
  iceFriction: number; // #7 ice: x the ground acceleration and braking on an ice tile (0.15); a planted anchor on ice slides like one over its limit
  windPxPerSec: number; // #8 wind: drift of whoever is in the air during a gust (x0.8 for N >= 3)
  windWarnSec: number; // #8: announced this long before the gust
  pickTilesPerSec: number; // #9 pickaxe: climbing speed on ice walls
  throwVxMult: number; // throw niche: horizontal launch speed x this (the throw reaches farther than a jump or a tower)
  throwSlack: number; // throw niche: the rope of a thrown player is this much longer (x base) at the throw...
  throwSlackSec: number; // ...and eases back to its length over this long
  // --- A6 (plan §4 #10-#12). New in A6: nothing above changed.
  lanternRadiusTiles: number; // #10 lantern: crystals within this radius (tiles, centre to centre) of the lantern are solid; also the radius of the lit circle of a dark level
  bungeeMaxMult: number; // #11 bungee: the rope of a body hanging from an elastic ring stretches up to this x its length (a hard stop beyond it)
  bungeeStiffness: number; // #11: spring constant (1/s^2): acceleration = k x stretch(px). 40: a 4-tile fall stretches the rope to ~1.47x (the hard stop is 1.6x) and pulls back up at ~150 px/s, then it hangs at ~1.15x (sweep in tools/s1-bungee.ts)
  bungeeDamping: number; // #11: 1/s, braking of the speed along the stretched link. 7 kills the bounce in ~2 s. Less does not: the player's gravity is asymmetric (rising 2396, falling 3594 px/s^2) and pumps a spring into a steady 15-90 px swing (damping 2-6)
  sinkTilesPerSec: number; // #12 sinkers: a rock sinks this fast per character standing on it...
  sinkRiseTilesPerSec: number; // ...and floats back up this fast when it is empty
  geyserWarnSec: number; // #12 geyser: bubbles this long before it erupts
  geyserLaunchMult: number; // #12: launch speed of whoever is in the vent when it erupts, x JUMP_V0 (the trampoline is 1.45)
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
    balanceTilesPerSec: 2, targetSec: 4 + Math.floor(extra / 2), enemyStunSec: 3, enemyExtra: Math.floor(extra / 2), enemyTilesPerSec: 1.5, enemyPushPxPerSec: 360,
    iceFriction: 0.15, windPxPerSec: N <= 2 ? 140 : 112, windWarnSec: 1, pickTilesPerSec: 1, throwVxMult: 1.3, throwSlack: 1.5, throwSlackSec: 1.2,
    lanternRadiusTiles: 4, bungeeMaxMult: 1.6, bungeeStiffness: 40, bungeeDamping: 7, sinkTilesPerSec: 0.5, sinkRiseTilesPerSec: 0.5, geyserWarnSec: 1, geyserLaunchMult: 1.65,
  };
}

export const superJumpV0 = (c: CampaignParams): number => JUMP_V0 * Math.sqrt(c.superJumpMult);

// Coyote and buffer of the world (plan §3 "Coyote/buffer"): the Normal base x the world's multiplier, plus the adaptive latency term.
export function physicsForCampaign(c: CampaignParams, p90LatencyMs = 0): PhysicsParams {
  const n = DIFFICULTY_PARAMS.normal;
  const coyote = Math.round(n.coyoteBase * c.forgiveMult) + Math.ceil(Math.max(0, p90LatencyMs) / LATENCY_FRAME_MS);
  return { coyote: Math.min(Math.round(n.coyoteCap * c.forgiveMult), coyote), buffer: Math.round(n.bufferFrames * c.forgiveMult), stickyEdges: c.world === 'beach' };
}

// What a campaign world's bodies are stepped with: the world's coyote/buffer (physicsForCampaign, unchanged) plus the ice friction. The sim and the validator use THIS.
export const physicsOfWorld = (c: CampaignParams, p90LatencyMs = 0): PhysicsParams => ({ ...physicsForCampaign(c, p90LatencyMs), iceFriction: c.iceFriction });

// The legacy DifficultyParams a campaign world runs with (lives, bubble delay, hazard speed come from the world; the rest is Normal's).
export function dparamsForCampaign(c: CampaignParams): DifficultyParams {
  const n = DIFFICULTY_PARAMS.normal;
  return { ...n, lives: c.hearts, bubbleSec: c.rescueSec, bubbleCostsLife: false, hazardSpeed: c.hazardMult, handZoneTiles: c.world === 'beach' ? DIFFICULTY_PARAMS.easy.handZoneTiles : n.handZoneTiles, stickyEdges: c.world === 'beach', band: [c.band[0] * 100, c.band[1] * 100] };
}

// --- signals (dynamic 1)
export type SignalKind = 'arrowL' | 'arrowR' | 'arrowU' | 'arrowD' | 'wait' | 'go';
export const SIGNAL_KINDS: readonly SignalKind[] = ['arrowL', 'arrowR', 'arrowU', 'arrowD', 'wait', 'go'];
