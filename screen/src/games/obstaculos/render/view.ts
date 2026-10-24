// WorldView: the read-only picture of a running level that the renderer draws (plan §14/§16, F2c).
//
// ADAPTER GUIDE (F3). Folder: screen/src/games/obstaculos/render/ (this renderer), .../harness/ (headless captures), shared/games/obstaculos/ (pure game).
// The simulation (F2a's world) is not imported by the renderer: an adapter maps it onto this interface once per render frame.
//
//   host loop (ObstaclesScene.update does this when you give it an ObstHost):
//     1. world.step(dtMs)          fixed 60 Hz inside; publish every obst.* event of the step on the bus (gameBus) as it happens
//     2. view.alpha = acc / STEP_MS   fraction of a step the render frame is past the last one (players are drawn interpolated)
//     3. ObstaclesView.update(dtMs)   draws; sets view.bubbleDue and view.hitstopMs
//     4. afterRender: world.requestBubble(ids of view.bubbleDue) ; skip step 1 while view.hitstopMs > 0 (50 ms after a death)
//
//   players   one PlayerView per connected or recently connected player, stable id and slot. x/y are the hitbox top-left (Body.x/Body.y), prevX/prevY the
//             same one step earlier. A jump of more than 3 tiles between them (respawn) is not interpolated. bubble = null | {phase 'fly'|'pop', t sec}.
//             hint = what B would do now ('none' hides the icon; 'plant' is drawn quiet: send it only for an idle grounded player, not every frame of life).
//   ropes     one RopeView per cordada; links in slot order; tension = distance / ROPE_LEN (> 1 is drawn red); active = false while the valve/bubble has it off.
//             obst.ropeTaut / obst.ropeStrain carry rope = RopeView.id and link = index inside links.
//   entities  stars, checkpoints, goal, rings, boxes, keys, plates, levers, gates, ladders, movers, balances, crumbling tiles. Stable ids; x/y/w/h in px
//             (moving things change x/y every step). tag = letter a-f / A-F pairing activators and objectives by colour. entitiesFromLevel (stub.ts)
//             builds the static ones from a ParsedLevel: reuse it and update `on`/`value`/x/y.
//   grid      the live TileGrid the physics uses. Doors, gates, crumbling and '%' resolved by mode are just cells you change: the renderer diffs the grid
//             every frame and repaints the chunks that changed (cost: one pass over w*h bytes). Cells of letters a-f/A-F draw nothing (entities do).
//   hazard    risingLava / tide: pos = surface y in px; avalanche: pos = front x. frozen = checkpoint freeze.
//   camera    camera.ts is pure and also runs in the renderer; if the sim needs the same camera to decide bubbles deterministically, import computeCamera /
//             StragglerTracker from there (or move the file to shared/.../rules/camera-logic.ts). The renderer's own copy only drives what is drawn.
//   check     call checkWorldView(world) in the adapter's tests: it lists every contract violation (NaN, duplicate ids, rope links to nobody...).
//
// Units: pixels of the simulation (TILE = 48), y grows downward. Nothing here imports Phaser: it can be used from Node tests and from the sim adapter.
import type { GameMode, ParsedLevel, TileGrid } from '@party/shared/obstaculos';
import type { Difficulty } from '@party/shared/difficulty';

export type HandAction = 'none' | 'anchor' | 'lift' | 'grab' | 'plant' | 'throw' | 'release'; // what B would do now (icon above the head)

export interface PlayerView {
  id: number;
  slot: number; // 0-7: colour, accessory, number tag
  name: string;
  connected: boolean;
  x: number; y: number; // hitbox top-left after the latest step
  prevX: number; prevY: number; // same, one step earlier: the renderer interpolates with WorldView.alpha
  vx: number; vy: number;
  facing: 1 | -1;
  grounded: boolean;
  dead: boolean; // between death and respawn: not drawn (the 'obst.death' event draws the burst)
  bubble: null | { phase: 'fly' | 'pop'; t: number }; // rescue bubble: t = seconds spent in this phase (pop lasts BUBBLE_POP_SEC)
  invulnSec: number; // > 0 after a bubble pops: blinking
  planted: boolean; // B with nothing nearby: braced against pulls
  hanging: boolean; // dangling from a taut rope or a ring, feet off the ground
  anchored: boolean; // holding a ring
  holding: 'none' | 'player' | 'box' | 'lever';
  carriedBy: number; // id of the player lifting this one, -1 if none
  thrown: boolean; // in flight after a throw
  inGoal: boolean;
  cordada: number; // rope group index, -1 when free (Libres mode or alone)
  hint: HandAction;
}

export interface RopeLink { a: number; b: number; tension: number; active: boolean } // a, b = player ids; tension = distance / ROPE_LEN; inactive = bubble valve
export interface RopeView { id: number; cordada: number; links: RopeLink[] }

