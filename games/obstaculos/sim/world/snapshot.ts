// snapshot for rendering: plain data, safe to keep between frames (except `grid`, which is live and read only).
import { DT, TILE } from '../../constants';
import type { GameMode } from '../../types';
import { previewB as previewBPlayer, type BPreview } from '../actions';
import type { PxRect } from '../collide';
import { objRect } from '../entities';
import type { CampaignParams, SignalKind } from '../campaign';
import { throwArc } from '../campaignrules';
import { darkView } from '../lantern';
import { goalZone } from '../rules';
import { isActive, type LevelResult, type Objective, type PlayerState, type WindPhase, type World, type WorldStatus } from '../state';

export interface PlayerSnap {
  slot: number;
  connected: boolean;
  mode: PlayerState['mode'];
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  planted: boolean;
  climbing: boolean;
  anchored: boolean;
  carriedBy: number;
  holding: PlayerState['holding'];
  thrown: boolean;
  lifted: boolean;
  invulnerable: boolean;
  inGoal: boolean;
  offCameraSec: number;
  bubbleTarget: { x: number; y: number; arrived: boolean } | null;
  b: BPreview['action'];
  // campaign layer (null / 0 in a quick match)
  arc: { x: number; y: number }[] | null; // throw arc (centres, px) while this player carries a teammate
  signal: SignalKind | null;
  bubbleBoost: number;
}
export interface WorldSnap {
  tick: number;
  timeSec: number;
  status: WorldStatus;
  mode: GameMode;
  lives: number;
  deaths: number;
  result: LevelResult | null;
  tilesVersion: number;
  grid: World['grid'];
  players: PlayerSnap[];
  ropes: {
    id: number;
    members: number[];
    links: { a: number; b: number; len: number; base: number; tension: number; taut: boolean; active: boolean; elastic: boolean }[];
  }[];
  plates: {
    letter: string;
    kind: 'plate' | 'lever' | 'target';
    rect: PxRect;
    required: number;
    load: number;
    pressed: boolean;
    latched: boolean;
    leftSec: number;
  }[]; // leftSec: target's gate clock
  objects: { letter: string; kind: Objective['kind']; rect: PxRect; open: boolean; phase: number }[]; // rect = current position (movers, balance and sinkers move); phase: geyser 0 calm / 1 warning / 2 erupting, else 0
  boxes: { id: number; heavy: boolean; x: number; y: number; held: boolean }[];
  keys: { x: number; y: number; heldBy: number; used: boolean }[];
  crumbles: { x: number; y: number; state: 0 | 1 | 2 }[];
  stars: { x: number; y: number; taken: boolean }[];
  checkpoints: { x: number; y: number; activated: boolean; active: boolean }[];
  rings: { x: number; y: number; elastic: boolean }[]; // elastic: a 'u' ring (dynamic 11)
  hazard: { kind: 'risingLava' | 'tide' | 'avalanche'; pos: number; frozen: boolean } | null;
  goal: PxRect | null;
  // campaign layer (null / 0 in a quick match)
  camp: CampaignParams | null;
  heartsLost: number;
  refills: number;
  countdown: { by: number; n: number } | null; // n = the number on screen: 3, 2, 1
  enemies: { x: number; y: number; w: number; h: number; dir: 1 | -1; stunned: boolean; stunLeftSec: number }[]; // dynamic 6
  pickaxes: { x: number; y: number; heldBy: number }[]; // dynamic 9 (centre of the item, px)
  wind: { phase: WindPhase; dir: -1 | 1; zone: PxRect | null } | null; // dynamic 8
  lanterns: { x: number; y: number; heldBy: number }[]; // dynamic 10 (centre of the item, px)
  dark: { radius: number; lights: { x: number; y: number }[] } | null; // dynamic 10: a level with a lantern is dark; radius and light centres in px (a player's own faint light is the renderer's)
}

