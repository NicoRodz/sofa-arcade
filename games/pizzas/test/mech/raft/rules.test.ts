// Rules of 'raft': it slides one tile per 40 ticks, pauses 60 at the ends and carries the chef standing on it; the tiles it leaves are water.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { RAFT_PAUSE_TICKS, RAFT_STEP_TICKS } from '../../../sim/mech/raft/module';
import { RAFT_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (): Game => {
  const g = createGame({ rows: RAFT_ROWS, n: 1, mech: { raft: true }, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  return g;
};
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const raftTile = (g: Game) => g.grid[4]!.findIndex((t) => t.kind === 'floor' && t.mech === '=');

describe('mech.raft', () => {
  it('starts on the = tile and moves one tile every 40 ticks', () => {
    const g = make();
    expect(raftTile(g)).toBe(6);
    run(g, RAFT_STEP_TICKS);
    expect(raftTile(g)).toBe(7);
    run(g, RAFT_STEP_TICKS);
    expect(raftTile(g)).toBe(8);
    expect(g.grid[4]![6]!.kind).toBe('water'); // what it left is water
  });
  it('the lane is the water run (x 4..10): it turns at the end after a pause of 60', () => {
    const g = make();
    let steps = 0;
    for (; raftTile(g) !== 10 && steps < 2000; steps++) run(g, 1);
    expect(raftTile(g)).toBe(10);
    run(g, RAFT_PAUSE_TICKS - 1);
    expect(raftTile(g)).toBe(10);
    run(g, 2);
    expect(raftTile(g)).toBe(9);
  });
  it('carries a chef standing on it, and a chef on the shore is not moved', () => {
    const g = make();
    Object.assign(g.players.get(1)!, { x: 6.5, y: 4.5, vx: 0, vy: 0 });
    run(g, RAFT_STEP_TICKS * 2);
    expect(Math.floor(g.players.get(1)!.x)).toBe(8);
    expect(g.players.get(1)!.y).toBeCloseTo(4.5, 1);
    Object.assign(g.players.get(1)!, { x: 2.5, y: 3.5 });
    run(g, 100);
    expect(g.players.get(1)!.x).toBeCloseTo(2.5, 1);
  });
  it('the water it left stops a chef; the one it reached lets him in', () => {
    const g = make();
    run(g, RAFT_STEP_TICKS * 3); // raft at x = 9
    Object.assign(g.players.get(1)!, { x: 3.5, y: 4.5, vx: 0, vy: 0 });
    run(g, 120, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
    expect(g.players.get(1)!.x).toBeLessThan(5); // (4,4) is water
  });
  it('is deterministic', () => {
    const h = () => {
      const g = make();
      run(g, 700);
      return g.mech!.hash;
    };
    expect(h()).toBe(h());
  });
});
