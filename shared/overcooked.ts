// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
import { ROUND_MS } from './protocol';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile
export const CUT_MS = 2500;
export const COOK_MS = 6000;
export const ORDER_TTL_MS = 70_000;
export const ORDER_EVERY_MS = 25_000;
export const MAX_ORDERS = 4;
export const REWARD = 100;
export const PENALTY = -50;

// # wall, . floor, A/B ingredient crates, K cutting board, P pot, D plate pile, W delivery window, T counter, X trash
export const MAP = [
  '#A#B#K#K#P#',
  '#.........#',
  'T.........#',
  'W.........X',
  'T.........#',
  '#.........#',
  '#D#T#######',
];
export const COLS = MAP[0]!.length;
export const ROWS = MAP.length;

export type StationKind = 'crate' | 'board' | 'pot' | 'plates' | 'window' | 'counter' | 'trash';
export type Item = 'raw0' | 'raw1' | 'cut0' | 'cut1' | 'plate' | 'dish';
const KINDS: Record<string, StationKind> = { A: 'crate', B: 'crate', K: 'board', P: 'pot', D: 'plates', W: 'window', T: 'counter', X: 'trash' };

export interface Station {
  kind: StationKind;
  tx: number;
  ty: number;
  crate: number; // ingredient type, crates only
  item: Item | null; // boards and counters
  progress: number; // 0..1: board cutting or pot cooking
  inputs: number[]; // pot: ingredient types inside
  done: boolean; // pot: dish ready
}
export interface Player {
  id: number;
  slot: number;
  x: number;
  y: number;
  fx: number; // facing, last non-null stick vector
  fy: number;
  item: Item | null;
  cutting: boolean;
}
export interface Order { id: number; expiresAt: number }
export interface Controls { x: number; y: number; a: number; b: boolean } // a = new A presses since last tick
export interface Game {
  time: number;
  over: boolean;
  score: number;
  delivered: number;
  players: Map<number, Player>;
  stations: Station[];
  orders: Order[];
  nextOrderAt: number;
  orderSeq: number;
}

export const isSolid = (tx: number, ty: number) => (MAP[ty]?.[tx] ?? '#') !== '.';

export function createGame(): Game {
  const stations: Station[] = [];
  MAP.forEach((row, ty) => [...row].forEach((c, tx) => {
    const kind = KINDS[c];
    if (kind) stations.push({ kind, tx, ty, crate: c === 'B' ? 1 : 0, item: null, progress: 0, inputs: [], done: false });
  }));
  return { time: 0, over: false, score: 0, delivered: 0, players: new Map(), stations, orders: [], nextOrderAt: 0, orderSeq: 0 };
}

export function addPlayer(g: Game, id: number, slot: number) {
  if (g.players.has(id)) return;
  g.players.set(id, { id, slot, x: 2.5 + (slot % 4) * 2, y: 4.5 + (Math.floor(slot / 4) % 2), fx: 0, fy: 1, item: null, cutting: false });
}
export const removePlayer = (g: Game, id: number) => { g.players.delete(id); };

const blocked = (x: number, y: number) => {
  for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++)
    for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) if (isSolid(tx, ty)) return true;
  return false;
};

export function targetStation(g: Game, p: Player): Station | null {
  const len = Math.hypot(p.fx, p.fy) || 1;
  const px = p.x + (p.fx / len) * REACH;
  const py = p.y + (p.fy / len) * REACH;
  let best: Station | null = null;
  let bestD = REACH_SLACK;
  for (const s of g.stations) {
    const d = Math.hypot(px - Math.max(s.tx, Math.min(px, s.tx + 1)), py - Math.max(s.ty, Math.min(py, s.ty + 1)));
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

const cutOf = (i: Item): Item | null => (i === 'raw0' ? 'cut0' : i === 'raw1' ? 'cut1' : null);
const cutType = (i: Item | null) => (i === 'cut0' ? 0 : i === 'cut1' ? 1 : -1);

function interact(g: Game, p: Player, s: Station) {
  switch (s.kind) {
    case 'crate':
      if (!p.item) p.item = s.crate === 0 ? 'raw0' : 'raw1';
      break;
    case 'plates':
      if (!p.item) p.item = 'plate';
      break;
    case 'counter':
      if (p.item && !s.item) { s.item = p.item; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; }
      break;
    case 'board':
      if (p.item && !s.item && cutOf(p.item)) { s.item = p.item; s.progress = 0; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; s.progress = 0; }
      break;
    case 'pot': {
      const t = cutType(p.item);
      if (t >= 0 && !s.done && !s.inputs.includes(t) && s.inputs.length < 2) {
        s.inputs.push(t);
        s.progress = 0;
        p.item = null;
      } else if (p.item === 'plate' && s.done) {
        p.item = 'dish';
        s.done = false;
        s.inputs = [];
        s.progress = 0;
      }
      break;
    }
    case 'window':
      if (p.item === 'dish' && g.orders.length) {
        g.orders.shift();
        g.score += REWARD;
        g.delivered++;
        p.item = null;
      }
      break;
    case 'trash':
      p.item = null;
      break;
  }
}

export function tick(g: Game, controls: Map<number, Controls>, dtMs = TICK_MS) {
  if (g.over) return;
  const dt = dtMs / 1000;
  g.time += dtMs;

  for (const p of g.players.values()) {
    const c = controls.get(p.id) ?? { x: 0, y: 0, a: 0, b: false };
    const target = targetStation(g, p);
    p.cutting = !!(c.b && target?.kind === 'board' && target.item && cutOf(target.item));
    if (p.cutting && target) {
      target.progress += dtMs / CUT_MS;
      if (target.progress >= 1) { target.item = cutOf(target.item!); target.progress = 0; }
    } else {
      if (c.x || c.y) { p.fx = c.x; p.fy = c.y; }
      const nx = p.x + c.x * SPEED * dt;
      if (!blocked(nx, p.y)) p.x = nx;
      const ny = p.y + c.y * SPEED * dt;
      if (!blocked(p.x, ny)) p.y = ny;
    }
    for (let i = 0; i < c.a; i++) {
      const s = targetStation(g, p);
      if (s) interact(g, p, s);
    }
  }

  for (const s of g.stations) {
    if (s.kind === 'pot' && !s.done && s.inputs.length === 2) {
      s.progress += dtMs / COOK_MS;
      if (s.progress >= 1) { s.progress = 1; s.done = true; }
    }
  }

  if (g.time >= g.nextOrderAt) {
    if (g.orders.length < MAX_ORDERS) g.orders.push({ id: g.orderSeq++, expiresAt: g.time + ORDER_TTL_MS });
    g.nextOrderAt += ORDER_EVERY_MS;
  }
  const alive = g.orders.filter((o) => o.expiresAt > g.time);
  g.score += (g.orders.length - alive.length) * PENALTY;
  g.orders = alive;

  if (g.time >= ROUND_MS) g.over = true;
}
