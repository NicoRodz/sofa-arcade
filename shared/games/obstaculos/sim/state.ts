// Shared shapes of the world of F2a. Plain data only (no classes, no closures): a world can be hashed, snapshotted and compared.
import type { Difficulty } from '../../../difficulty';
import type { DifficultyParams } from '../constants';
import type { AllObstEvents, ObstEventName } from '../events';
import type { ParsedLevel } from '../parse';
import type { Cell, EntityParam, GameMode, Weight } from '../types';
import type { PxRect } from './collide';
import type { CampaignParams, SignalKind } from './campaign';
import type { Body, PhysicsParams } from './player';
import type { Rope } from './rope';
import type { TileGrid } from './tiles';

export type ObstEvent = { [K in ObstEventName]: { name: K; data: AllObstEvents[K] } }[ObstEventName];

// --- players
export type PlayerMode = 'active' | 'dead' | 'bubble';
// What the hands hold (plan §5). 'ring' = anchored; 'player' = lifted a teammate; id = ring index / slot / box id / lever index.
export type Holding = { kind: 'ring' | 'player' | 'box' | 'lever'; id: number };
export interface Crumb { x: number; y: number; tick: number }
export interface PlayerStats { deaths: number; stars: number; anchoredSteps: number; throws: number; catches: number; offCameraSteps: number }

export interface PlayerState {
  slot: number;
  connected: boolean;
  mode: PlayerMode;
  body: Body;
  planted: boolean;
  plantAir: number; // steps planted while off the ground
  holding: Holding | null;
  carriedBy: number; // slot of whoever lifted this player, -1 none
  thrown: number; // steps left of a throw: no control until landing
  lift: { by: number; t: number; fx: number; fy: number } | null; // mano amiga: being pulled up by `by`
  climbing: boolean;
  ropeJump: boolean; // the one rope jump of this airtime is available
  invuln: number; // steps
  timer: number; // dead: steps until respawn; bubble: steps since arriving at the target (0 while flying)
  bubble: { tx: number; ty: number; arrived: boolean } | null;
  inGoal: boolean;
  offCamera: number; // steps in a row out of camera
  crumbs: Crumb[];
  crumbCool: number;
  crushed: number; // steps in a row inside a solid
  deathGroup: number; // tick of the death (a team wipe is judged by this)
  stats: PlayerStats;
  camp: PlayerCamp; // campaign layer (plan §4, §5.1); inert in a quick-match world
}
export interface PlayerCamp {
  assist: number; // edge assist: steps left of the forced push towards the wall
  assistDir: -1 | 0 | 1;
  jumpTick: number; // tick of the last ground jump (super jump pairs two of them), -1000 none
  mash: number; // bubble v2: boost levels from A presses
  mashCool: number; // steps until a level is lost
  signal: { kind: SignalKind; steps: number } | null; // shown over the head
  goHold: number; // steps "go" has been held
  pick: -1 | 0 | 1; // pickaxe (dynamic 9): side of the ice wall it clings to (-1 left, 1 right), 0 = not climbing
  onIce: boolean; // standing on ice last step (the transition rings obst.ice)
}

