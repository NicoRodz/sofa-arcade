// The world of "Obstaculos en cadena": one fixed 60 Hz step over players, rope, grabs, entities and rules. Pure and deterministic
// (no Math.random, no Date): the same inputs give the same hashState().
//
// Public surface for the scene (F2c), the bots and the validator:
//   createWorld(opts)            -> World
//   step(world, inputs, opts?)   -> ObstEvent[]   inputs[slot] = PlayerStep (use InputTracker.step); opts.offCamera[slot] from the camera
//   snapshot(world)              -> WorldSnap     plain data for rendering; `grid` is the live tile grid, read only
//   hashState(world)             -> number
//   setConnected(world, slot, connected)          join / leave in the middle of a level
//   previewB(world, player)      -> BPreview      what B would do now (icon above the head)
import { DIFFICULTY_PARAMS, DT, JUMP_V0, PLAYER_H, PLAYER_W, ROPE_JUMP_MULT, RUN_SPEED, TILE } from '../constants';
import type { Difficulty } from '../../../difficulty';
import { T } from '../legend';
import { parseLevel } from '../parse';
import type { GameMode, LevelDef } from '../types';
import { applyA, applyB, dropAll, handCatchStep, previewB as previewBPlayer, releaseHolding, type BPreview } from './actions';
import { moveXLedge, pushBody, supportBelow, type PxRect } from './collide';
import { beltDx, computeLoads, createEntities, extraPlatforms, objRect, stepActivation, stepBoxes, stepCrumbles, stepHazard, stepKeys, stepMovers } from './entities';
import type { PlayerStep } from './input';
import { hangingOnRope, hashRopes, buildRopes, invMassOf, solveRopes, type RopeNode } from './rope';
import { dropCrumbs, goalZone, placeAtCell, progressField, progressOf, revive, sendToBubble, stepBubbles, stepCheckpoints, stepDeaths, stepGoal, stepStars, stepStragglers } from './rules';
import { emit, isActive, playerOf, type LevelResult, type ObstEvent, type PlayerState, type World, type WorldStatus } from './state';
import { hashBodies, headPlatform, newBody, physicsFor, stepPlayer, type Body, type Platform } from './player';
import { buildGrid, boxTouches } from './tiles';
import { CLIMB_SIDE_MULT, CLIMB_SPEED, PLANT_AIR_STEPS, SLOT_COUNT } from './tuning';

export type { BPreview } from './actions';
export type { ObstEvent, World, PlayerState, WorldStatus, LevelResult } from './state';

export interface WorldOptions {
  level: LevelDef;
  mode?: GameMode; // lobby option; the level's tether can override it. Default 'chain'
  difficulty?: Difficulty; // default 'normal'
  slots: readonly number[]; // connected player slots (0..7)
  p90LatencyMs?: number; // adaptive coyote (plan §2)
}
export interface StepOptions { offCamera?: readonly boolean[] } // slot -> out of the camera frame (from computeCamera), drives the bubble

const IDLE: PlayerStep = { move: 0, down: false, jump: false, up: false, grab: false };
const NONE = 255;

function newPlayer(slot: number, connected = true): PlayerState {
  return {
    slot, connected, mode: 'active', body: newBody(slot, 0, 0), planted: false, plantAir: 0, holding: null, carriedBy: -1, thrown: 0, lift: null, climbing: false, ropeJump: true,
    invuln: 0, timer: 0, bubble: null, inGoal: false, offCamera: 0, crumbs: [], crumbCool: 0, crushed: 0, deathGroup: -1,
    stats: { deaths: 0, stars: 0, anchoredSteps: 0, throws: 0, catches: 0, offCameraSteps: 0 },
  };
}

