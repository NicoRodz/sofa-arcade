import { describe, expect, it } from 'vitest';
import { JUMP_V0, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { TILE_CHARS } from '../legend';
import { physicsFor } from '../sim/player';
import type { TileGrid } from '../sim/tiles';
import { EDGE_MOVE_SCALE, ropeJumpLaunch, simPlan, feetOfRow, type Plan, type CatchZone } from './sim';

const grid = (rows: string[]): TileGrid => ({
  w: rows[0]!.length,
  h: rows.length,
  cells: Uint8Array.from(rows.flatMap((r) => [...r].map((c) => TILE_CHARS[c] ?? 0))),
});
const P = physicsFor('hard');
// 12 rows x 40 cols: floor top at row 9 (standing row 8); `extra` rows overwrite from the top
const level = (over: Record<number, string> = {}): TileGrid =>
  grid(Array.from({ length: 12 }, (_, y) => over[y] ?? (y >= 9 ? '#'.repeat(40) : '.'.repeat(40))));
const plan = (o: Partial<Plan>): Plan => ({
  x: 5 * TILE,
  feetY: feetOfRow(8),
  dir: 1,
  trigger: 'at',
  k: 0,
  air: 'hold',
  f: EDGE_MOVE_SCALE,
  ...o,
});

describe('simPlan runs the real stepPlayer', () => {
  it('a standing jump lands back on the same row; a jump with the stick held travels about 4.5 tiles at 92 %', () => {
    const g = level();
    const up = simPlan(g, P, plan({ dir: 0 }))!;
    expect(up.ty).toBe(8);
    expect(up.landX).toBeCloseTo(5 * TILE, 3);
    const fwd = simPlan(g, P, plan({}))!;
    expect(fwd.ty).toBe(8);
    expect((fwd.landX - 5 * TILE) / TILE).toBeGreaterThan(4.2);
    expect((fwd.landX - 5 * TILE) / TILE).toBeLessThan(5);
  });

  it('a hazard under the flight path kills the plan; the same plan over plain floor lands', () => {
    const spikes = level({ 8: '.'.repeat(8) + '^^' + '.'.repeat(30) });
    // from x = 6 tiles, a jump held forward crosses cols 8-9 low enough to touch them only if it starts too close
    const near = simPlan(spikes, P, plan({ x: 8 * TILE - PLAYER_W, trigger: 'at' }));
    expect(near).toBeNull(); // takes off flush against the spikes: dies on the way up
    expect(simPlan(spikes, P, plan({ x: 5 * TILE, trigger: 'edge', lead: 32, endX: 8 * TILE }))).toBeNull(); // 32 px of run-up is still inside the spikes while it rises
    const early = simPlan(spikes, P, plan({ x: 5 * TILE, trigger: 'edge', lead: 80, endX: 8 * TILE }));
    expect(early).not.toBeNull(); // 80 px before them it clears
    expect(early!.cx).toBeGreaterThanOrEqual(10);
    expect(simPlan(level(), P, plan({ x: 8 * TILE - PLAYER_W, trigger: 'at' }))).not.toBeNull();
  });

  it('falling out of the level is death (null), falling onto a boya is a node of its own', () => {
    const pit = level({
      9: '#'.repeat(10) + '.'.repeat(5) + '#'.repeat(25),
      10: '#'.repeat(10) + '.'.repeat(5) + '#'.repeat(25),
      11: '#'.repeat(10) + '.'.repeat(5) + '#'.repeat(25),
    });
    expect(simPlan(pit, P, plan({ x: 9 * TILE, trigger: 'walk' }))).toBeNull();
    const boya = level({ 9: '#'.repeat(11) + 'T' + '#'.repeat(28) });
    const l = simPlan(boya, P, plan({ x: 11 * TILE + 7, dir: 0, trigger: 'at' }))!;
    expect(l.cx).toBe(11);
    expect(l.ty).toBe(8);
  });

  it('pushing against a wall on the ground is abandoned early instead of running to the step cap', () => {
    const wall = level({
      4: '.'.repeat(8) + '#' + '.'.repeat(31),
      5: '.'.repeat(8) + '#' + '.'.repeat(31),
      6: '.'.repeat(8) + '#' + '.'.repeat(31),
      7: '.'.repeat(8) + '#' + '.'.repeat(31),
      8: '.'.repeat(8) + '#' + '.'.repeat(31),
    });
    expect(simPlan(wall, P, plan({ x: 3 * TILE, trigger: 'edge', k: 0 }))).toBeNull();
  });

  it('the hand: a body falling short beside a ledge is caught at its edge (viaHand); without the zone it slides back to the foot', () => {
    // a wall of 5 tiles from col 12 (top at row 4): a jump from the foot peaks 67 px under the top, inside the 2-tile Hard zone
    const rows = (y: number) => (y >= 4 && y <= 8 ? '.'.repeat(12) + '#'.repeat(28) : undefined);
    const wall = level(Object.fromEntries([4, 5, 6, 7, 8].map((y) => [y, rows(y)!])));
    const top = 4 * TILE;
    const zone: CatchZone = { x0: 12 * TILE - 54, x1: 12 * TILE + 6, yTop: top + 2, yBot: top + 2 * TILE, cx: 12, ty: 3 };
    const catches = new Map<number, CatchZone[]>([
      [10, [zone]],
      [11, [zone]],
      [12, [zone]],
    ]);
    const jump = plan({ x: 12 * TILE - PLAYER_W, trigger: 'at' });
    const plain = simPlan(wall, P, jump)!;
    expect(plain.viaHand).toBe(false);
    expect(plain.ty).toBe(8); // back at the foot
    const caught = simPlan(wall, P, jump, catches)!;
    expect(caught.viaHand).toBe(true);
    expect({ cx: caught.cx, ty: caught.ty }).toEqual({ cx: 12, ty: 3 });
  });

  it('a throw and a rope jump are launches: they start airborne with the given velocity', () => {
    const g = level();
    const throwPlan: Plan = {
      x: 5 * TILE,
      feetY: feetOfRow(8) - PLAYER_H,
      dir: 1,
      trigger: 'launch',
      k: 0,
      air: 'hold',
      f: 1,
      vx0: 420 * EDGE_MOVE_SCALE,
      vy0: -950 * EDGE_MOVE_SCALE,
    };
    const thrown = simPlan(g, P, throwPlan)!;
    expect((thrown.landX - 5 * TILE) / TILE).toBeGreaterThan(5);
    const rope = ropeJumpLaunch(10 * TILE, 8 * TILE, 1, EDGE_MOVE_SCALE);
    expect(rope.vy0).toBeCloseTo(-JUMP_V0 * 0.8, 6);
    expect(simPlan(g, P, rope)).not.toBeNull();
  });

  it('the stick scale shortens the reach: 70 % of the stick lands closer than 92 %', () => {
    const g = level();
    const far = simPlan(g, P, plan({ f: 0.92 }))!;
    const near = simPlan(g, P, plan({ f: 0.7 }))!;
    expect(near.landX).toBeLessThan(far.landX - TILE);
  });
});
