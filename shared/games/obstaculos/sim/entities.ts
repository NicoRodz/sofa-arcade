// Dynamic entities of plan §9: plates, levers, gates, ladders, movers, balance, boxes, keys, crumbling tiles, belts, hazards.
// Everything mutates the World in place, in a fixed order, with no randomness: same inputs -> same hash.
import { DT, GRAVITY_DOWN_MULT, GRAVITY_UP, MAX_FALL, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { T, isHazardKind, isOneWayKind, isSolidKind } from '../legend';
import type { ParsedLevel } from '../parse';
import type { Cell, Weight } from '../types';
import { bodyRect, cellRect, overlaps, pushRect, type PxRect } from './collide';
import type { Platform } from './player';
import {
  emit,
  isActive,
  type BoxE,
  type CrumbleE,
  type Entities,
  type HazardE,
  type KeyE,
  type Objective,
  type PickE,
  type PlayerState,
  type World,
} from './state';
import type { CampaignParams } from './campaign';
import { createEnemies } from './enemies';
import {
  AVALANCHE_START_TILES,
  BELT_SPEED,
  BOX_ID0,
  BOX_SIZE,
  BALANCE_ID0,
  FREEZE_SEC,
  HEAVY_GRIPS,
  HOLD_BREAK,
  KEY_REACH,
  MOVER_ID0,
  SINKER_ID0,
  TIDE_PERIOD_SEC,
} from './tuning';
import { boxTouches, setTile, tileAt, tileOf, type TileGrid } from './tiles';
import { CRUMBLE_BACK_SEC, CRUMBLE_FALL_SEC } from '../constants';

const px = (c: Cell): PxRect => cellRect(c.x, c.y);
const idx = (x: number, y: number, w: number) => y * w + x;

export function createEntities(p: ParsedLevel, grid: TileGrid, hazardMult: number, camp: CampaignParams | null = null): Entities {
  const ent: Entities = {
    activators: [],
    objectives: [],
    boxes: [],
    keys: [],
    crumbles: [],
    rings: [...p.markers.ring, ...p.markers.bungee],
    checkpoints: p.markers.checkpoint.map((cell) => ({ cell, activated: false })),
    stars: p.markers.star.map((cell) => ({ cell, taken: false })),
    enemies: camp ? createEnemies(p, camp) : [],
    pickaxes: [],
    lanterns: [],
    crystals: [],
    bungeeFrom: p.markers.ring.length,
    doorCells: new Set(),
    hazard: null,
    lastStarTick: -Infinity,
    streak: 0,
  };
  if (camp)
    ent.pickaxes = p.markers.pickaxe.map((c): PickE => {
      const x = c.x * TILE + TILE / 2,
        y = c.y * TILE + TILE / 2;
      return { x, y, homeX: x, homeY: y, heldBy: -1 };
    });
  if (camp)
    ent.lanterns = p.markers.lantern.map((c): PickE => {
      const x = c.x * TILE + TILE / 2,
        y = c.y * TILE + TILE / 2;
      return { x, y, homeX: x, homeY: y, heldBy: -1 };
    });
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const k = grid.cells[idx(x, y, p.w)];
      if (k === T.Crystal) {
        if (camp) ent.crystals.push({ x, y });
        else grid.cells[idx(x, y, p.w)] = T.Empty;
      } // a crystal outside a campaign is just air (nothing lights it)
      if (k === T.Door) ent.doorCells.add(idx(x, y, p.w));
      if (k === T.Crumble) ent.crumbles.push({ x, y, state: 0, t: 0 });
    }
  const letters = Object.keys(p.objects).sort();
  for (const ch of letters) {
    const o = p.objects[ch]!;
    const param = o.param;
    if (!param) continue;
    const rect = { x: o.bounds.x * TILE, y: o.bounds.y * TILE, w: o.bounds.w * TILE, h: o.bounds.h * TILE };
    if (param.kind === 'plate' || param.kind === 'lever' || param.kind === 'target') {
      ent.activators.push({
        letter: ch,
        kind: param.kind,
        rect,
        opens: param.opens,
        latch: param.kind === 'target' ? false : param.latch,
        weight: param.kind === 'plate' ? param.weight : 1,
        required: 1,
        load: 0,
        pressed: false,
        latched: false,
        holders: [],
        timer: 0,
      });
    } else {
      ent.objectives.push({
        letter: ch,
        kind: param.kind,
        param,
        cells: o.cells,
        rect,
        hasOpener: false,
        open: false,
        platformId: -1,
        phase: 0,
        ox: 0,
        oy: 0,
        dx: 0,
        dy: 0,
        load: 0,
        moving: false,
      });
    }
  }
  let m = 0,
    b = 0,
    sk = 0;
  for (const ob of ent.objectives) {
    ob.hasOpener = ent.activators.some((a) => a.opens === ob.letter);
    if (ob.kind === 'mover') ob.platformId = MOVER_ID0 + m++;
    if (ob.kind === 'balance') ob.platformId = BALANCE_ID0 + b++;
    if (ob.kind === 'sinker') ob.platformId = SINKER_ID0 + sk++;
    ob.open = ob.kind === 'gate' ? false : ob.kind === 'ladder' ? !ob.hasOpener : ob.kind === 'mover' ? !ob.hasOpener : true;
    if (ob.kind === 'gate') for (const c of ob.cells) setTile(grid, c.x, c.y, T.Door);
    if (ob.kind === 'ladder') for (const c of ob.cells) setTile(grid, c.x, c.y, ob.open ? T.Ladder : T.Object);
  }
  const mkBox = (c: Cell, heavy: boolean, i: number): BoxE => {
    const x = c.x * TILE + (TILE - BOX_SIZE) / 2,
      y = (c.y + 1) * TILE - BOX_SIZE;
    return { id: BOX_ID0 + i, heavy, x, y, vy: 0, homeX: x, homeY: y, holders: [], dx: 0, dy: 0, grounded: false };
  };
  p.markers.box.forEach((c, i) => ent.boxes.push(mkBox(c, false, i)));
  p.markers.heavyBox.forEach((c, i) => ent.boxes.push(mkBox(c, true, p.markers.box.length + i)));
  ent.keys = p.markers.key.map(
    (c): KeyE => ({
      x: c.x * TILE + TILE / 2,
      y: c.y * TILE + TILE / 2,
      homeX: c.x * TILE + TILE / 2,
      homeY: c.y * TILE + TILE / 2,
      heldBy: -1,
      used: false,
    }),
  );
  const hz = p.def.hazard;
  if (hz) {
    const pos = hz.kind === 'avalanche' ? -AVALANCHE_START_TILES * TILE : p.h * TILE;
    ent.hazard = { kind: hz.kind, speed: hz.speed * hazardMult, pos, frozen: 0, phase: 0 } satisfies HazardE;
  }
  return ent;
}

