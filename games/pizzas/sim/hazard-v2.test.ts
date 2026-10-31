// HAZARD_V2 (tanda 1): the big fire needs two chefs at once, the rat dodges a dash it saw coming, the ice brakes slower than it accelerates, the calendar has several events.
import { describe, expect, it } from 'vitest';
import { TICK_MS, addPlayer, createGame, tick, type Game, type Station } from './overcooked';
import { fixedMap, isFloor } from './maps';
import { versusMap } from './versus/maps';
import { douse } from './burn';
import { fireIsBig, hash32 } from './hazard-v2';
import { planEvents } from './events-v2';
import type { Rat } from './midround';

const bigSeed = (want: boolean, chefs = 2) => {
  for (let s = 1; s < 500; s++) if (fireIsBig(s, 0, 'normal', chefs, true) === want) return s;
  throw new Error('no seed');
};
function fireGame(seed: number) {
  const g = createGame({
    rows: fixedMap('11')!.rows,
    mapId: '11',
    n: 2,
    seed,
    eventsSeed: seed,
    difficulty: 'normal',
    burn: true,
    fire: true,
    countdownMs: 0,
  });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  addPlayer(g, 3, 2);
  const oven = g.stations.find((s) => s.kind === 'pot')!;
  Object.assign(oven, { done: true, burnt: true, readyAt: -60_000 });
  for (let i = 0; i < 3; i++) tick(g, new Map());
  return { g, oven };
}
// Holds Picar with `n` chefs in front of the station for `ms`; returns the ms until it was out (Infinity when not).
function holdFor(g: Game, s: Station, n: number, ms: number) {
  for (let t = 0; t < ms; t += TICK_MS) {
    for (let id = 1; id <= n; id++) douse(g, id, s, TICK_MS);
    tick(g, new Map());
    if (s.fire === undefined) return t + TICK_MS;
  }
  return Infinity;
}

describe('fire: big (needs two chefs at once) and small (cap of two)', () => {
  it('a big fire with one chef for 20 s keeps burning: the chef contains it (no jump) but does not put it out', () => {
    const { g, oven } = fireGame(bigSeed(true));
    expect(g.burn!.fires[0]!.big).toBe(true);
    expect(holdFor(g, oven, 1, 20_000)).toBe(Infinity);
    expect(oven.fire).toBe(0);
    expect(g.burn!.fires[0]!.rings).toBe(0);
  });
  it('with two chefs it is out in about 4 s (8 chef-seconds); with three, not faster than 2.7 s, and four add no more than three', () => {
    for (const [n, lo, hi] of [
      [2, 3.9, 4.2],
      [3, 2.6, 2.9],
      [4, 2.6, 2.9],
    ] as const) {
      const { g, oven } = fireGame(bigSeed(true));
      const t = holdFor(g, oven, n, 10_000) / 1000;
      expect(t, `${n} chefs`).toBeGreaterThan(lo);
      expect(t, `${n} chefs`).toBeLessThan(hi);
    }
  });
  it('a small fire: 4 chef-seconds, and at most two chefs add up (a third one changes nothing)', () => {
    const t = (n: number) =>
      holdFor(
        ...(Object.values(fireGame(bigSeed(false)))
          .reverse()
          .reverse() as [Game, Station]),
        n,
        10_000,
      ) / 1000;
    expect(t(1)).toBeGreaterThan(3.9);
    expect(t(1)).toBeLessThan(4.2);
    expect(t(2)).toBeLessThan(2.2);
    expect(t(3)).toBeCloseTo(t(2), 1);
  });
  it('the size is a pure function of (seed, k): no stream is consumed, and the same in both kitchens of a versus match', () => {
    expect(hash32(7, 1, 2)).toBe(hash32(7, 1, 2));
    const m = versusMap('V1')!;
    const g = createGame({
      mapId: m.id,
      rows: m.rows,
      spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]],
      difficulty: 'normal',
      teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }],
      sabotage: 'chaos',
      sigma: m.versus.sigma,
      burn: true,
      fire: true,
      seed: 9,
      countdownMs: 0,
    });
    for (let id = 1; id <= 4; id++) addPlayer(g, id, id - 1);
    const sizes: boolean[][] = [[], []];
    for (let n = 0; n < 6; n++)
      for (const k of [0, 1]) {
        const pot = g.stations.find((s) => s.kind === 'pot' && s.owner === k)!;
        Object.assign(pot, { done: true, burnt: true, readyAt: g.time - 60_000 });
        for (let i = 0; i < 3 && g.burn!.fires[k] === null; i++) tick(g, new Map());
        sizes[k]!.push(!!g.burn!.fires[k]!.big);
        for (let t = 0; t < 40_000 && g.burn!.fires[k]; t += TICK_MS) {
          for (const s of g.stations)
            if (s.fire !== undefined && (s.owner ?? 0) === k) for (const id of [1 + 2 * k, 2 + 2 * k]) douse(g, id, s, TICK_MS);
          tick(g, new Map());
        }
        expect(g.burn!.fires[k]).toBeNull();
      }
    expect(sizes[0]).toEqual(sizes[1]);
  });
});