export function createWorld(o: WorldOptions): World {
  const level = parseLevel(o.level);
  if (level.errors.length) throw new Error(`level ${o.level.id}: ${level.errors.join('; ')}`);
  const difficulty = o.difficulty ?? 'normal';
  const dparams = DIFFICULTY_PARAMS[difficulty];
  const tether = o.level.tether;
  const mode: GameMode = tether === 'freeOnly' ? 'free' : tether === 'chainOnly' ? 'chain' : (o.mode ?? 'chain');
  const grid = buildGrid(level, mode);
  const ent = createEntities(level, grid, dparams.hazardSpeed);
  const slots = [...new Set(o.slots)].filter((s) => s >= 0 && s < SLOT_COUNT).sort((a, b) => a - b);
  const w: World = {
    level, mode, difficulty, dparams, params: physicsFor(difficulty, o.p90LatencyMs ?? 0), grid, tilesVersion: 0, tick: 0, status: 'playing',
    players: slots.map((s) => newPlayer(s)), ropes: [], ent, lives: dparams.lives, deaths: 0, progress: progressField(level), activeCheckpoint: -1, result: null, events: [],
  };
  const spawn = level.markers.spawn[0]!;
  w.players.forEach((p, i) => placeAtCell(w, p, spawn, i, w.players.length));
  w.ropes = mode === 'chain' ? buildRopes(slots, o.level.cordadaMax) : [];
  return w;
}

export const previewB = (w: World, slot: number): BPreview => { const p = playerOf(w, slot); return p ? previewBPlayer(w, p) : { action: 'none', target: null }; };

// Join or leave in the middle of a level. A leaver drops what it holds and its neighbours hook up (the rope eases to full length in 0.5 s);
// a joiner comes back at the checkpoint with the usual invulnerability.
export function setConnected(w: World, slot: number, connected: boolean): void {
  let p = playerOf(w, slot);
  if (!p) {
    if (!connected || slot < 0 || slot >= SLOT_COUNT) return;
    p = newPlayer(slot, false);
    w.players.push(p);
    w.players.sort((a, b) => a.slot - b.slot);
  }
  if (p.connected === connected) return;
  w.events = [];
  if (!connected) { dropAll(w, p); p.connected = false; p.inGoal = false; }
  else { p.connected = true; revive(w, p, 'checkpoint'); }
  if (w.mode === 'chain') {
    const by = new Map(w.players.map((q) => [q.slot, q.body]));
    const dist = (a: number, b: number) => { const A = by.get(a)!, B = by.get(b)!; return Math.hypot(A.x - B.x, A.y - B.y); };
    w.ropes = buildRopes(w.players.filter((q) => q.connected).map((q) => q.slot), w.level.def.cordadaMax, w.ropes, dist);
  }
}

const headsOf = (w: World): Platform[] => w.players.filter((p) => isActive(p) && p.carriedBy < 0 && !p.climbing).map((p) => headPlatform(p.body));

const ladderAt = (w: World, b: Body): boolean => boxTouches(w.grid, b.x + PLAYER_W / 2 - 4, b.y, 8, PLAYER_H, (k) => k === T.Ladder);