export const boxPlatform = (b: BoxE): Platform => ({
  id: b.id,
  x: b.x,
  y: b.y,
  w: BOX_SIZE,
  h: BOX_SIZE,
  oneWay: true,
  dx: b.dx,
  dy: b.dy,
});
export const objRect = (o: Objective): PxRect => ({ x: o.rect.x + o.ox, y: o.rect.y + o.oy, w: o.rect.w, h: o.rect.h });

// Surfaces that are not tiles and not heads: free boxes, movers, balance plates (all one-way: you stand on them from above).
export function extraPlatforms(w: World): Platform[] {
  const out: Platform[] = [];
  for (const b of w.ent.boxes) if (b.holders.length === 0) out.push(boxPlatform(b));
  for (const o of w.ent.objectives) {
    if (o.kind !== 'mover' && o.kind !== 'balance' && o.kind !== 'sinker') continue;
    const r = objRect(o);
    out.push({ id: o.platformId, x: r.x, y: r.y, w: r.w, h: r.h, oneWay: true, dx: o.dx, dy: o.dy });
  }
  return out;
}

// --- 1. movers and balance (plan §4 step 1)
export function stepMovers(w: World): void {
  for (const o of w.ent.objectives) {
    if (o.kind !== 'mover') {
      o.dx = 0;
      o.dy = 0;
      continue;
    }
    const prm = o.param as Extract<Objective['param'], { kind: 'mover' }>;
    const ox0 = o.ox,
      oy0 = o.oy;
    if (o.open) o.phase += DT;
    const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * o.phase) / Math.max(0.1, prm.periodSec));
    o.ox = prm.dx * TILE * f;
    o.oy = prm.dy * TILE * f;
    o.dx = o.ox - ox0;
    o.dy = o.oy - oy0;
  }
  const byLetter = new Map(w.ent.objectives.map((o) => [o.letter, o]));
  for (const o of w.ent.objectives) {
    if (o.kind !== 'balance') continue;
    const prm = o.param as Extract<Objective['param'], { kind: 'balance' }>;
    const q = byLetter.get(prm.partner);
    if (!q) continue;
    if (o.letter > q.letter) continue; // handled by the lower letter
    const oy0 = o.oy,
      qy0 = q.oy;
    const c = w.camp; // campaign (dynamic 4): ANY difference moves it (also against an empty plate) at a fixed speed; the legacy rule needs both plates loaded
    if (c ? o.load !== q.load : o.load > 0 && q.load > 0 && o.load !== q.load) {
      const step = (c ? c.balanceTilesPerSec : prm.speed) * TILE * DT; // the balance is not a hazard: difficulty does not scale it
      o.oy += o.load > q.load ? step : -step;
      const lim = prm.travel * TILE;
      o.oy = Math.max(-lim, Math.min(lim, o.oy));
    }
    q.oy = -o.oy;
    o.dx = 0;
    q.dx = 0;
    o.dy = o.oy - oy0;
    q.dy = q.oy - qy0;
    const moving = Math.abs(o.dy) > 1e-9;
    if (c && moving && !o.moving)
      emit(w, 'obst.balance', { id: o.load > q.load ? o.letter : q.letter, other: o.load > q.load ? q.letter : o.letter }); // the heavier plate and its partner
    o.moving = moving;
    q.moving = moving;
  }
}

