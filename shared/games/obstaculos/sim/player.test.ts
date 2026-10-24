import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../rng';
import { DIFFICULTY_PARAMS, JUMP_PEAK_PX, JUMP_V0, MAX_FALL, PLAYER_H, PLAYER_W, TILE, TRAMPOLINE_MULT } from '../constants';
import { LEVEL_01 } from '../levels';
import { TILE_CHARS } from '../legend';
import { parseLevelStrict } from '../parse';
import { hashBodies, newBody, physicsFor, stepPlayer, stepPlayers, type Body, type PhysicsParams, type StepInput } from './player';
import { buildGrid, type TileGrid } from './tiles';

const NORMAL = physicsFor('normal');
const idle: StepInput = { move: 0, down: false, jump: false };
const grid = (rows: string[]): TileGrid => ({ w: rows[0]!.length, h: rows.length, cells: Uint8Array.from(rows.flatMap((r) => [...r].map((c) => TILE_CHARS[c] ?? 0))) });
const solo = (g: TileGrid, b: Body, input: StepInput, params: PhysicsParams = NORMAL) => stepPlayer(b, input, { grid: g, platforms: [], params });

// 12 rows of 40 columns, floor on row 9 (top at y = 432), a few rows of void below.
const FLOOR_Y = 9 * TILE;
const flat = () => grid([...Array(9).fill('.'.repeat(40)), '#'.repeat(40), '.'.repeat(40), '.'.repeat(40)]);
const standAt = (id: number, x: number, g: TileGrid = flat()): Body => {
  const b = newBody(id, x, FLOOR_Y - PLAYER_H);
  for (let i = 0; i < 3; i++) solo(g, b, idle);
  return b;
};

describe('jump (plan §2)', () => {
  it('peaks at 173 +- 2 px and takes about 0.38 s to get there', () => {
    const g = flat();
    const b = standAt(0, 200, g);
    const y0 = b.y;
    let minY = b.y, apex = 0;
    for (let i = 1; i <= 80; i++) {
      solo(g, b, { ...idle, jump: i === 1 });
      if (b.y < minY) { minY = b.y; apex = i; }
    }
    expect(y0 - minY).toBeGreaterThanOrEqual(JUMP_PEAK_PX - 2);
    expect(y0 - minY).toBeLessThanOrEqual(JUMP_PEAK_PX + 2);
    // The hang at the top adds ~0.04 s to the pure parabola (0.38 s): 25 steps measured
    expect(apex / 60).toBeGreaterThan(0.38 - 0.02);
    expect(apex / 60).toBeLessThan(0.38 + 0.06);
  });
  it('the height is fixed: pressing A on every step gives the same arc and no double jump', () => {
    const g = flat();
    const a = standAt(0, 200, g), c = standAt(1, 400, g);
    let minA = a.y, minC = c.y;
    for (let i = 1; i <= 80; i++) {
      solo(g, a, { ...idle, jump: i === 1 });
      solo(g, c, { ...idle, jump: true });
      minA = Math.min(minA, a.y); minC = Math.min(minC, c.y);
    }
    expect(minC).toBeCloseTo(minA, 6); // the spam only re-jumps after landing, never in the air
  });
  it('v0 is 911 px/s on takeoff and the fall caps at 960 px/s', () => {
    const g = flat();
    const b = standAt(0, 200, g);
    const ev = solo(g, b, { ...idle, jump: true });
    expect(ev.jump).toBe('ground');
    expect(b.vy).toBeLessThan(-JUMP_V0 + 100); // after one step of gravity, still near v0
    const tall = grid([...Array(100).fill('.'.repeat(10)), '#'.repeat(10)]);
    const f = newBody(0, 100, 0);
    let vmax = 0, grounded = false;
    for (let i = 0; i < 600 && !grounded; i++) { solo(tall, f, idle); vmax = Math.max(vmax, f.vy); grounded = f.grounded; }
    expect(vmax).toBe(MAX_FALL);
    expect(grounded).toBe(true); // 16 px per step never tunnels a one-tile floor
    expect(f.y + PLAYER_H).toBe(100 * TILE);
  });
});