export function step(w: World, inputs: readonly (PlayerStep | undefined)[], opts: StepOptions = {}): ObstEvent[] {
  w.events = [];
  if (w.status !== 'playing') return w.events;
  w.tick++;
  for (const p of w.players) if (p.invuln > 0) p.invuln--;

  // 1. Moving things.
  stepMovers(w);
  stepHazard(w);
  stepCrumbles(w);

  // 2. B and A, in slot order.
  const jumps = new Map<number, boolean>();
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const inp = inputs[p.slot] ?? IDLE;
    if (inp.grab) applyB(w, p);
    jumps.set(p.slot, inp.jump && !applyA(w, p));
  }

  // 3. Players, in slot order, each seeing the heads and platforms of the start of the step.
  const platforms = [...headsOf(w), ...extraPlatforms(w)];
  const bySlot: (Body | undefined)[] = [];
  for (const p of w.players) bySlot[p.slot] = p.body;
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const inp = inputs[p.slot] ?? IDLE;
    const b = p.body;
    if (p.holding?.kind === 'ring') { b.vx = 0; b.vy = 0; b.dx = 0; b.dy = 0; p.stats.anchoredSteps++; continue; }
    if (p.carriedBy >= 0 || p.lift) continue;
    if (p.planted) {
      p.plantAir = b.grounded ? 0 : p.plantAir + 1;
      if (p.plantAir > PLANT_AIR_STEPS) { p.planted = false; p.plantAir = 0; }
    }
    // ladders
    if (!p.climbing && (inp.up || inp.down) && !p.planted && !p.thrown && ladderAt(w, b)) { p.climbing = true; b.vx = 0; b.vy = 0; }
    if (p.climbing) {
      if (!ladderAt(w, b)) { p.climbing = false; b.vy = 0; }
      else {
        const dy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * CLIMB_SPEED * DT;
        const moved = pushBody(b, 0, dy, w.grid);
        moveXLedge(b, inp.move * RUN_SPEED * CLIMB_SIDE_MULT * DT, w.grid);
        b.vx = 0; b.vy = 0; b.grounded = false; b.supportId = -1; b.onOneWay = false; b.air = NONE; b.dx = 0; b.dy = moved.y;
        if (dy > 0 && moved.y < dy - 0.01) p.climbing = false; // reached the floor
        continue;
      }
    }
    let jump = jumps.get(p.slot) ?? false;
    // rope jump (plan §4): hanging on a taut rope with no coyote left, one jump at 0.8 v0
    if (jump && !b.grounded && b.air > w.params.coyote && p.ropeJump && hangingOnRope(w.ropes, p.slot, bySlot)) {
      b.vy = -JUMP_V0 * ROPE_JUMP_MULT; b.air = NONE; p.ropeJump = false; jump = false;
      emit(w, 'obst.jump', { player: p.slot, kind: 'rope' });
    }
    let move = p.planted ? 0 : inp.move;
    if (p.thrown > 0) { move = b.facing; if (b.grounded && p.thrown < 85) p.thrown = 0; else p.thrown--; } // no control until it lands
    const bd = beltDx(w, p);
    if (bd !== 0) pushBody(b, bd, 0, w.grid);
    const ev = stepPlayer(b, { move, down: inp.down, jump }, { grid: w.grid, platforms, params: w.params });
    if (ev.jump) emit(w, 'obst.jump', { player: p.slot, kind: ev.jump });
    if (ev.land > 0) emit(w, 'obst.land', { player: p.slot, impact: ev.land, on: ev.landOn });
    if (b.grounded) p.ropeJump = true;
  }

  // 4. Carried players ride on their holder; mano amiga lifts; boxes and keys follow their holders.
  for (const t of w.players) {
    if (t.carriedBy < 0) continue;
    const c = playerOf(w, t.carriedBy);
    if (!c || !isActive(c) || !isActive(t)) { t.carriedBy = -1; if (c?.holding?.kind === 'player') c.holding = null; continue; }
    const ty = c.body.y - PLAYER_H - 2;
    t.body.x = c.body.x; t.body.y = boxTouches(w.grid, c.body.x, ty, PLAYER_W, PLAYER_H, (k) => k === T.Solid || k === T.Door || k === T.Crumble) ? c.body.y : ty;
    t.body.vx = 0; t.body.vy = 0; t.body.grounded = true; t.body.supportId = c.slot; t.body.air = 0; t.body.facing = c.body.facing; t.body.dx = c.body.dx; t.body.dy = c.body.dy;
  }
  handCatchStep(w, w.dparams.handZoneTiles);
  stepBoxes(w, (p) => releaseHolding(w, p));
  stepKeys(w);

  // 5. Rope: PBD, separating velocity removed, ground recomputed (plan §4 steps 3-5).
  if (w.ropes.length) {
    const nodes: (RopeNode | undefined)[] = [];
    for (const p of w.players) {
      const anchored = p.holding?.kind === 'ring' || p.carriedBy >= 0 || !!p.lift;
      nodes[p.slot] = { body: p.body, active: isActive(p), w: invMassOf(anchored ? 'anchored' : p.planted ? 'planted' : p.body.grounded ? 'ground' : 'air') };
    }
    const behind = (a: number, c: number) => (progressOf(w, playerOf(w, a)!) >= progressOf(w, playerOf(w, c)!) ? a : c);
    for (const e of solveRopes(w.ropes, nodes, w.grid, behind)) {
      if (e.kind === 'taut') emit(w, 'obst.ropeTaut', { rope: e.rope, link: e.link, tension: e.tension });
      else if (e.kind === 'strain') emit(w, 'obst.ropeStrain', { rope: e.rope, link: e.link, tension: e.tension });
      else { const p = playerOf(w, e.behind); if (p && isActive(p)) sendToBubble(w, p, 'rope'); }
    }
  }
  const after = [...headsOf(w), ...extraPlatforms(w)];
  for (const p of w.players) {
    if (!isActive(p) || p.climbing || p.carriedBy >= 0 || p.lift || p.holding?.kind === 'ring') continue;
    const s = supportBelow(p.body, w.grid, after);
    p.body.grounded = s.grounded; p.body.supportId = s.supportId; p.body.onOneWay = s.onOneWay;
    if (s.grounded) p.body.air = 0;
  }

  // 6. Pressure, collectibles, checkpoints, danger, stragglers, victory.
  computeLoads(w);
  stepActivation(w);
  dropCrumbs(w);
  stepStars(w);
  stepCheckpoints(w);
  stepDeaths(w);
  stepStragglers(w, opts.offCamera);
  stepBubbles(w);
  stepGoal(w);
  return w.events;
}