// --- 2. what stands on what: loads for plates and balance plates
interface Unit {
  id: number;
  w: number;
  rect: PxRect;
  supportId: number;
  standing: boolean;
}
function unitsOf(w: World): Map<number, Unit> {
  const m = new Map<number, Unit>();
  for (const p of w.players) {
    if (!isActive(p)) continue;
    m.set(p.slot, { id: p.slot, w: 1, rect: bodyRect(p.body), supportId: p.body.supportId, standing: p.body.grounded });
  }
  for (const b of w.ent.boxes) {
    if (b.holders.length > 0) continue;
    m.set(b.id, { id: b.id, w: b.heavy ? 2 : 1, rect: { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE }, supportId: -1, standing: b.grounded });
  }
  return m;
}

export function computeLoads(w: World): void {
  for (const a of w.ent.activators) a.load = 0;
  for (const o of w.ent.objectives) o.load = 0;
  const units = unitsOf(w);
  const plates = w.ent.activators.filter((a) => a.kind === 'plate');
  const balances = w.ent.objectives.filter((o) => o.kind === 'balance' || o.kind === 'sinker'); // (a sinker's load is the same count)
  for (const u of units.values()) {
    if (!u.standing) continue;
    let base = u,
      depth = 0;
    while (base.supportId >= 0 && units.has(base.supportId) && depth++ < 12) base = units.get(base.supportId)!;
    if (base.supportId >= MOVER_ID0) {
      const o = balances.find((q) => q.platformId === base.supportId);
      if (o) o.load += u.w;
      continue;
    }
    if (base.supportId >= 0 || !base.standing) continue; // stood on something that is not a unit or a platform of ours
    const feet = base.rect.y + base.rect.h;
    for (const a of plates) {
      if (Math.abs(feet - (a.rect.y + a.rect.h)) <= 2.5 && base.rect.x < a.rect.x + a.rect.w && base.rect.x + base.rect.w > a.rect.x) {
        a.load += u.w;
        break;
      }
    }
  }
}