describe('rat: dodge of a dash, then it pants', () => {
  function setup(dodgeCd: number) {
    const m = fixedMap('1')!;
    const g = createGame({
      mapId: m.id,
      rows: m.rows,
      spawns: m.spawns,
      n: 2,
      seed: 3,
      countdownMs: 0,
      events: true,
      magnet: true,
      difficulty: 'normal',
    });
    addPlayer(g, 1, 0);
    let spot: [number, number] | null = null;
    g.grid.forEach((row, y) =>
      row.forEach((_t, x) => {
        if (!spot && [-3, -2, -1, 0, 1].every((d) => isFloor(g.grid, x + d, y)) && [-2, -1, 1, 2].every((d) => isFloor(g.grid, x, y + d)))
          spot = [x, y];
      }),
    );
    const [x, y] = spot!;
    const rat: Rat = {
      x: x + 0.5,
      y: y + 0.5,
      state: 'seek',
      item: null,
      from: -1,
      hole: [x, y],
      scared: false,
      idleMs: 0,
      born: g.time,
      dodgeCd,
    };
    Object.assign(g.mid!, { kind: 'rat', phase: 'active', endAt: Infinity, startAt: 0, announceAt: 0, rat });
    const p = g.players.get(1)!;
    Object.assign(p, { x: x - 1.5 + 0.5, y: y + 0.5, vx: 0, vy: 0, dashMs: 180, dashDx: 1, dashDy: 0, fx: 1, fy: 0 });
    return { g, rat, p };
  }
  it('a dash aimed at it with the dodge ready is dodged: the rat jumps 1.2 tiles aside, is not scared, then pants at half speed', () => {
    const { g, rat } = setup(0);
    const seen: string[] = [];
    g.bus.on('rat:dodge', () => seen.push('dodge'));
    g.bus.on('rat:scared', () => seen.push('scared'));
    for (let i = 0; i < 20; i++) tick(g, new Map());
    expect(seen).toEqual(['dodge']);
    expect(rat.scared).toBe(false);
    expect(Math.abs(rat.y - rat.dodgeFrom![1]) + Math.abs(rat.x - rat.dodgeFrom![0])).toBeGreaterThan(1);
    expect(rat.dodgeCd).toBeGreaterThan(0);
  });
  it('with the dodge on cooldown the same dash scares it; and a dash inside the panting window catches it', () => {
    const a = setup(5000);
    let scared = false;
    a.g.bus.on('rat:scared', () => (scared = true));
    for (let i = 0; i < 20; i++) tick(a.g, new Map());
    expect(scared).toBe(true);
    const b = setup(0);
    for (let i = 0; i < 26; i++) tick(b.g, new Map()); // dodged, now panting
    expect(b.rat.pantMs ?? 0).toBeGreaterThan(0);
    let caught = false;
    b.g.bus.on('rat:scared', () => (caught = true));
    Object.assign(b.g.players.get(1)!, { x: b.rat.x - 0.6, y: b.rat.y, vx: 0, vy: 0, dashMs: 180, dashDx: 1, dashDy: 0 });
    for (let i = 0; i < 10; i++) tick(b.g, new Map());
    expect(caught).toBe(true);
  });
  it('while it pants it walks at half its speed (the distance in the same ticks)', () => {
    const run = (pantMs: number) => {
      const { g, rat, p } = setup(5000);
      Object.assign(p, { dashMs: 0, x: 1.5, y: 1.5 }); // the chef is out of the way and not dashing
      Object.assign(rat, { pantMs, state: 'flee', born: g.time - 60_000, hole: [Math.floor(rat.x) - 3, Math.floor(rat.y)] }); // it walks towards a hole three tiles away
      const [x0, y0] = [rat.x, rat.y];
      for (let i = 0; i < 12; i++) tick(g, new Map());
      return Math.hypot(rat.x - x0, rat.y - y0);
    };
    const walk = run(0),
      pant = run(5000);
    expect(walk).toBeGreaterThan(0.2);
    expect(pant / walk).toBeGreaterThan(0.4);
    expect(pant / walk).toBeLessThan(0.6);
  });
});