// --- hash
export function hashState(w: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 0x01000193); };
  mix(w.tick); mix(w.status === 'playing' ? 0 : w.status === 'cleared' ? 1 : 2); mix(Number.isFinite(w.lives) ? w.lives : -1); mix(w.deaths); mix(w.activeCheckpoint); mix(w.tilesVersion);
  h = (h ^ hashBodies(w.players.map((p) => p.body))) >>> 0; h = Math.imul(h, 0x01000193);
  for (const p of w.players) {
    for (const v of [p.slot, p.connected ? 1 : 0, p.mode === 'active' ? 0 : p.mode === 'dead' ? 1 : 2, p.planted ? 1 : 0, p.holding ? { ring: 1, player: 2, box: 3, lever: 4 }[p.holding.kind] * 1000 + p.holding.id : 0,
      p.carriedBy, p.thrown, p.lift ? p.lift.t : -1, p.climbing ? 1 : 0, p.ropeJump ? 1 : 0, p.invuln, p.timer, p.inGoal ? 1 : 0, p.offCamera, p.crushed, p.stats.deaths, p.stats.stars, p.stats.anchoredSteps, p.stats.throws, p.stats.catches,
      p.bubble ? p.bubble.tx : 0, p.bubble ? p.bubble.ty : 0, p.bubble?.arrived ? 1 : 0, p.crumbs.length, p.crumbs.length ? p.crumbs[p.crumbs.length - 1]!.x : 0]) mix(v);
  }
  hashRopes(w.ropes, mix);
  const e = w.ent;
  for (const a of e.activators) for (const v of [a.load, a.required, a.pressed ? 1 : 0, a.latched ? 1 : 0, a.holders.length]) mix(v);
  for (const o of e.objectives) for (const v of [o.open ? 1 : 0, o.ox, o.oy, o.phase, o.load]) mix(v);
  for (const b of e.boxes) for (const v of [b.x, b.y, b.vy, b.holders.length]) mix(v);
  for (const k of e.keys) for (const v of [k.x, k.y, k.heldBy, k.used ? 1 : 0]) mix(v);
  for (const c of e.crumbles) { mix(c.state); mix(c.t); }
  for (const s of e.stars) mix(s.taken ? 1 : 0);
  for (const c of e.checkpoints) mix(c.activated ? 1 : 0);
  if (e.hazard) { mix(e.hazard.pos); mix(e.hazard.frozen); }
  return h >>> 0;
}

