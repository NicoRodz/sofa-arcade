import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core/rng';
import { ROPE_LEN, ROPE_MAX_CORRECTION, ROPE_RELINK_SEC, TILE } from '../constants';
import { newBody } from './player';
import { buildRopes, cordadaSizes, hangingOnRope, solveRopes, type RopeNode } from './rope';
import { buildGrid } from './tiles';
import { parseLevelStrict } from '../parse';
import { hall, inp, level, pl, put, run, teleport, world } from './testkit';
import { hashState, setConnected } from './world';
import { of } from './testkit';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('cordadas (plan §4)', () => {
  it('splits 1..8 players as 1,2,3,4 | 3+2 | 3+3 | 4+3 | 4+4', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => cordadaSizes(n))).toEqual([[1], [2], [3], [4], [3, 2], [3, 3], [4, 3], [4, 4]]);
  });
  it('cordadaMax forces smaller groups, larger ones first', () => {
    expect(cordadaSizes(5, 2)).toEqual([2, 2, 1]);
    expect(cordadaSizes(8, 3)).toEqual([3, 3, 2]);
    expect(cordadaSizes(4, 2)).toEqual([2, 2]);
  });
  it('buildRopes links consecutive slots of each cordada in slot order, whatever order the slots come in', () => {
    const r = buildRopes([6, 1, 3, 0, 2, 5], undefined);
    expect(r.map((x) => x.members)).toEqual([
      [0, 1, 2],
      [3, 5, 6],
    ]);
    expect(r[0]!.links.map((l) => [l.a, l.b])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
  it('a free-mode world has no ropes; a chain world has them', () => {
    expect(world(level(hall()), { mode: 'free' }).ropes).toHaveLength(0);
    expect(world(level(hall()), { mode: 'chain' }).ropes).toHaveLength(1);
    expect(world(level(hall(), { tether: 'freeOnly' }), { mode: 'chain' }).ropes).toHaveLength(0);
    expect(world(level(hall(), { tether: 'chainOnly' }), { mode: 'free' }).ropes).toHaveLength(1);
  });
});

describe('rope invariants', () => {
  const randomWalk = (seed: number) => {
    const rng = mulberry32(seed);
    const dir = Array<number>(8).fill(0),
      until = Array<number>(8).fill(0);
    return (s: number, t: number) => {
      if (t >= until[s]!) {
        dir[s] = [-1, 0, 1][Math.floor(rng() * 3)]!;
        until[s] = t + 20 + Math.floor(rng() * 60);
      }
      return inp({ move: dir[s]!, jump: rng() < 0.03, down: rng() < 0.05 });
    };
  };
  it('8 players, 3600 steps of random input: no link ever exceeds 1.05 L and nothing explodes', () => {
    const w = world(level(hall(80, 16)), { slots: [0, 1, 2, 3, 4, 5, 6, 7] });
    let maxT = 0,
      maxV = 0,
      links = 0;
    run(w, 3600, randomWalk(7), () => {
      for (const r of w.ropes)
        for (const l of r.links) {
          maxT = Math.max(maxT, dist(pl(w, l.a).body, pl(w, l.b).body) / ROPE_LEN);
          links++;
        }
      for (const p of w.players) {
        expect(Number.isFinite(p.body.x + p.body.y + p.body.vx + p.body.vy)).toBe(true);
        maxV = Math.max(maxV, Math.abs(p.body.vx), Math.abs(p.body.vy));
        expect(p.body.x).toBeGreaterThan(0);
        expect(p.body.x).toBeLessThan(80 * TILE);
      }
    });
    expect(links).toBe(3600 * 6); // two cordadas of 4: 3 links each, all of them active all the time
    expect(maxT).toBeLessThanOrEqual(1.05);
    expect(maxT).toBeGreaterThan(0.95); // the rope really did get taut: the bound above is not vacuous
    expect(maxV).toBeLessThan(1500);
  });
  it('a chain of 4 dragged by its tail end stays inside 1.05 L per link', () => {
    const w = world(level(hall(80, 16)), { slots: [0, 1, 2, 3] });
    let maxT = 0;
    run(
      w,
      600,
      (s) => (s === 3 ? inp({ move: 1 }) : inp({ move: 0 })),
      () => {
        for (const l of w.ropes[0]!.links) maxT = Math.max(maxT, dist(pl(w, l.a).body, pl(w, l.b).body) / ROPE_LEN);
      },
    );
    expect(maxT).toBeLessThanOrEqual(1.05);
    expect(pl(w, 0).body.x).toBeGreaterThan(pl(w, 0).body.x - 1); // sanity: finite
    expect(pl(w, 3).body.x - pl(w, 0).body.x).toBeLessThanOrEqual(3 * ROPE_LEN * 1.05);
  });
});

describe('unilateral link', () => {
  it('a slack rope moves nobody: two players closer than L keep their positions exactly', () => {
    const w = world(level(hall()), { slots: [0, 1] });
    teleport(w, 0, 10, 11);
    teleport(w, 1, 12, 11);
    run(w, 5);
    const x0 = [pl(w, 0).body.x, pl(w, 1).body.x];
    run(w, 30);
    expect([pl(w, 0).body.x, pl(w, 1).body.x]).toEqual(x0);
  });
  it('a rope never pushes: walking toward each other, nobody is shoved away', () => {
    const w = world(level(hall()), { slots: [0, 1] });
    teleport(w, 0, 10, 11);
    teleport(w, 1, 14, 11);
    run(w, 5);
    const gap0 = pl(w, 1).body.x - pl(w, 0).body.x;
    run(w, 30, (s) => inp({ move: s === 0 ? 1 : -1 }));
    expect(pl(w, 1).body.x - pl(w, 0).body.x).toBeLessThan(gap0 - 100);
  });
  it('pulls the far one back: a runner stopped at L, the other ends at the end of the rope', () => {
    const w = world(level(hall()), { slots: [0, 1] });
    teleport(w, 0, 10, 11);
    teleport(w, 1, 11, 11);
    run(w, 200, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    const d = dist(pl(w, 0).body, pl(w, 1).body);
    expect(d).toBeGreaterThan(ROPE_LEN * 0.9);
    expect(d).toBeLessThanOrEqual(ROPE_LEN * 1.05);
    expect(pl(w, 0).body.x).toBeGreaterThan(10 * TILE + 40); // the idle one was dragged along
  });
});

describe('inverse masses (ground 1/3, air 1, planted 1/8, anchored 0)', () => {
  const pullTest = (plantFirst: boolean) => {
    const w = world(level(hall()), { slots: [0, 1] });
    teleport(w, 0, 10, 11);
    teleport(w, 1, 12, 11);
    run(w, 5);
    if (plantFirst) run(w, 1, (s) => (s === 0 ? inp({ grab: true }) : undefined));
    const x0 = pl(w, 0).body.x;
    run(w, 120, (s) => (s === 1 ? inp({ move: 1 }) : undefined));
    return { dragged: pl(w, 0).body.x - x0, planted: pl(w, 0).planted };
  };
  it('a planted player is dragged much less than a standing one (1/8 against 1/3)', () => {
    const free = pullTest(false),
      planted = pullTest(true);
    expect(planted.planted).toBe(true);
    expect(planted.dragged).toBeLessThan(free.dragged * 0.5);
    expect(free.dragged).toBeGreaterThan(100);
  });
  it('an anchored player does not move at all and the rope stops the other at L', () => {
    const rows = hall(60, 14, { 5: put(hall(60, 14)[5]!, 10, 'o') });
    const w = world(level(rows), { slots: [0, 1] });
    teleport(w, 0, 10, 6);
    teleport(w, 1, 9, 11);
    run(w, 1, (s) => (s === 0 ? inp({ grab: true }) : undefined));
    expect(pl(w, 0).holding?.kind).toBe('ring');
    const a = { x: pl(w, 0).body.x, y: pl(w, 0).body.y };
    run(w, 200, (s) => (s === 1 ? inp({ move: -1 }) : undefined));
    expect({ x: pl(w, 0).body.x, y: pl(w, 0).body.y }).toEqual(a);
    expect(dist(pl(w, 0).body, pl(w, 1).body)).toBeLessThanOrEqual(ROPE_LEN * 1.05);
  });
  it('the correction of one iteration is capped at 24 px', () => {
    const g = buildGrid(parseLevelStrict(level(hall())), 'chain');
    const A = newBody(0, 100, 100),
      B = newBody(1, 100 + 600, 100);
    const nodes: RopeNode[] = [
      { body: A, w: 1, active: true },
      { body: B, w: 1, active: true },
    ];
    const rope = buildRopes([0, 1], undefined);
    solveRopes(rope, nodes, g, () => 0);
    const moved = Math.abs(A.x - 100) + Math.abs(B.x - 700);
    expect(moved).toBeLessThanOrEqual(4 * ROPE_MAX_CORRECTION + 1e-6); // four iterations
    expect(moved).toBeGreaterThan(3 * ROPE_MAX_CORRECTION); // and it does use them
  });
});

describe('rope jump, relink and valve', () => {
  it('hanging below a taut rope: one extra jump at 0.8 v0, not two', () => {
    const base = hall(60, 14);
    const rows = base.map((r, y) => (y === 7 ? put(r, 5, '#####') : r));
    const w = world(level(rows), { slots: [0, 1] });
    teleport(w, 0, 9, 6); // stands on the shelf (row 7 is solid)
    teleport(w, 1, 11, 7); // beside it, in the air
    pl(w, 1).body.air = 255;
    let n = 0;
    while (!w.ropes[0]!.links[0]!.taut && n++ < 80) run(w, 1);
    expect(w.ropes[0]!.links[0]!.taut).toBe(true);
    expect(pl(w, 1).body.grounded).toBe(false);
    expect(pl(w, 1).body.y).toBeGreaterThan(pl(w, 0).body.y + 100); // it hangs well below
    const ev1 = run(w, 1, (s) => (s === 1 ? inp({ jump: true }) : undefined));
    expect(of(ev1, 'obst.jump').filter((j) => j.kind === 'rope')).toEqual([{ player: 1, kind: 'rope' }]);
    expect(pl(w, 1).body.vy).toBeLessThan(-0.5 * 911); // 0.8 v0 minus the rope and one step of gravity
    const ev2 = run(w, 8, (s) => (s === 1 ? inp({ jump: true }) : undefined));
    expect(of(ev2, 'obst.jump').filter((j) => j.kind === 'rope')).toHaveLength(0); // the second press has nothing to use
  });
  it('hangingOnRope: true only for the lower end of a taut link, airborne', () => {
    const w = world(level(hall()), { slots: [0, 1] });
    const bodies = [pl(w, 0).body, pl(w, 1).body];
    bodies[0]!.y = 100;
    bodies[1]!.y = 100 + 150;
    bodies[0]!.x = bodies[1]!.x;
    w.ropes[0]!.links[0]!.active = true;
    w.ropes[0]!.links[0]!.taut = true;
    expect(hangingOnRope(w.ropes, 1, bodies)).toBe(true);
    expect(hangingOnRope(w.ropes, 0, bodies)).toBe(false);
    w.ropes[0]!.links[0]!.taut = false;
    expect(hangingOnRope(w.ropes, 1, bodies)).toBe(false);
  });
  it('when a middle player leaves, the neighbours hook up and the new link eases to L in 0.5 s', () => {
    const w = world(level(hall(80, 16)), { slots: [0, 1, 2] });
    teleport(w, 0, 10, 13);
    teleport(w, 1, 12, 13);
    teleport(w, 2, 20, 13);
    run(w, 3);
    setConnected(w, 1, false);
    const link = w.ropes[0]!.links[0]!;
    expect([link.a, link.b]).toEqual([0, 2]);
    const start = link.len;
    expect(start).toBeGreaterThan(ROPE_LEN * 1.4); // they were 8 tiles apart
    run(w, 15);
    expect(w.ropes[0]!.links[0]!.len).toBeLessThan(start);
    expect(w.ropes[0]!.links[0]!.len).toBeGreaterThan(ROPE_LEN);
    run(w, Math.round(ROPE_RELINK_SEC * 60) - 14);
    expect(w.ropes[0]!.links[0]!.len).toBe(ROPE_LEN);
  });
  it('valve: a link held beyond 1.6 L for 1 s sends the one behind to a bubble (reason rope)', () => {
    // a 6-tile wall between them: the rope cannot pull through it
    const rows = hall(60, 14).map((r, y) => (y < 12 ? put(r, 20, '######') : r));
    const w = world(level(rows), { slots: [0, 1] });
    teleport(w, 0, 19, 11);
    teleport(w, 1, 26, 11);
    const ev = run(w, 120);
    const b = of(ev, 'obst.bubble');
    expect(b).toHaveLength(1);
    expect(b[0]!.reason).toBe('rope');
    expect(b[0]!.player).toBe(0); // slot 0 is farther from the goal (the goal is at the right)
    expect(run(w, 1).length).toBeGreaterThanOrEqual(0);
  });
  it('same inputs, same hash: the rope is deterministic', () => {
    const mk = () => {
      const w = world(level(hall(80, 16)), { slots: [0, 1, 2, 3, 4] });
      run(w, 600, (s, t) => inp({ move: Math.sin((t + s * 17) / 40) > 0 ? 1 : -1, jump: (t + s * 7) % 50 === 0 }));
      return hashState(w);
    };
    expect(mk()).toBe(mk());
  });
});
