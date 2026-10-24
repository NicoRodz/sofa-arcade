// Helpers for the F2a tests: tiny levels from ASCII, scripted inputs, run loops.
import type { Difficulty } from '../../../difficulty';
import type { EntityParam, GameMode, LevelDef } from '../types';
import { TILE } from '../constants';
import type { PlayerStep } from './input';
import { createWorld, step, type World } from './world';
import type { ObstEventName, ObstEvents } from '../events';
import type { ObstEvent } from './state';

export const IDLE: PlayerStep = { move: 0, down: false, jump: false, up: false, grab: false };
export const inp = (o: Partial<PlayerStep> = {}): PlayerStep => ({ ...IDLE, ...o });

export function level(rows: string[], extra: Partial<LevelDef> & { params?: Record<string, EntityParam> } = {}): LevelDef {
  return { id: 't', name: 't', biome: 'beach', players: { min: 2, max: 8 }, tether: 'any', stars: 1, parSec: 60, rows, ...extra };
}

// Open hall: w columns, h rows, floor on the last two rows, spawn at column 2 and goal at the far right. `mid` lines replace the rows above the floor, bottom first.
export function hall(w = 60, h = 14, extra: Record<number, string> = {}): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    if (y >= h - 2) { rows.push('#'.repeat(w)); continue; }
    let r = `#${'.'.repeat(w - 2)}#`;
    if (y === h - 3) r = `#.S${'.'.repeat(w - 6)}G.#`;
    if (extra[y]) r = extra[y]!;
    rows.push(r);
  }
  return rows;
}
export const put = (row: string, col: number, s: string): string => row.slice(0, col) + s + row.slice(col + s.length);

export interface Opts { mode?: GameMode; difficulty?: Difficulty; slots?: number[] }
export function world(def: LevelDef, o: Opts = {}): World {
  return createWorld({ level: def, mode: o.mode ?? 'chain', difficulty: o.difficulty ?? 'normal', slots: o.slots ?? [0, 1] });
}

export type InputFn = (slot: number, tick: number) => PlayerStep | undefined;
export function run(w: World, steps: number, f: InputFn = () => undefined, onStep?: (events: ObstEvent[]) => void, off?: (tick: number) => boolean[]): ObstEvent[] {
  const all: ObstEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const inputs: (PlayerStep | undefined)[] = [];
    for (const p of w.players) inputs[p.slot] = f(p.slot, w.tick);
    const ev = step(w, inputs, off ? { offCamera: off(w.tick) } : {});
    all.push(...ev);
    onStep?.(ev);
  }
  return all;
}
export const names = (ev: ObstEvent[]): string[] => ev.map((e) => e.name);
export const of = <K extends ObstEventName>(ev: ObstEvent[], name: K): ObstEvents[K][] => ev.filter((e) => e.name === name).map((e) => e.data as ObstEvents[K]);
export const pl = (w: World, slot: number) => w.players.find((p) => p.slot === slot)!;
export const feetOnFloor = (w: World, slot: number, floorRow: number) => Math.abs(pl(w, slot).body.y + 46 - floorRow * TILE) < 0.7;
// Put a player at tile coords (feet on the bottom of the cell row), for set-ups.
export function teleport(w: World, slot: number, col: number, row: number): void {
  const b = pl(w, slot).body;
  b.x = col * TILE + (TILE - 34) / 2; b.y = (row + 1) * TILE - 46; b.vx = 0; b.vy = 0;
}

// Draws chars into a copy of rows: draw(rows, [col, row, 'abc'] ...) writes the string starting at (col, row).
export function draw(rows: string[], ...items: [number, number, string][]): string[] {
  const out = [...rows];
  for (const [col, row, s] of items) out[row] = put(out[row]!, col, s);
  return out;
}
export const vline = (col: number, from: number, to: number, ch: string): [number, number, string][] => Array.from({ length: to - from + 1 }, (_, i) => [col, from + i, ch] as [number, number, string]);
export const tile = (w: World, col: number, row: number) => w.grid.cells[row * w.grid.w + col];
export const obj = (w: World, letter: string) => w.ent.objectives.find((o) => o.letter === letter)!;

// Teleports every connected player into the goal zone and steps until the level is cleared (or 5 steps pass).
export function clearLevel(w: World): void {
  const g = w.level.markers.goal[0]!;
  for (const p of w.players) if (p.connected) teleport(w, p.slot, g.x, g.y);
  run(w, 5);
}