export function requiredWeight(weight: Weight, n: number): number {
  const v =
    weight === 'half-up'
      ? Math.ceil(n / 2)
      : weight === 'half-down'
        ? Math.floor(n / 2)
        : weight === 'all'
          ? n
          : weight === 'all-but-1'
            ? n - 1
            : Math.min(weight, n);
  return Math.max(1, v);
}

// --- 3. activators open objectives
function setObjectiveCells(w: World, o: Objective, kind: number): void {
  for (const c of o.cells) setTile(w.grid, c.x, c.y, kind as never);
  w.tilesVersion++;
}
const occupied = (w: World, cells: Cell[]): boolean => {
  const rs = cells.map(px);
  for (const p of w.players) if (p.connected && p.mode !== 'dead' && rs.some((r) => overlaps(r, bodyRect(p.body)))) return true;
  for (const b of w.ent.boxes) if (rs.some((r) => overlaps(r, { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE }))) return true;
  return false;
};

// --- targets (campaign dynamic 5): touched in flight (feet off the ground) opens its gate for targetSec; touching it again restarts the clock
export function stepTargets(w: World): void {
  const c = w.camp;
  if (!c) return;
  for (const a of w.ent.activators) {
    if (a.kind !== 'target') continue;
    if (a.timer > 0) a.timer--;
    const hit = w.players.find(
      (p) =>
        isActive(p) &&
        !p.body.grounded &&
        !p.climbing &&
        p.camp.pick === 0 &&
        p.holding?.kind !== 'ring' &&
        overlaps(a.rect, bodyRect(p.body)),
    );
    if (!hit) continue;
    const fresh = a.timer === 0;
    a.timer = Math.round(c.targetSec / DT);
    if (fresh) emit(w, 'obst.target', { id: a.letter, player: hit.slot, seconds: c.targetSec });
  }
}

export function stepActivation(w: World): void {
  const n = w.players.filter((p) => p.connected).length;
  for (const a of w.ent.activators) {
    const was = a.pressed;
    if (a.kind === 'plate') {
      a.required = requiredWeight(a.weight, n);
      a.pressed = n > 0 && a.load >= a.required;
    } else if (a.kind === 'target') a.pressed = a.timer > 0;
    else a.pressed = a.holders.length > 0;
    if (a.pressed && a.latch) a.latched = true;
    if (a.kind === 'plate' && a.pressed !== was) emit(w, 'obst.plate', { id: a.letter, pressed: a.pressed, weight: a.load });
  }
  for (const o of w.ent.objectives) {
    if (o.kind === 'balance') continue;
    const want = o.hasOpener ? w.ent.activators.some((a) => a.opens === o.letter && (a.latch ? a.latched : a.pressed)) : o.kind !== 'gate';
    if (want === o.open) continue;
    if (o.kind === 'gate') {
      if (!want && occupied(w, o.cells)) continue; // a gate never closes on somebody: it waits
      o.open = want;
      setObjectiveCells(w, o, want ? T.Object : T.Door);
      emit(w, 'obst.gate', { id: o.letter, open: want });
    } else if (o.kind === 'ladder') {
      o.open = want;
      setObjectiveCells(w, o, want ? T.Ladder : T.Object);
    } else o.open = want;
  }
}

// --- crumbling tiles (plan §9 '!')
export function stepCrumbles(w: World): void {
  const fall = Math.round(CRUMBLE_FALL_SEC / DT),
    back = Math.round(CRUMBLE_BACK_SEC / DT);
  const standing = w.players.filter((p) => isActive(p) && p.body.grounded && p.body.supportId === -1);
  for (const c of w.ent.crumbles) {
    if (c.state === 0) {
      const top = c.y * TILE;
      if (
        standing.some((p) => Math.abs(p.body.y + PLAYER_H - top) <= 1 && p.body.x < (c.x + 1) * TILE && p.body.x + PLAYER_W > c.x * TILE)
      ) {
        c.state = 1;
        c.t = 0;
      }
    } else if (c.state === 1) {
      if (++c.t >= fall) {
        c.state = 2;
        c.t = 0;
        setTile(w.grid, c.x, c.y, T.Empty);
        w.tilesVersion++;
      }
    } else if (c.t < back) c.t++;
    else if (!occupied(w, [{ x: c.x, y: c.y }])) {
      c.state = 0;
      c.t = 0;
      setTile(w.grid, c.x, c.y, T.Crumble);
      w.tilesVersion++;
    }
  }
}
export const crumbleAt = (ent: Entities, x: number, y: number): CrumbleE | undefined => ent.crumbles.find((c) => c.x === x && c.y === y);