describe('running (plan §2)', () => {
  it('reaches 330 px/s in 0.08 s and stops in 0.06 s on the ground', () => {
    const g = flat();
    const b = standAt(0, 100, g);
    for (let i = 0; i < 4; i++) solo(g, b, { ...idle, move: 1 });
    expect(b.vx).toBeLessThan(330);
    solo(g, b, { ...idle, move: 1 }); // the 5th step (0.083 s)
    expect(b.vx).toBe(330);
    for (let i = 0; i < 3; i++) solo(g, b, idle);
    expect(b.vx).toBeGreaterThan(0);
    solo(g, b, idle); // the 4th step (0.067 s)
    expect(b.vx).toBe(0);
  });
  it('in the air acceleration is x0.65 and braking x0.3', () => {
    const g = flat();
    const ground = standAt(0, 100, g);
    solo(g, ground, { ...idle, move: 1 });
    const air = newBody(1, 100, 100); // falling, never grounded in one step
    solo(g, air, { ...idle, move: 1 });
    expect(ground.vx).toBeCloseTo(330 / 0.08 / 60, 6);
    expect(air.vx / ground.vx).toBeCloseTo(0.65, 6);
    const brake = newBody(2, 100, 100); brake.vx = 330;
    solo(g, brake, idle);
    expect(330 - brake.vx).toBeCloseTo((330 / 0.06 / 60) * 0.3, 6);
  });
  it('a half stick (0.45) runs at 148.5 px/s', () => {
    const g = flat();
    const b = standAt(0, 100, g);
    for (let i = 0; i < 20; i++) solo(g, b, { ...idle, move: 0.45 });
    expect(b.vx).toBeCloseTo(148.5, 6);
  });
});

describe('what the jump reaches (plan §2): walls, towers, gaps', () => {
  // wall of `n` tiles at columns 10.., floor on row 9; the climber hugs the wall and jumps once
  const wallGrid = (n: number) => grid(Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(40) : y >= 9 - n && y < 9 ? '.'.repeat(10) + '#'.repeat(30) : '.'.repeat(40))));
  const WALL_X = 10 * TILE - PLAYER_W;
  // `bases` players stacked at the wall (each pinned to it holding right), then a climber on top of them jumps
  function climb(wallTiles: number, bases: number): boolean {
    const g = wallGrid(wallTiles);
    const bodies: Body[] = [];
    for (let i = 0; i <= bases; i++) {
      const b = newBody(i, WALL_X, FLOOR_Y - PLAYER_H - i * PLAYER_H);
      bodies.push(b);
    }
    const hold: StepInput = { move: 1, down: false, jump: false };
    for (let i = 0; i < 30; i++) stepPlayers(bodies, bodies.map(() => hold), g, NORMAL); // settle into the tower
    const topId = bases;
    for (let i = 0; i < bases; i++) expect(bodies[i]!.grounded, `base ${i} settled`).toBe(true);
    expect(bodies[topId]!.grounded).toBe(true);
    const wallTop = FLOOR_Y - wallTiles * TILE;
    for (let i = 0; i < 150; i++) {
      stepPlayers(bodies, bodies.map((_, k) => ({ ...hold, jump: k === topId && i === 0 })), g, NORMAL);
      const t = bodies[topId]!;
      if (t.grounded && t.x > WALL_X + 1 && t.y + PLAYER_H === wallTop) return true;
    }
    return false;
  }
  it('alone: 3 tiles yes, 4 no', () => {
    expect(climb(3, 0)).toBe(true);
    expect(climb(4, 0)).toBe(false);
  });
  it('a tower of 2 players reaches 4 tiles but not 5; a tower of 3 reaches 5 but not 6', () => {
    expect(climb(4, 1)).toBe(true);
    expect(climb(5, 1)).toBe(false);
    expect(climb(5, 2)).toBe(true);
    expect(climb(6, 2)).toBe(false);
  });

  // Gap of n tiles on row 9, run up from the left holding right, press A `rel` steps after the body is fully off the edge (negative: before).
  function crosses(gapTiles: number, rel: number, params = NORMAL): boolean {
    const edge = 20 * TILE;
    const rows = Array.from({ length: 12 }, (_, y) => (y >= 9 ? '#'.repeat(20) + '.'.repeat(gapTiles) + '#'.repeat(40 - 20 - gapTiles) : '.'.repeat(40)));
    const g = grid(rows);
    const b = standAt(0, 3 * TILE, g);
    let off = -1, pressed = false;
    for (let i = 0; i < 300; i++) {
      if (off < 0 && b.x >= edge) off = i;
      const lead = rel < 0 && off < 0 && edge - b.x <= -rel * 5.5;
      const late = off >= 0 && i - off === rel;
      const jump = !pressed && (lead || late);
      if (jump) pressed = true;
      solo(g, b, { move: 1, down: false, jump }, params);
      if (pressed && b.grounded && b.x + PLAYER_W > edge + gapTiles * TILE && b.y + PLAYER_H === FLOOR_Y) return true;
      if (b.y > 11 * TILE) return false;
    }
    return false;
  }
  const window = (gap: number) => { let n = 0; for (let rel = -20; rel <= 8; rel++) if (crosses(gap, rel)) n++; return n; };
  it('a 4-tile gap is comfortable (a wide timing window, also without coyote)', () => {
    expect(window(4)).toBeGreaterThanOrEqual(15);
    expect(crosses(4, -8)).toBe(true);
  });
  it('a 5-tile gap is passable, and 7 is impossible even with the full coyote window', () => {
    expect(window(5)).toBeGreaterThan(0);
    expect(window(5)).toBeLessThan(window(4));
    for (let rel = -20; rel <= 8; rel++) expect(crosses(7, rel), `7-gap, rel ${rel}`).toBe(false);
  });
  it('MEASURED: a 6-tile gap only works as a perfectly timed jump (<= 8 steps wide), not "impossible" as the plan says', () => {
    const w = window(6);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(8);
    expect(crosses(6, -3)).toBe(false);
  });
});