export function snapshot(w: World): WorldSnap {
  const e = w.ent;
  return {
    tick: w.tick,
    timeSec: w.tick * DT,
    status: w.status,
    mode: w.mode,
    lives: w.lives,
    deaths: w.deaths,
    result: w.result,
    tilesVersion: w.tilesVersion,
    grid: w.grid,
    players: w.players.map((p) => ({
      slot: p.slot,
      connected: p.connected,
      mode: p.mode,
      x: p.body.x,
      y: p.body.y,
      vx: p.body.vx,
      vy: p.body.vy,
      facing: p.body.facing,
      grounded: p.body.grounded,
      planted: p.planted,
      climbing: p.climbing,
      anchored: p.holding?.kind === 'ring',
      carriedBy: p.carriedBy,
      holding: p.holding ? { ...p.holding } : null,
      thrown: p.thrown > 0,
      lifted: !!p.lift,
      invulnerable: p.invuln > 0,
      inGoal: p.inGoal,
      offCameraSec: p.offCamera * DT,
      bubbleTarget: p.bubble ? { x: p.bubble.tx, y: p.bubble.ty, arrived: p.bubble.arrived } : null,
      b: isActive(p) ? previewBPlayer(w, p).action : 'none',
      arc: w.camp ? throwArc(w, p) : null,
      signal: p.camp.signal?.kind ?? null,
      bubbleBoost: p.camp.mash,
    })),
    ropes: w.ropes.map((r) => ({
      id: r.id,
      members: [...r.members],
      links: r.links.map((l) => ({
        a: l.a,
        b: l.b,
        len: l.len,
        base: l.base,
        tension: l.tension,
        taut: l.taut,
        active: l.active,
        elastic: l.elastic,
      })),
    })),
    plates: e.activators.map((a) => ({
      letter: a.letter,
      kind: a.kind,
      rect: { ...a.rect },
      required: a.required,
      load: a.load,
      pressed: a.pressed,
      latched: a.latched,
      leftSec: a.timer * DT,
    })),
    objects: e.objectives.map((o) => ({
      letter: o.letter,
      kind: o.kind,
      rect: objRect(o),
      open: o.open,
      phase: o.kind === 'geyser' ? o.phase : 0,
    })),
    boxes: e.boxes.map((b) => ({ id: b.id, heavy: b.heavy, x: b.x, y: b.y, held: b.holders.length > 0 })),
    keys: e.keys.map((k) => ({ x: k.x, y: k.y, heldBy: k.heldBy, used: k.used })),
    crumbles: e.crumbles.map((c) => ({ x: c.x, y: c.y, state: c.state })),
    stars: e.stars.map((s) => ({ x: s.cell.x, y: s.cell.y, taken: s.taken })),
    checkpoints: e.checkpoints.map((c, i) => ({ x: c.cell.x, y: c.cell.y, activated: c.activated, active: i === w.activeCheckpoint })),
    rings: e.rings.map((r, i) => ({ x: r.x, y: r.y, elastic: !!w.camp && i >= e.bungeeFrom })),
    hazard: e.hazard ? { kind: e.hazard.kind, pos: e.hazard.pos, frozen: e.hazard.frozen > 0 } : null,
    goal: goalZone(w.level),
    camp: w.camp,
    heartsLost: w.heartsLost,
    refills: w.refills,
    countdown: w.countdown ? { by: w.countdown.by, n: Math.ceil(w.countdown.steps / 60) } : null,
    enemies: e.enemies.map((en) => ({ x: en.x, y: en.y, w: en.w, h: en.h, dir: en.dir, stunned: en.stun > 0, stunLeftSec: en.stun * DT })),
    pickaxes: e.pickaxes.map((k) => ({ x: k.x, y: k.y, heldBy: k.heldBy })),
    lanterns: e.lanterns.map((k) => ({ x: k.x, y: k.y, heldBy: k.heldBy })),
    dark: darkView(w),
    wind:
      w.wind && w.level.def.wind
        ? {
            phase: w.wind.phase,
            dir: w.wind.dir,
            zone: w.level.def.wind.zone
              ? {
                  x: w.level.def.wind.zone.x * TILE,
                  y: w.level.def.wind.zone.y * TILE,
                  w: w.level.def.wind.zone.w * TILE,
                  h: w.level.def.wind.zone.h * TILE,
                }
              : null,
          }
        : null,
  };
}
