import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core/rng';
import { PLAYER_H, TILE } from '../../constants';
import { LEVEL_01 } from '../../levels';
import { parseLevelStrict } from '../../parse';
import { hashBodies, newBody, physicsFor, stepPlayers, type Body } from './player';
import { buildGrid } from '../world/tiles';

import { NORMAL, idle, grid, solo, flat, standAt } from '../testkit/player-kit';

describe('landing events and surfaces', () => {
  it('land reports the fall speed once, and where: ground, one-way tile or head', () => {
    const g = grid(
      Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(40) : y === 7 ? '='.repeat(4) + '.'.repeat(36) : '.'.repeat(40))),
    );
    const onTile = newBody(0, 1 * TILE, 4 * TILE);
    const evs: { land: number; landOn: string }[] = [];
    for (let i = 0; i < 80; i++) evs.push(solo(g, onTile, idle));
    expect(evs.filter((e) => e.land > 0)).toHaveLength(1);
    expect(evs.find((e) => e.land > 0)!.landOn).toBe('oneWay');
    // a solid tile and a one-way tile at the same height under the feet: solid wins (down + A jumps instead of dropping)
    const mixed = grid(Array.from({ length: 12 }, (_, y) => (y === 9 ? '#'.repeat(5) + '='.repeat(5) + '.'.repeat(30) : '.'.repeat(40))));
    const m = newBody(1, 5 * TILE - 17, 9 * TILE - PLAYER_H);
    for (let i = 0; i < 3; i++) solo(mixed, m, idle);
    expect(m.onOneWay).toBe(false);
    expect(solo(mixed, m, { move: 0, down: true, jump: true }).jump).toBe('ground');
    // on a head
    const base = standAt(2, 600),
      top = newBody(3, 600, 6 * TILE);
    const bodies = [base, top];
    const heads: string[] = [];
    for (let i = 0; i < 60; i++)
      heads.push(
        ...stepPlayers(bodies, [idle, idle], flat(), NORMAL)
          .filter((e) => e.land > 0)
          .map((e) => e.landOn),
      );
    expect(heads).toEqual(['head']);
  });
});

describe('determinism', () => {
  it('hashBodies reacts to every field of every body', () => {
    const base = () => [newBody(0, 100, 200), newBody(1, 300, 200)];
    const h0 = hashBodies(base());
    expect(hashBodies(base())).toBe(h0);
    const fields: [keyof Body, number][] = [
      ['id', 5],
      ['x', 1],
      ['y', 1],
      ['vx', 1],
      ['vy', 1],
      ['grounded', 1],
      ['supportId', 3],
      ['air', 3],
      ['jumpAge', 3],
      ['dropFrames', 3],
      ['facing', -1],
    ];
    for (const [f, v] of fields) {
      const bs = base();
      (bs[1]![f] as number | boolean) = typeof bs[1]![f] === 'boolean' ? true : f === 'facing' ? v : (bs[1]![f] as number) + v;
      expect(hashBodies(bs), String(f)).not.toBe(h0);
    }
  });
  it('3600 steps of seeded random input give the same hash, and another seed another hash', () => {
    const grid1 = buildGrid(parseLevelStrict(LEVEL_01), 'chain');
    const params = physicsFor('normal');
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      const bodies = [0, 1, 2, 3].map((i) => newBody(i, (3 + i) * TILE, 11 * TILE - PLAYER_H));
      for (let s = 0; s < 3600; s++) {
        const inputs = bodies.map(() => ({ move: [-1, -0.45, 0, 0.45, 1][Math.floor(rng() * 5)]!, down: rng() < 0.1, jump: rng() < 0.08 }));
        stepPlayers(bodies, inputs, grid1, params);
        for (const b of bodies) {
          if (b.y > 20 * TILE) {
            b.y = 11 * TILE - PLAYER_H;
            b.vy = 0;
          }
        } // fell in the water: caller respawns
      }
      for (const b of bodies) expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true);
      return hashBodies(bodies);
    };
    expect(run(7)).toBe(run(7));
    expect(run(8)).not.toBe(run(7));
  });
});