describe('coyote time and jump buffer (plan §2)', () => {
  // floor ends at column 10; walk off holding right
  const ledge = () => grid(Array.from({ length: 12 }, (_, y) => (y >= 9 ? '#'.repeat(10) + '.'.repeat(30) : '.'.repeat(40))));
  function jumpAfterLeaving(n: number, params = NORMAL) {
    const g = ledge();
    const b = standAt(0, 8 * TILE, g);
    let guard = 0;
    while (b.grounded && guard++ < 200) solo(g, b, { ...idle, move: 1 }, params);
    expect(b.air).toBe(1);
    while (b.air < n) solo(g, b, { ...idle, move: 1 }, params);
    return solo(g, b, { move: 1, down: false, jump: true }, params).jump;
  }
  it('Normal: at 7 frames off the edge it still jumps, at 8 it does not', () => {
    expect(jumpAfterLeaving(1)).toBe('coyote');
    expect(jumpAfterLeaving(7)).toBe('coyote');
    expect(jumpAfterLeaving(8)).toBe('');
  });
  it('coyote 0 (sabotage target): no jump a single frame after leaving', () => {
    expect(jumpAfterLeaving(1, { ...NORMAL, coyote: 0 })).toBe('');
  });
  it('adaptive coyote widens the window: p90 of 45 ms gives 10 frames; Hard base is 6', () => {
    const p = physicsFor('normal', 45);
    expect(p.coyote).toBe(10);
    expect(jumpAfterLeaving(10, p)).toBe('coyote');
    expect(jumpAfterLeaving(11, p)).toBe('');
    expect(jumpAfterLeaving(6, physicsFor('hard'))).toBe('coyote');
    expect(jumpAfterLeaving(7, physicsFor('hard'))).toBe('');
  });
  // body dropped from the air onto the floor; A pressed `early` steps before the first step that starts grounded
  function bufferedJump(early: number, params = NORMAL) {
    const g = flat();
    const probe = newBody(0, 200, 200);
    let first = 0;
    while (!probe.grounded) { solo(g, probe, idle, params); first++; }
    const startsGrounded = first; // the step index (0-based) at whose start the body is on the floor
    const b = newBody(0, 200, 200);
    const out: string[] = [];
    for (let i = 0; i <= startsGrounded + 2; i++) out.push(solo(g, b, { ...idle, jump: i === startsGrounded - early }, params).jump);
    return out[startsGrounded];
  }
  it('Normal: A pressed 9 frames before touching down still jumps on landing, 10 does not', () => {
    expect(bufferedJump(9)).toBe('ground');
    expect(bufferedJump(10)).toBe('');
    expect(bufferedJump(1)).toBe('ground');
  });
  it('Easy buffers 12 frames, Hard 8', () => {
    expect(bufferedJump(12, physicsFor('easy'))).toBe('ground');
    expect(bufferedJump(13, physicsFor('easy'))).toBe('');
    expect(bufferedJump(8, physicsFor('hard'))).toBe('ground');
    expect(bufferedJump(9, physicsFor('hard'))).toBe('');
  });
  it('physicsFor reads the difficulty table', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(physicsFor(d)).toEqual({ coyote: DIFFICULTY_PARAMS[d].coyoteBase, buffer: DIFFICULTY_PARAMS[d].bufferFrames, stickyEdges: DIFFICULTY_PARAMS[d].stickyEdges });
    }
  });
});