export type EntityKind =
  | 'star' | 'checkpoint' | 'goal' | 'ring' | 'box' | 'heavyBox' | 'key'
  | 'plate' | 'lever' | 'gate' | 'ladder' | 'mover' | 'balance' | 'crumble' | 'rock' | 'saw';
export interface EntityView {
  id: string; // stable across frames
  kind: EntityKind;
  x: number; y: number; w: number; h: number; // px, top-left (moving things update this every step)
  tag: string; // activator/objective letter 'a'-'f' / 'A'-'F' ('' if none): pairs share a colour
  on: boolean; // star taken / checkpoint active / plate pressed / lever thrown / gate open / ring held / key taken / goal reached by all
  value: number; // 0..1: plate sink, crumble shake, balance travel, rock warning, level progress for anything animated
  label: string; // plate weight text ('3', '½↑', 'todos'), box weight, etc.
  holder: number; // player id that holds it (box, key, ring), -1
}

export interface HazardView { kind: 'risingLava' | 'tide' | 'avalanche'; pos: number; frozen: boolean } // pos: surface y (lava, tide) or front x (avalanche), px

export interface HudView {
  timeSec: number; // level clock
  lives: number; // Infinity when unlimited
  livesMax: number;
  starsTaken: number;
  levelIndex: number; // 0-based inside the expedition
  levelCount: number;
}

export interface WorldView {
  readonly level: ParsedLevel; // static: def, tiles, markers, objects
  readonly grid: TileGrid; // live tiles (modes resolved; doors, gates and crumbling tiles mutate it). The renderer repaints cells that change
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  alpha: number; // 0..1: how far the render frame is between the previous and the current step
  players: readonly PlayerView[];
  ropes: readonly RopeView[];
  entities: readonly EntityView[];
  hazard: HazardView | null;
  hud: HudView;
}

export const BIOME_NAME = { beach: 'Playa', forest: 'Bosque valdiviano', mine: 'Mina del norte', glacier: 'Glaciar', volcano: 'Volcán' } as const;

// Contract check for adapters: returns the problems found in a WorldView snapshot (empty = fine). Call it in the adapter's tests, every N steps.
export function checkWorldView(w: WorldView): string[] {
  const errs: string[] = [];
  const num = (name: string, v: number, allowInf = false) => { if (!(Number.isFinite(v) || (allowInf && v === Infinity))) errs.push(`${name} is not finite: ${v}`); };
  if (!(w.alpha >= 0 && w.alpha <= 1)) errs.push(`alpha ${w.alpha} outside [0, 1]`);
  const ids = new Set<number>();
  for (const p of w.players) {
    if (ids.has(p.id)) errs.push(`duplicate player id ${p.id}`);
    ids.add(p.id);
    for (const k of ['x', 'y', 'prevX', 'prevY', 'vx', 'vy', 'invulnSec'] as const) num(`player ${p.id}.${k}`, p[k]);
    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot > 7) errs.push(`player ${p.id}: slot ${p.slot} outside 0-7`);
    if (p.facing !== 1 && p.facing !== -1) errs.push(`player ${p.id}: facing ${p.facing}`);
    if (p.carriedBy >= 0 && !w.players.some((q) => q.id === p.carriedBy)) errs.push(`player ${p.id} is carried by unknown ${p.carriedBy}`);
    if (p.bubble && !(p.bubble.t >= 0)) errs.push(`player ${p.id}: bubble.t ${p.bubble.t}`);
    if (p.bubble && p.dead) errs.push(`player ${p.id} is both dead and in a bubble`);
  }
  for (const r of w.ropes) for (const l of r.links) {
    if (!ids.has(l.a) || !ids.has(l.b)) errs.push(`rope ${r.id}: link ${l.a}-${l.b} names an unknown player`);
    num(`rope ${r.id} tension`, l.tension);
    if (l.tension < 0) errs.push(`rope ${r.id}: negative tension`);
  }
  const eids = new Set<string>();
  for (const e of w.entities) {
    if (eids.has(e.id)) errs.push(`duplicate entity id ${e.id}`);
    eids.add(e.id);
    for (const k of ['x', 'y', 'w', 'h', 'value'] as const) num(`entity ${e.id}.${k}`, e[k]);
    if (e.holder >= 0 && !ids.has(e.holder)) errs.push(`entity ${e.id} held by unknown player ${e.holder}`);
  }
  num('hud.timeSec', w.hud.timeSec); num('hud.lives', w.hud.lives, true);
  if (w.grid.cells.length !== w.grid.w * w.grid.h) errs.push('grid size does not match w * h');
  if (w.grid.w !== w.level.w || w.grid.h !== w.level.h) errs.push('grid and level sizes differ');
  return errs;
}