// --- snapshot for rendering: plain data, safe to keep between frames (except `grid`, which is live and read only)
export interface PlayerSnap {
  slot: number; connected: boolean; mode: PlayerState['mode']; x: number; y: number; vx: number; vy: number; facing: 1 | -1; grounded: boolean;
  planted: boolean; climbing: boolean; anchored: boolean; carriedBy: number; holding: PlayerState['holding']; thrown: boolean; lifted: boolean;
  invulnerable: boolean; inGoal: boolean; offCameraSec: number; bubbleTarget: { x: number; y: number; arrived: boolean } | null; b: BPreview['action'];
}
export interface WorldSnap {
  tick: number; timeSec: number; status: WorldStatus; mode: GameMode; lives: number; deaths: number; result: LevelResult | null; tilesVersion: number;
  grid: World['grid'];
  players: PlayerSnap[];
  ropes: { id: number; members: number[]; links: { a: number; b: number; len: number; tension: number; taut: boolean; active: boolean }[] }[];
  plates: { letter: string; kind: 'plate' | 'lever'; rect: PxRect; required: number; load: number; pressed: boolean; latched: boolean }[];
  objects: { letter: string; kind: 'gate' | 'ladder' | 'mover' | 'balance'; rect: PxRect; open: boolean }[]; // rect = current position (movers and balance move)
  boxes: { id: number; heavy: boolean; x: number; y: number; held: boolean }[];
  keys: { x: number; y: number; heldBy: number; used: boolean }[];
  crumbles: { x: number; y: number; state: 0 | 1 | 2 }[];
  stars: { x: number; y: number; taken: boolean }[];
  checkpoints: { x: number; y: number; activated: boolean; active: boolean }[];
  rings: { x: number; y: number }[];
  hazard: { kind: 'risingLava' | 'tide' | 'avalanche'; pos: number; frozen: boolean } | null;
  goal: PxRect | null;
}

export function snapshot(w: World): WorldSnap {
  const e = w.ent;
  return {
    tick: w.tick, timeSec: w.tick * DT, status: w.status, mode: w.mode, lives: w.lives, deaths: w.deaths, result: w.result, tilesVersion: w.tilesVersion, grid: w.grid,
    players: w.players.map((p) => ({
      slot: p.slot, connected: p.connected, mode: p.mode, x: p.body.x, y: p.body.y, vx: p.body.vx, vy: p.body.vy, facing: p.body.facing, grounded: p.body.grounded,
      planted: p.planted, climbing: p.climbing, anchored: p.holding?.kind === 'ring', carriedBy: p.carriedBy, holding: p.holding ? { ...p.holding } : null, thrown: p.thrown > 0, lifted: !!p.lift,
      invulnerable: p.invuln > 0, inGoal: p.inGoal, offCameraSec: p.offCamera * DT, bubbleTarget: p.bubble ? { x: p.bubble.tx, y: p.bubble.ty, arrived: p.bubble.arrived } : null,
      b: isActive(p) ? previewBPlayer(w, p).action : 'none',
    })),
    ropes: w.ropes.map((r) => ({ id: r.id, members: [...r.members], links: r.links.map((l) => ({ a: l.a, b: l.b, len: l.len, tension: l.tension, taut: l.taut, active: l.active })) })),
    plates: e.activators.map((a) => ({ letter: a.letter, kind: a.kind, rect: { ...a.rect }, required: a.required, load: a.load, pressed: a.pressed, latched: a.latched })),
    objects: e.objectives.map((o) => ({ letter: o.letter, kind: o.kind, rect: objRect(o), open: o.open })),
    boxes: e.boxes.map((b) => ({ id: b.id, heavy: b.heavy, x: b.x, y: b.y, held: b.holders.length > 0 })),
    keys: e.keys.map((k) => ({ x: k.x, y: k.y, heldBy: k.heldBy, used: k.used })),
    crumbles: e.crumbles.map((c) => ({ x: c.x, y: c.y, state: c.state })),
    stars: e.stars.map((s) => ({ x: s.cell.x, y: s.cell.y, taken: s.taken })),
    checkpoints: e.checkpoints.map((c, i) => ({ x: c.cell.x, y: c.cell.y, activated: c.activated, active: i === w.activeCheckpoint })),
    rings: e.rings.map((r) => ({ x: r.x, y: r.y })),
    hazard: e.hazard ? { kind: e.hazard.kind, pos: e.hazard.pos, frozen: e.hazard.frozen > 0 } : null,
    goal: goalZone(w.level),
  };
}

export { TILE };