describe('forgiving corners and edges', () => {
  it('a ceiling corner overlapping 6 px is nudged around, 12 px stops the jump', () => {
    const rows = Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(40) : y === 5 ? '.'.repeat(10) + '#'.repeat(30) : '.'.repeat(40)));
    const g = grid(rows);
    const peak = (overlap: number) => {
      const b = standAt(0, 10 * TILE - PLAYER_W + overlap, g);
      let minY = b.y;
      for (let i = 1; i <= 80; i++) { solo(g, b, { ...idle, jump: i === 1 }); minY = Math.min(minY, b.y); }
      return minY;
    };
    expect(peak(6)).toBeLessThan(6 * TILE - 20); // went up past the block (its underside is y = 288)
    expect(peak(12)).toBe(6 * TILE); // hit the underside and stayed under it
  });
  it('a wall top within 12 px of the feet is stepped up, 14 px is not', () => {
    const rows = Array.from({ length: 12 }, (_, y) => (y >= 7 ? '.'.repeat(10) + '#'.repeat(30) : '.'.repeat(40)));
    const g = grid(rows);
    const run = (below: number) => {
      const b = newBody(0, 10 * TILE - PLAYER_W, 7 * TILE + below - PLAYER_H);
      solo(g, b, { ...idle, move: 1 });
      return b;
    };
    const ok = run(10);
    expect(ok.x).toBeGreaterThan(10 * TILE - PLAYER_W);
    expect(ok.y + PLAYER_H).toBeCloseTo(7 * TILE, 6);
    const no = run(14);
    expect(no.x).toBe(10 * TILE - PLAYER_W);
  });
  it('Easy: walking at 45 % never drops off an edge; Normal falls', () => {
    const g = grid(Array.from({ length: 12 }, (_, y) => (y >= 9 ? '#'.repeat(10) + '.'.repeat(30) : '.'.repeat(40))));
    const walk = (params: PhysicsParams) => {
      const b = standAt(0, 8 * TILE, g);
      for (let i = 0; i < 200; i++) solo(g, b, { ...idle, move: 0.45 }, params);
      return b;
    };
    const easy = walk(physicsFor('easy'));
    expect(easy.grounded).toBe(true);
    expect(easy.x).toBeLessThan(10 * TILE);
    expect(walk(physicsFor('normal')).y).toBeGreaterThan(FLOOR_Y); // fell into the void
    // at full speed even Easy goes over the edge
    const b = standAt(0, 8 * TILE, g);
    for (let i = 0; i < 80; i++) solo(g, b, { ...idle, move: 1 }, physicsFor('easy'));
    expect(b.y).toBeGreaterThan(FLOOR_Y);
  });
});

