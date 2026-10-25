// The measuring bot itself: deterministic, and sensitive to what it is meant to measure (a chef on Ayudante lands more presses than a plain one).
import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, isFloor } from '../maps';
import { addPlayer, createGame, tick } from '../overcooked';
import { ACTIONS, HUMAN, runGame, stationsFor, type Sim } from './human-bot';

const sim: Sim = { createGame, addPlayer, tick, isFloor, maps: FIXED_MAPS.slice(0, 4) };
async function rate(opts: Record<string, unknown>, reps = 3) {
  let n = 0,
    first = 0,
    hit = 0,
    k = 1;
  for (let mi = 0; mi < sim.maps.length; mi++) {
    const probe = createGame({ mapId: sim.maps[mi]!.id, rows: sim.maps[mi]!.rows, spawns: sim.maps[mi]!.spawns });
    for (const a of ACTIONS)
      for (const station of stationsFor(probe, a).slice(0, 2))
        for (let r = 0; r < reps; r++) {
          const [res] = await runGame(sim, mi, [{ action: a, station }], k++, opts);
          n++;
          first += res!.first ? 1 : 0;
          hit += res!.hit ? 1 : 0;
        }
  }
  return { n, first: first / n, hit: hit / n };
}

describe('human bot', () => {
  it('is deterministic: the same seeds give the same records', async () => {
    const a = await runGame(sim, 1, [{ action: 'take', station: stationsFor(createGame({ rows: sim.maps[1]!.rows }), 'take')[0]! }], 5);
    const b = await runGame(sim, 1, [{ action: 'take', station: stationsFor(createGame({ rows: sim.maps[1]!.rows }), 'take')[0]! }], 5);
    expect(a).toEqual(b);
  });
  it('is imperfect on a plain chef (first press well below 90%) and better with Ayudante', async () => {
    const plain = await rate({ difficulty: 'normal' });
    const assist = await rate({ difficulty: 'normal', assist: [1] });
    expect(plain.n).toBeGreaterThan(100);
    expect(plain.first).toBeLessThan(0.8);
    expect(assist.first).toBeGreaterThan(plain.first + 0.1);
  });
  it('a perfect human (no error, no latency, no noise) lands almost every press: the bot measures the sim, not itself', async () => {
    const saved = { ...HUMAN };
    Object.assign(HUMAN, { aimErrDeg: 0, noiseDeg: 0, latMs: [0, 0] as const });
    try {
      expect((await rate({ difficulty: 'easy' })).hit).toBeGreaterThan(0.8);
    } finally {
      Object.assign(HUMAN, saved);
    }
  });
});
