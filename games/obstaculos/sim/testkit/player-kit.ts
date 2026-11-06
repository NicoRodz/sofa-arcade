// Shared fixtures of the player physics tests: a flat 40x12 grid, a body standing on it and a one-body step.
import { PLAYER_H, TILE } from '../../constants';
import { TILE_CHARS } from '../../legend';
import { newBody, physicsFor, stepPlayer, type Body, type PhysicsParams, type StepInput } from '../player/player';
import type { TileGrid } from '../world/tiles';

export const NORMAL = physicsFor('normal');
export const idle: StepInput = { move: 0, down: false, jump: false };
export const grid = (rows: string[]): TileGrid => ({
  w: rows[0]!.length,
  h: rows.length,
  cells: Uint8Array.from(rows.flatMap((r) => [...r].map((c) => TILE_CHARS[c] ?? 0))),
});
export const solo = (g: TileGrid, b: Body, input: StepInput, params: PhysicsParams = NORMAL) =>
  stepPlayer(b, input, { grid: g, platforms: [], params });

// 12 rows of 40 columns, floor on row 9 (top at y = 432), a few rows of void below.
export const FLOOR_Y = 9 * TILE;
export const flat = () => grid([...Array(9).fill('.'.repeat(40)), '#'.repeat(40), '.'.repeat(40), '.'.repeat(40)]);
export const standAt = (id: number, x: number, g: TileGrid = flat()): Body => {
  const b = newBody(id, x, FLOOR_Y - PLAYER_H);
  for (let i = 0; i < 3; i++) solo(g, b, idle);
  return b;
};
