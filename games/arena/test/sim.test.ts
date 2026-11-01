import { describe, expect, it } from 'vitest';
import {
  DASH_SPEED,
  FIGHTER_R,
  MATCH_MS,
  NO_INPUT,
  PUSH_CD_MS,
  PUSH_RANGE,
  PUSH_SPEED,
  RING_MIN,
  RING_R0,
  SHRINK_AFTER_MS,
  createArena,
  step,
  type ArenaInput,
  type ArenaState,
} from '../sim';

const DT = 1000 / 60;
const inp = (over: Partial<ArenaInput>): ArenaInput => ({ ...NO_INPUT, ...over });
const run = (s: ArenaState, ms: number, inputs: Record<number, ArenaInput> = {}) => {
  const m = new Map(Object.entries(inputs).map(([k, v]) => [Number(k), v]));
  for (let t = 0; t < ms && !s.over; t += DT) step(s, m, DT);
};
/** Two fighters facing each other at a given distance, centred on the platform and at rest. */
const duel = (gap: number): ArenaState => {
  const s = createArena([0, 1], 7);
  s.fighters[0]!.x = -gap / 2;
  s.fighters[1]!.x = gap / 2;
  for (const f of s.fighters) f.y = f.vx = f.vy = 0;
  return s;
};

describe('arena sim', () => {
  it('starts every fighter on the platform, spread out, and the seed only rotates the start', () => {
    const a = createArena([0, 1, 2, 3], 1);
    expect(a.fighters.map((f) => f.slot)).toEqual([0, 1, 2, 3]);
    for (const f of a.fighters) expect(Math.hypot(f.x, f.y)).toBeCloseTo(RING_R0 / 2, 6);
    expect(createArena([0, 1, 2, 3], 1)).toEqual(a);
    expect(createArena([0, 1, 2, 3], 2).fighters[0]!.x).not.toBe(a.fighters[0]!.x);
  });

  it('is deterministic: the same inputs give the same round, byte for byte', () => {
    const play = () => {
      const s = createArena([0, 1, 2], 42);
      for (let i = 0; i < 600; i++)
        step(
          s,
          new Map([
            [0, inp({ x: Math.cos(i / 20), y: Math.sin(i / 20), push: i % 50 === 0, dash: i % 170 === 0 })],
            [1, inp({ x: -1 })],
          ]),
          DT,
        );
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it('the stick accelerates the fighter its way, and it faces where it goes', () => {
    const s = duel(400);
    run(s, 500, { 0: inp({ y: 1 }) });
    const f = s.fighters[0]!;
    expect(f.y).toBeGreaterThan(40);
    expect(Math.abs(f.x + 200)).toBeLessThan(1); // no sideways drift
    expect(f.fy).toBe(1);
    expect(s.fighters[1]!.y).toBe(0); // the other did not move
  });

  it('a push throws a fighter in range away from the pusher, and one out of range does not feel it', () => {
    const near = duel(PUSH_RANGE - 5);
    step(near, new Map([[0, inp({ push: true })]]), DT);
    expect(near.fighters[1]!.vx).toBeGreaterThan(PUSH_SPEED * 0.9);
    expect(near.fighters[0]!.vx).toBeLessThanOrEqual(0); // the pusher is not thrown
    const far = duel(PUSH_RANGE + 40);
    step(far, new Map([[0, inp({ push: true })]]), DT);
    expect(far.fighters[1]!.vx).toBe(0);
  });

  it('a push has a cooldown: a second one right after does nothing', () => {
    const s = duel(60); // close enough that the thrown one is still in range on the next step
    const push = new Map([[0, inp({ push: true })]]);
    step(s, push, DT);
    const v = s.fighters[1]!.vx;
    step(s, push, DT);
    expect(s.fighters[1]!.vx).toBeLessThan(v); // only drag acted
    run(s, PUSH_CD_MS + 50);
    expect(s.fighters[0]!.pushCd).toBe(0);
  });

  it('a dash goes where the fighter looks, even with the stick at rest', () => {
    const s = duel(600);
    s.fighters[0]!.fx = 1;
    s.fighters[0]!.fy = 0;
    step(s, new Map([[0, inp({ dash: true })]]), DT);
    const f = s.fighters[0]!;
    expect(f.vx / DASH_SPEED).toBeGreaterThan(0.9);
    expect(f.fx).toBeGreaterThan(0);
  });

  it('whoever crosses the edge is out, and the last one standing wins', () => {
    const s = duel(200);
    s.fighters[1]!.x = RING_R0 - 1;
    s.fighters[1]!.vx = 400;
    run(s, 200);
    expect(s.fighters[1]!.alive).toBe(false);
    expect(s.fighters[1]!.fellAt).not.toBeNull();
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('two bodies do not overlap: a runner into a rock stops and shoves it', () => {
    const s = duel(FIGHTER_R * 2 + 30);
    run(s, 600, { 0: inp({ x: 1 }) });
    const [a, b] = s.fighters as [(typeof s.fighters)[0], (typeof s.fighters)[0]];
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(FIGHTER_R * 2 - 0.5);
    expect(b.x).toBeGreaterThan(30 + FIGHTER_R); // moved by the hit
  });

  it('the platform holds, then shrinks down to a minimum', () => {
    const s = duel(100);
    run(s, SHRINK_AFTER_MS - 100);
    expect(s.ringR).toBe(RING_R0);
    run(s, 40_000);
    expect(s.ringR).toBeLessThan(RING_R0);
    expect(s.ringR).toBeGreaterThanOrEqual(RING_MIN);
  });

  it('at the time limit the fighter closest to the centre wins; falling together is a draw', () => {
    const s = duel(200);
    s.fighters[0]!.x = -150;
    s.fighters[1]!.x = 40;
    s.t = MATCH_MS - 1;
    step(s, new Map(), DT);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(1);
    const d = duel(200);
    d.fighters[0]!.x = RING_R0 + 5; // opposite edges: nobody is near enough to bump the other back in
    d.fighters[1]!.x = -(RING_R0 + 5);
    step(d, new Map(), DT);
    expect(d.over).toBe(true);
    expect(d.winner).toBeNull();
  });

  it('a finished round no longer changes', () => {
    const s = duel(100);
    s.fighters[1]!.x = RING_R0 + 10;
    step(s, new Map(), DT);
    const frozen = JSON.stringify(s);
    step(s, new Map([[0, inp({ x: 1 })]]), DT);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