// --- belts: a body standing on '<' or '>' is carried at BELT_SPEED
export function beltDx(w: World, p: PlayerState): number {
  const b = p.body;
  if (!b.grounded || b.supportId !== -1) return 0;
  const row = Math.round((b.y + PLAYER_H) / TILE);
  let dx = 0;
  for (let tx = tileOf(b.x), end = tileOf(b.x + PLAYER_W - 1e-6); tx <= end; tx++) {
    const k = tileAt(w.grid, tx, row);
    if (k === T.BeltR) dx = BELT_SPEED * DT;
    else if (k === T.BeltL) dx = -BELT_SPEED * DT;
    if (dx !== 0) break;
  }
  return dx;
}

// --- boxes
function landBox(g: TileGrid, b: BoxE): void {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY_UP * GRAVITY_DOWN_MULT * DT);
  const dy = b.vy * DT;
  const feetOld = b.y + BOX_SIZE,
    feetNew = feetOld + dy;
  let top = Infinity;
  const x0 = tileOf(b.x),
    x1 = tileOf(b.x + BOX_SIZE - 1e-6);
  for (let ty = Math.ceil((feetOld - 0.01) / TILE); ty <= Math.floor(feetNew / TILE); ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(g, tx, ty);
      if ((isSolidKind(k) || isOneWayKind(k)) && ty * TILE < top) top = ty * TILE;
    }
  }
  if (top !== Infinity) {
    b.y = top - BOX_SIZE;
    b.vy = 0;
    b.grounded = true;
  } else {
    b.y += dy;
    b.grounded = false;
  }
}

export function stepBoxes(w: World, releaseHolder: (p: PlayerState) => void): void {
  for (const b of w.ent.boxes) {
    const x0 = b.x,
      y0 = b.y;
    for (const s of [...b.holders]) {
      const p = w.players.find((q) => q.slot === s);
      const lost =
        !p ||
        !isActive(p) ||
        p.holding?.kind !== 'box' ||
        p.holding.id !== b.id ||
        Math.hypot(p.body.x + PLAYER_W / 2 - (b.x + BOX_SIZE / 2), p.body.y + PLAYER_H / 2 - (b.y + BOX_SIZE / 2)) > HOLD_BREAK;
      if (lost) {
        if (p) releaseHolder(p);
        else b.holders.splice(b.holders.indexOf(s), 1);
      }
    }
    const need = b.heavy ? HEAVY_GRIPS : 1;
    if (b.holders.length >= need) {
      const lead = w.players.find((q) => q.slot === b.holders[0])!;
      const f = lead.body.facing;
      const tx = lead.body.x + PLAYER_W / 2 + f * (PLAYER_W / 2 + BOX_SIZE / 2 + 1) - BOX_SIZE / 2;
      const ty = lead.body.y + PLAYER_H - BOX_SIZE;
      pushRect(w.grid, b, BOX_SIZE, BOX_SIZE, tx - b.x, ty - b.y);
      b.vy = 0;
      b.grounded = true;
    } else if (b.holders.length === 0) {
      landBox(w.grid, b);
    }
    const r = { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE };
    if (boxTouches(w.grid, r.x + 4, r.y + 4, r.w - 8, r.h - 8, isHazardKind) || b.y > (w.level.h + 1) * TILE) {
      for (const s of [...b.holders]) {
        const p = w.players.find((q) => q.slot === s);
        if (p) releaseHolder(p);
      }
      b.x = b.homeX;
      b.y = b.homeY;
      b.vy = 0;
      b.grounded = false;
      b.holders = [];
    }
    b.dx = b.x - x0;
    b.dy = b.y - y0;
  }
}