describe('ice: separate taus; the calendar', () => {
  const ROWS = [
    '##C1C2CKCKCOCOC#',
    '#.............↓#',
    'C..iiiiiiiii..↓E',
    'P..iiiiiiiii..↓C',
    'C..S......S.....',
    'C.→→→→→→→→→→→..C',
    'C......S.S.....C',
    '#..............#',
    '##CCCCCCCCCCCC##',
  ];
  const iceGame = () => {
    const g = createGame({ rows: ROWS, surfaces: true, countdownMs: 0, n: 2, difficulty: 'normal' });
    addPlayer(g, 1, 0);
    return g;
  };
  it('on ice the chef takes longer to stop than to start (tau 1300 against 1100 on Normal)', () => {
    const g = iceGame(),
      p = g.players.get(1)!;
    Object.assign(p, { x: 3.5, y: 2.5, vx: 0, vy: 0 });
    const mv = (stick: number, ms: number) => {
      for (let t = 0; t < ms; t += TICK_MS) tick(g, new Map([[1, { x: stick, y: 0, a: 0, b: false }]]));
    };
    mv(1, 1100);
    const v1 = p.vx;
    expect(v1 / 4.5).toBeGreaterThan(0.55);
    expect(v1 / 4.5).toBeLessThan(0.7); // ~63% after one tau (the old fixed 750 ms would give 77%)
    const start = p.vx;
    mv(0, 1300);
    expect(p.vx / start).toBeGreaterThan(0.34); // one stopping tau (1300) leaves ~37%; the accelerating tau (1100) would leave 31%; the old 750 ms 18%
  });
  it('the calendar: Normal 2 events, Hard 3, no kind twice, the gap between events, in windows of the round', () => {
    const pool = ['rush', 'blackout', 'birthday', 'rat', 'frost'] as const;
    for (let seed = 1; seed < 40; seed++) {
      const n = planEvents(seed, 'normal', 180_000, pool, () => 10_000),
        h = planEvents(seed, 'hard', 180_000, pool, () => 10_000);
      expect([n.length, h.length]).toEqual([2, 3]);
      expect(new Set(h.map((e) => e.kind)).size).toBe(3);
      expect(n[0]!.startAt).toBeGreaterThanOrEqual(36_000);
      expect(n[0]!.startAt).toBeLessThanOrEqual(72_000);
      expect(n[1]!.startAt - 3000).toBeGreaterThanOrEqual(n[0]!.startAt + 10_000 + 30_000);
    }
  });
  it('a lobby coop round plays its calendar through: two events start and end', () => {
    const g = createGame({ rows: fixedMap('1')!.rows, mapId: '1', n: 2, seed: 4, events: true, difficulty: 'normal', countdownMs: 0 });
    addPlayer(g, 1, 0);
    const kinds: string[] = [];
    g.bus.on('event:start', (e) => kinds.push(e.kind));
    for (let i = 0; i < 150_000 / TICK_MS && !g.over; i++) tick(g, new Map());
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