// --- dynamic entities (plan §9)
export interface Activator {
  letter: string;
  kind: 'plate' | 'lever' | 'target';
  rect: PxRect;
  opens: string;
  latch: boolean;
  weight: Weight; // plates; levers use 1
  required: number; // resolved with the connected players
  load: number; // weight on it now
  pressed: boolean; // live state
  latched: boolean; // stays true after the first press when latch
  holders: number[]; // levers: slots holding it
  timer: number; // target: steps its gate has left open (0 = closed)
}
export interface Objective {
  letter: string;
  kind: 'gate' | 'ladder' | 'mover' | 'balance';
  param: EntityParam;
  cells: Cell[];
  rect: PxRect; // base position of the object, px
  hasOpener: boolean;
  open: boolean;
  platformId: number; // movers and balance plates
  phase: number; // mover: seconds travelled
  ox: number; // current offset from rect, px
  oy: number;
  dx: number; // displacement of the last step (carries whoever stands on it)
  dy: number;
  load: number; // balance: players and boxes standing on it
  moving: boolean; // balance: it moved in the last step (the start rings obst.balance)
}
export interface BoxE { id: number; heavy: boolean; x: number; y: number; vy: number; homeX: number; homeY: number; holders: number[]; dx: number; dy: number; grounded: boolean }
export interface KeyE { x: number; y: number; homeX: number; homeY: number; heldBy: number; used: boolean }
export interface CrumbleE { x: number; y: number; state: 0 | 1 | 2; t: number } // 0 solid, 1 falling (0.5 s), 2 gone (3 s)
export interface HazardE { kind: 'risingLava' | 'tide' | 'avalanche'; speed: number; pos: number; frozen: number; phase: number } // pos: y (lava, tide) or x (avalanche), px
// Campaign dynamics 6 and 9 (sim/enemies.ts, sim/campaignrules.ts). x/y = top-left, px.
export interface EnemyE { x: number; y: number; w: number; h: number; homeX: number; range: number; dir: 1 | -1; stun: number; cool: number; vy: number }
export interface PickE { x: number; y: number; homeX: number; homeY: number; heldBy: number }
export type WindPhase = 'calm' | 'warn' | 'gust';
export interface CheckpointE { cell: Cell; activated: boolean }
export interface StarE { cell: Cell; taken: boolean }

export interface Entities {
  activators: Activator[];
  objectives: Objective[];
  boxes: BoxE[];
  keys: KeyE[];
  crumbles: CrumbleE[];
  rings: Cell[];
  checkpoints: CheckpointE[];
  stars: StarE[];
  enemies: EnemyE[]; // campaign only
  pickaxes: PickE[]; // from the 'p' markers; inert outside a campaign world
  doorCells: Set<number>; // original 'K' cells (index y * w + x): the only ones a key opens
  hazard: HazardE | null;
  lastStarTick: number;
  streak: number;
}

export type WorldStatus = 'playing' | 'cleared' | 'failed';
// `campaign` only exists in a campaign world: heartsLost = deaths-steps that cost a heart (also counted with infinite hearts), refills = times the
// hearts ran out and were refilled, perfect = both zero (the plan's third star, before the Captain's assists are applied by the caller).
export interface CampaignResult { heartsLost: number; refills: number; perfect: boolean }
export interface LevelResult { timeSec: number; medal: 'gold' | 'silver' | 'bronze'; stars: number; deaths: number; livesLeft: number; campaign?: CampaignResult }

export interface World {
  level: ParsedLevel;
  mode: GameMode; // effective mode (the level's tether decides over the lobby option)
  difficulty: Difficulty;
  dparams: DifficultyParams;
  params: PhysicsParams;
  grid: TileGrid;
  tilesVersion: number; // bumps when a tile changes (gates, ladders, doors, crumbles)
  tick: number;
  status: WorldStatus;
  players: PlayerState[]; // sorted by slot
  ropes: Rope[];
  ent: Entities;
  lives: number; // Infinity when unlimited
  deaths: number;
  progress: Int32Array; // BFS distance to the goal, in cells (see rules.ts)
  activeCheckpoint: number; // index in ent.checkpoints, -1 = the spawn
  result: LevelResult | null;
  events: ObstEvent[]; // scratch of the step in progress
  camp: CampaignParams | null; // null = quick match, every campaign rule is off
  heartsLost: number; // campaign: deaths-steps that cost a heart
  refills: number; // campaign: times the hearts ran out
  countdown: { by: number; steps: number } | null; // campaign: a 3-2-1 launched by "go" held
  wind: { phase: WindPhase; dir: -1 | 1 } | null; // campaign: only in a level with `wind`
}

export const emit = <K extends ObstEventName>(w: World, name: K, data: AllObstEvents[K]): void => { w.events.push({ name, data } as ObstEvent); };
export const playerOf = (w: World, slot: number): PlayerState | undefined => w.players.find((p) => p.slot === slot);
export const isActive = (p: PlayerState): boolean => p.connected && p.mode === 'active';
export const connectedCount = (w: World): number => w.players.filter((p) => p.connected).length;