// --- keys and doors
function floodDoor(w: World, start: number, out: Set<number>): void {
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (out.has(i) || !w.ent.doorCells.has(i) || w.grid.cells[i] !== T.Door) continue;
    out.add(i);
    const x = i % w.grid.w,
      y = Math.floor(i / w.grid.w);
    if (x > 0) stack.push(i - 1);
    if (x < w.grid.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w.grid.w);
    if (y < w.grid.h - 1) stack.push(i + w.grid.w);
  }
}
export function stepKeys(w: World): void {
  for (const k of w.ent.keys) {
    if (k.used) continue;
    if (k.heldBy < 0) {
      const p = w.players.find(
        (q) =>
          isActive(q) &&
          Math.abs(q.body.x + PLAYER_W / 2 - k.x) < PLAYER_W / 2 + 6 &&
          Math.abs(q.body.y + PLAYER_H / 2 - k.y) < PLAYER_H / 2 + 6,
      );
      if (p) k.heldBy = p.slot;
      continue;
    }
    const p = w.players.find((q) => q.slot === k.heldBy);
    if (!p || !isActive(p)) {
      k.heldBy = -1;
      k.x = k.homeX;
      k.y = k.homeY;
      continue;
    }
    k.x = p.body.x + PLAYER_W / 2;
    k.y = p.body.y - 6;
    const reach = { x: p.body.x - KEY_REACH, y: p.body.y - KEY_REACH, w: PLAYER_W + 2 * KEY_REACH, h: PLAYER_H + 2 * KEY_REACH };
    const open = new Set<number>();
    for (let ty = tileOf(reach.y); ty <= tileOf(reach.y + reach.h); ty++)
      for (let tx = tileOf(reach.x); tx <= tileOf(reach.x + reach.w); tx++) {
        if (tx >= 0 && ty >= 0 && tx < w.grid.w && ty < w.grid.h) floodDoor(w, idx(tx, ty, w.grid.w), open);
      }
    if (open.size) {
      for (const i of [...open].sort((a, b) => a - b)) setTile(w.grid, i % w.grid.w, Math.floor(i / w.grid.w), T.Empty);
      w.tilesVersion++;
      k.used = true;
      k.heldBy = -1;
      const first = Math.min(...open);
      emit(w, 'obst.gate', { id: `door:${first % w.grid.w},${Math.floor(first / w.grid.w)}`, open: true });
    }
  }
}

// --- hazards (plan §9 hazard): speeds are tiles/s, scaled by difficulty in createEntities
export function stepHazard(w: World): void {
  const h = w.ent.hazard;
  if (!h) return;
  if (h.frozen > 0) {
    h.frozen--;
    return;
  }
  h.phase += DT;
  if (h.kind === 'risingLava') h.pos -= h.speed * TILE * DT;
  else if (h.kind === 'avalanche') h.pos += h.speed * TILE * DT;
  else {
    const u = (h.phase % TIDE_PERIOD_SEC) / TIDE_PERIOD_SEC;
    const tri = u < 0.5 ? 2 * u : 2 * (1 - u);
    h.pos = w.level.h * TILE - h.speed * (TIDE_PERIOD_SEC / 2) * TILE * tri;
  }
}
export const freezeHazard = (w: World): void => {
  if (w.ent.hazard?.kind === 'risingLava') w.ent.hazard.frozen = Math.round(FREEZE_SEC / DT);
};
export function hazardKills(w: World, p: PlayerState): 'hazard' | 'liquid' | null {
  const h = w.ent.hazard;
  if (!h) return null;
  const b = p.body;
  if (h.kind === 'avalanche') return b.x + PLAYER_W / 2 < h.pos ? 'hazard' : null;
  return b.y + PLAYER_H > h.pos + 4 ? (h.kind === 'tide' ? 'liquid' : 'hazard') : null;
}