describe('one-way platforms, heads and trampolines', () => {
  const oneway = () => grid(Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(40) : y === 7 ? '.'.repeat(5) + '='.repeat(6) + '.'.repeat(29) : '.'.repeat(40))));
  it('a one-way is crossed going up and landed on from above; down + A drops through it', () => {
    const g = oneway();
    const b = standAt(0, 7 * TILE, g);
    for (let i = 1; i <= 60; i++) solo(g, b, { ...idle, jump: i === 1 });
    expect(b.grounded).toBe(true);
    expect(b.y + PLAYER_H).toBe(7 * TILE);
    const ev = solo(g, b, { move: 0, down: true, jump: true });
    expect(ev.jump).toBe('');
    for (let i = 0; i < 40; i++) solo(g, b, idle);
    expect(b.y + PLAYER_H).toBe(FLOOR_Y);
  });
  it('down + A on solid ground is a normal jump', () => {
    const g = flat();
    const b = standAt(0, 200, g);
    expect(solo(g, b, { move: 0, down: true, jump: true }).jump).toBe('ground');
  });
  it('a trampoline launches at 1.45 * v0 on touchdown', () => {
    const g = grid(Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(10) + 'T' + '#'.repeat(29) : '.'.repeat(40))));
    const b = newBody(0, 10 * TILE + 7, 6 * TILE);
    let ev = solo(g, b, idle);
    for (let i = 0; i < 100 && ev.jump !== 'trampoline'; i++) ev = solo(g, b, idle);
    expect(ev.jump).toBe('trampoline');
    expect(b.vy).toBeCloseTo(-JUMP_V0 * TRAMPOLINE_MULT, 6);
    expect(b.grounded).toBe(false);
  });
  it('players cross each other sideways', () => {
    const g = flat();
    const a = standAt(0, 100, g), c = standAt(1, 400, g);
    const bodies = [a, c];
    for (let i = 0; i < 120; i++) stepPlayers(bodies, [{ ...idle, move: 1 }, { ...idle, move: -1 }], g, NORMAL);
    expect(a.x).toBeGreaterThan(c.x);
    expect(a.grounded && c.grounded).toBe(true);
  });
  it('a head is a platform: land on it from the floor, be carried by it, drop off with down + A', () => {
    const g = flat();
    const base = standAt(0, 300, g);
    const rider = standAt(1, 260, g);
    const bodies = [base, rider];
    // rider runs right and jumps onto the base's head
    let onHead = false;
    for (let i = 0; i < 120 && !onHead; i++) {
      stepPlayers(bodies, [idle, { move: i < 8 ? 1 : 0, down: false, jump: i === 4 }], g, NORMAL);
      onHead = rider.supportId === 0;
    }
    expect(onHead).toBe(true);
    expect(rider.y + PLAYER_H).toBeCloseTo(base.y, 6);
    // the base walks away: the rider stays on top
    const gap0 = rider.x - base.x;
    for (let i = 0; i < 60; i++) stepPlayers(bodies, [{ ...idle, move: 1 }, idle], g, NORMAL);
    expect(base.x).toBeGreaterThan(300 + 100);
    expect(rider.supportId).toBe(0);
    expect(Math.abs(rider.x - base.x - gap0)).toBeLessThan(6);
    expect(rider.y + PLAYER_H).toBeCloseTo(base.y, 6);
    // down + A on a head falls to the floor
    stepPlayers(bodies, [idle, { move: 0, down: true, jump: true }], g, NORMAL);
    for (let i = 0; i < 40; i++) stepPlayers(bodies, [idle, idle], g, NORMAL);
    expect(rider.y + PLAYER_H).toBe(FLOOR_Y);
  });
});

describe('determinism', () => {
  it('3600 steps of seeded random input give the same hash, and another seed another hash', () => {
    const grid1 = buildGrid(parseLevelStrict(LEVEL_01), 'chain');
    const params = physicsFor('normal');
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      const bodies = [0, 1, 2, 3].map((i) => newBody(i, (3 + i) * TILE, 11 * TILE - PLAYER_H));
      for (let s = 0; s < 3600; s++) {
        const inputs = bodies.map(() => ({ move: [-1, -0.45, 0, 0.45, 1][Math.floor(rng() * 5)]!, down: rng() < 0.1, jump: rng() < 0.08 }));
        stepPlayers(bodies, inputs, grid1, params);
        for (const b of bodies) { if (b.y > 20 * TILE) { b.y = 11 * TILE - PLAYER_H; b.vy = 0; } } // fell in the water: caller respawns
      }
      for (const b of bodies) expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true);
      return hashBodies(bodies);
    };
    expect(run(7)).toBe(run(7));
    expect(run(8)).not.toBe(run(7));
  });
});
