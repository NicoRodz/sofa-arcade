// Phase 1 "feel" rules of the overcooked-2 plan: R1 smoothing, R2 dash, R4 soft collision, R5 push, R6 input buffer.
import { describe, expect, it } from 'vitest';
import { SPEED, TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Player } from './overcooked';
import { TUNING, type Difficulty } from '@pichi/core/difficulty';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export const step = (g: Game, c: Record<number, Partial<Controls>> = {}) =>
  tick(g, new Map(Object.entries(c).map(([id, v]) => [Number(id), { ...idle, ...v }])));
export const walk = (g: Game, ms: number, c: Record<number, Partial<Controls>> = {}) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) step(g, c);
};
export function open(difficulty: Difficulty = 'normal', n = 2): Game {
  // map 1: an open kitchen
  const g = createGame({ difficulty, n });
  return g;
}
export const put = (p: Player, x: number, y: number, fx = 1, fy = 0) => {
  p.x = x;
  p.y = y;
  p.fx = fx;
  p.fy = fy;
  p.vx = 0;
  p.vy = 0;
};

describe('R1 integrator (Normal)', () => {
  // The pre-R1 rule: position advances at stick * SPEED every tick, no memory of the previous velocity.
  const route: [number, number, number][] = [
    [1, 0, 1500],
    [0, 0, 400],
    [0, 1, 800],
    [0, 0, 400],
    [-1, 0, 1000],
    [0, 0, 400],
    [0, -1, 500],
    [0, 0, 400],
  ];
  it('walks the same trajectory as the instant rule: every rest point within 5% of the distance travelled', () => {
    const g = open();
    const p = (addPlayer(g, 1, 0), g.players.get(1)!);
    put(p, 2.5, 2.5);
    let lx = 2.5,
      ly = 2.5,
      travelled = 0;
    for (const [x, y, ms] of route) {
      const steps = Math.round(ms / TICK_MS);
      for (let i = 0; i < steps; i++) {
        step(g, { 1: { x, y } });
        lx += x * SPEED * (TICK_MS / 1000);
        ly += y * SPEED * (TICK_MS / 1000);
      }
      travelled += Math.hypot(x, y) * SPEED * (ms / 1000);
      if (x === 0 && y === 0) {
        const err = Math.hypot(p.x - lx, p.y - ly);
        expect(err, `rest point after ${travelled.toFixed(1)} tiles`).toBeLessThan(0.05 * travelled);
      }
    }
  });
  it('is smooth: it needs about 3 tau to reach cruise speed, and stops within 3 tau_stop', () => {
    const g = open();
    const p = (addPlayer(g, 1, 0), g.players.get(1)!);
    put(p, 2.5, 2.5);
    walk(g, TICK_MS, { 1: { x: 1 } });
    expect(p.vx).toBeGreaterThan(0.1 * SPEED);
    expect(p.vx).toBeLessThan(0.5 * SPEED); // the first tick does not jump to full speed
    walk(g, 200, { 1: { x: 1 } });
    expect(p.vx).toBeGreaterThan(0.95 * SPEED);
    walk(g, 300, {});
    expect(Math.abs(p.vx)).toBeLessThan(0.02);
  });
  it('Easy and Hard keep the instant rule (tau 0) until their own table row is tuned', () => {
    for (const d of ['easy', 'hard'] as const) {
      expect([TUNING[d].tauMs, TUNING[d].tauStopMs]).toEqual([0, 0]);
      const g = open(d);
      const p = (addPlayer(g, 1, 0), g.players.get(1)!);
      put(p, 2.5, 2.5);
      step(g, { 1: { x: 1 } });
      expect(p.vx).toBe(SPEED);
    }
  });
});

// A phone with `lagMs` of latency: what the user does at time t reaches the engine at t + lagMs.
type UserEvent = { t: number; ctl: Partial<Controls> }; // stick and B are state, a and bTaps are one-shot counts
function playLagged(g: Game, id: number, events: UserEvent[], lagMs: number, untilMs: number, onTick?: (tMs: number) => void) {
  let state: Partial<Controls> = {};
  let i = 0;
  const sorted = [...events].sort((a, b) => a.t - b.t);
  for (let t = 0; t < untilMs; t += TICK_MS) {
    let a = 0,
      bTaps = 0;
    while (i < sorted.length && sorted[i]!.t + lagMs < t + TICK_MS) {
      const { a: ea, bTaps: eb, ...rest } = sorted[i]!.ctl;
      state = { ...state, ...rest };
      a += ea ?? 0;
      bTaps += eb ?? 0;
      i++;
    }
    step(g, { [id]: { ...state, a, bTaps } });
    onTick?.(t);
  }
}

describe('R2 dash (phase 1: B with empty hands and nothing in front)', () => {
  const fresh = () => {
    const g = open();
    addPlayer(g, 1, 0);
    const p = g.players.get(1)!;
    put(p, 3.5, 4.5);
    return { g, p };
  };
  const dist = (p: Player, x0: number, y0: number) => Math.hypot(p.x - x0, p.y - y0);

  it('covers about 2.6 x walking speed for 0.18 s (2.1 tiles) and then goes back to walking pace', () => {
    const { g, p } = fresh();
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(p.dashMs).toBeGreaterThan(0);
    walk(g, 400, { 1: { x: 1 } });
    // a dash alone is 2.1 tiles; the 400 ms of walking in the same direction add 4.5 * (0.4 - 0.18) on top
    expect(p.x - 3.5).toBeGreaterThan(2.1 + 4.5 * 0.2 - 0.3);
    expect(p.x - 3.5).toBeLessThan(2.1 + 4.5 * 0.25 + 0.4);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(SPEED + 1e-6);
  });
  it('dash distance from rest is 2.1 tiles (+- 0.25) and it ends in 180 ms', () => {
    const { g, p } = fresh();
    step(g, { 1: { bTaps: 1, x: 1 } });
    let ticks = 1;
    while (p.dashMs > 0) {
      step(g, { 1: { x: 0 } });
      ticks++;
    }
    expect(ticks * TICK_MS).toBeGreaterThanOrEqual(180);
    expect(ticks * TICK_MS).toBeLessThan(180 + 2 * TICK_MS);
    expect(dist(p, 3.5, 4.5)).toBeGreaterThan(1.85);
    expect(dist(p, 3.5, 4.5)).toBeLessThan(2.35);
  });
  it('cooldown 0.6 s: a second tap too soon is ignored, one after the cooldown dashes again', () => {
    const { g, p } = fresh();
    step(g, { 1: { x: 1, bTaps: 1 } });
    walk(g, 200, { 1: { x: 1 } });
    expect(p.dashMs).toBe(0);
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(p.dashMs).toBe(0); // 217 ms since the first dash: cooldown running (and 383 ms left, more than the 150 ms buffer)
    walk(g, 600, { 1: { x: 1 } });
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(p.dashMs).toBeGreaterThan(0);
  });
  it('R6: a tap up to 150 ms before the cooldown ends goes through when it ends', () => {
    const { g, p } = fresh();
    step(g, { 1: { x: 1, bTaps: 1 } });
    walk(g, 440, { 1: { x: 1 } }); // 600 - 150 = 450 ms: just inside the buffer
    const x0 = p.x;
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(p.dashMs).toBe(0);
    walk(g, 160, { 1: { x: 1 } });
    expect(p.dashMs).toBeGreaterThan(0);
    expect(p.x - x0).toBeGreaterThan(0.5);
  });
  it('needs empty hands and nothing in front: with an item B does not dash, and in front of a board it cuts', () => {
    const { g, p } = fresh();
    p.item = 'raw0';
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(p.dashMs).toBe(0);
    p.item = null;
    const board = g.stations.find((s) => s.kind === 'board')!;
    put(p, board.tx + 0.5, board.ty + 1.5, 0, -1);
    step(g, { 1: { bTaps: 1, b: true } });
    expect(p.dashMs).toBe(0);
  });
  it('works the same on Easy and Hard (the table row is shared)', () => {
    for (const d of ['easy', 'hard'] as const) {
      const g = open(d);
      addPlayer(g, 1, 0);
      const p = g.players.get(1)!;
      put(p, 3.5, 4.5);
      step(g, { 1: { x: 1, bTaps: 1 } });
      expect(p.dashMs).toBeGreaterThan(0);
    }
  });
  it('with 150 ms of lag the dash is the same length and the cooldown is counted from when it started on the screen', () => {
    for (const lag of [0, 150]) {
      const { g, p } = fresh();
      const starts: number[] = [];
      let was = 0;
      playLagged(
        g,
        1,
        [
          { t: 0, ctl: { x: 1, bTaps: 1 } },
          { t: 20, ctl: { x: 0 } },
          { t: 500, ctl: { bTaps: 1, x: 1 } },
        ],
        lag,
        1500,
        (t) => {
          if (p.dashMs > was) starts.push(Math.round(t));
          was = p.dashMs;
        },
      );
      expect(starts.length, `lag ${lag}`).toBe(2);
      // the second tap (user t=500) reaches the screen 100 ms (lag 150) or 100 ms... before the cooldown ends: always inside the buffer
      expect(starts[1]! - starts[0]!, `lag ${lag}`).toBeGreaterThanOrEqual(600 - 17);
      expect(starts[1]! - starts[0]!, `lag ${lag}`).toBeLessThanOrEqual(600 + 17);
    }
  });
});

describe('R5 push', () => {
  it('a dash that hits another chef pushes it 1.5 tiles/s for a moment and never makes it drop its item', () => {
    const g = open();
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    put(a, 3.5, 4.5);
    put(b, 5.0, 4.5);
    b.item = 'cut1';
    const bumps: number[] = [];
    g.bus.on('bump', (e) => bumps.push(e.other));
    step(g, { 1: { x: 1, bTaps: 1 } });
    walk(g, 100, { 1: { x: 1 } });
    expect(bumps).toEqual([2]); // once per dash, even though the chefs overlap for several ticks
    expect(b.x).toBeGreaterThan(5.0);
    expect(b.item).toBe('cut1');
  });
  it('a chef who is cutting is not moved', () => {
    const g = open();
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    put(a, 3.5, 4.5);
    put(b, 5.0, 4.5);
    b.cutting = true;
    step(g, { 1: { x: 1, bTaps: 1 } });
    expect(b.kx).toBe(0);
  });
});

describe('R6 input buffer: a press made a little early still counts', () => {
  const crate0 = (g: Game) => g.stations.find((s) => s.kind === 'crate' && s.crate === 0)!;
  /** Time at which a chef walking straight up reaches the crate (found with a dry run). */
  const arrival = () => {
    const g = open();
    addPlayer(g, 1, 0);
    put(g.players.get(1)!, crate0(g).tx + 0.5, 4.5, 0, -1);
    const s = crate0(g);
    for (let t = 0; t < 3000; t += TICK_MS) {
      step(g, { 1: { y: -1 } });
      const p = g.players.get(1)!;
      if (Math.hypot(p.x - (s.tx + 0.5), p.y - (s.ty + 1.5)) < 1 && Math.abs(p.y - 2.1) < 0.1) return t;
    }
    throw new Error('never arrived');
  };
  const run = (leadMs: number, lagMs: number) => {
    const g = open();
    addPlayer(g, 1, 0);
    const s = crate0(g),
      p = g.players.get(1)!;
    put(p, s.tx + 0.5, 4.5, 0, -1);
    const tArrive = arrival();
    let pickedAt = -1;
    g.bus.on('itemPicked', () => {
      pickedAt = g.time;
    });
    // The phone stream is delayed by lagMs: the stick event is sent lagMs early so the chef moves as in the dry run, and the press
    // is sent so that it reaches the screen leadMs before the chef gets to the crate.
    playLagged(
      g,
      1,
      [
        { t: -lagMs, ctl: { y: -1 } },
        { t: tArrive - leadMs - lagMs, ctl: { a: 1 } },
      ],
      lagMs,
      tArrive + 800,
    );
    return { item: p.item, pickedAt };
  };
  it('0 ms of lag: a press 100 ms early is picked up, 400 ms early is not', () => {
    expect(run(100, 0).item).toBe('raw0');
    expect(run(400, 0).item).toBeNull();
  });
  it('150 ms of lag: the phone press arrives 100 ms before the chef reaches the crate and still picks it up; 400 ms is too early', () => {
    expect(run(100, 150).item).toBe('raw0');
    expect(run(400, 150).item).toBeNull();
  });
  it('an expired press does not fire later: after bufferMs it is gone', () => {
    const g = open();
    addPlayer(g, 1, 0);
    const s = crate0(g),
      p = g.players.get(1)!;
    put(p, s.tx + 0.5, 4.5, 0, -1);
    step(g, { 1: { a: 1 } });
    expect(p.buffA).toBe(1);
    walk(g, 200, {});
    expect(p.buffA).toBe(0);
    put(p, s.tx + 0.5, 1.6, 0, -1);
    walk(g, 100, {});
    expect(p.item).toBeNull();
  });
  it('a press with a station already in front acts at once and is not kept', () => {
    const g = open();
    addPlayer(g, 1, 0);
    const s = crate0(g),
      p = g.players.get(1)!;
    put(p, s.tx + 0.5, 1.6, 0, -1);
    step(g, { 1: { a: 1 } });
    expect(p.item).toBe('raw0');
    expect(p.buffA).toBe(0);
  });
});

describe('R4 soft collision', () => {
  const CORRIDOR = [
    '################',
    '################',
    '################',
    '################',
    '#..............#',
    '################',
    '################',
    '################',
    '################',
  ];
  const lane = (n: number, starts: [number, number][]) => {
    const g = createGame({ rows: CORRIDOR, spawns: starts, n });
    starts.forEach((_s, i) => addPlayer(g, i + 1, i));
    return g;
  };
  /** Bots ping-pong along the corridor; returns the longest time any bot kept pushing without moving, and how many trips were made. */
  function corridor(g: Game, ms: number) {
    const dir = new Map<number, number>([...g.players.keys()].map((id) => [id, id <= 4 ? 1 : -1]));
    const stalled = new Map<number, number>(),
      worst = new Map<number, number>();
    let trips = 0;
    for (let t = 0; t < ms; t += TICK_MS) {
      const before = new Map([...g.players].map(([id, p]) => [id, p.x]));
      step(g, Object.fromEntries([...dir].map(([id, d]) => [id, { x: d }])));
      for (const [id, p] of g.players) {
        if (Math.abs(p.x - before.get(id)!) < 0.1 * SPEED * (TICK_MS / 1000)) stalled.set(id, (stalled.get(id) ?? 0) + TICK_MS);
        else stalled.set(id, 0);
        worst.set(id, Math.max(worst.get(id) ?? 0, stalled.get(id)!));
        if (dir.get(id) === 1 && p.x > 13.5) {
          dir.set(id, -1);
          trips++;
        } else if (dir.get(id) === -1 && p.x < 1.5) {
          dir.set(id, 1);
          trips++;
        }
      }
    }
    return { worst: Math.max(...worst.values()), trips };
  }

  it('8 bots in a one-tile corridor, 4 against 4, never stay blocked more than 3 s and keep making trips', () => {
    const g = lane(8, [
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
      [11, 4],
      [12, 4],
      [13, 4],
      [14, 4],
    ]);
    const { worst, trips } = corridor(g, 90_000);
    expect(worst).toBeLessThanOrEqual(3000);
    expect(trips).toBeGreaterThan(30);
  });
  it('8 bots that start on the same side and go the same way queue up and do not jam', () => {
    const g = lane(8, [
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
      [7, 4],
      [8, 4],
    ]);
    const { worst } = corridor(g, 30_000);
    expect(worst).toBeLessThanOrEqual(3000);
  });

  it('chefs are solid: one walking into an idle chef pushes it along instead of passing through', () => {
    const g = open();
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    put(a, 5.5, 4.5);
    put(b, 7.5, 4.5);
    walk(g, 800, { 1: { x: 1 } }); // without collision this walks right through (the old rule)
    expect(a.x).toBeLessThan(b.x);
    expect(b.x - a.x).toBeGreaterThanOrEqual(2 * 0.35 - 0.02);
  });
  it('opposed pushing for 0.4 s makes the pair cross at 40% speed, and then they are solid again', () => {
    const g = lane(2, [
      [3, 4],
      [4, 4],
    ]);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    put(a, 3.5, 4.5);
    put(b, 6.5, 4.5);
    const push = { 1: { x: 1 }, 2: { x: -1 } };
    let contactAt = -1,
      crossedAt = -1,
      crossDist = 0,
      crossTicks = 0;
    for (let t = 0; t < 4000 && crossedAt < 0; t += TICK_MS) {
      const x0 = a.x,
        was = a.crossing;
      step(g, push);
      if (was) {
        crossDist += a.x - x0;
        crossTicks++;
      }
      if (contactAt < 0 && b.x - a.x < 2 * 0.35 + 0.01) contactAt = t;
      if (a.x > b.x) crossedAt = t;
    }
    expect(crossedAt - contactAt).toBeGreaterThan(450); // 0.4 s of pushing, then centres meet after a further ~0.1 s at 40% speed
    expect(crossedAt - contactAt).toBeLessThan(800);
    expect(g.crowd.size).toBeGreaterThan(0);
    expect(crossTicks).toBeGreaterThan(2);
    const v = crossDist / ((crossTicks * TICK_MS) / 1000);
    expect(v).toBeGreaterThan(0.4 * SPEED * 0.85); // while crossing a chef moves at 40% of walking pace
    expect(v).toBeLessThan(0.4 * SPEED * 1.15);
    walk(g, 800, { 1: { x: 0 }, 2: { x: 0 } });
    expect(g.crowd.size).toBe(0);
    expect(a.crossing || b.crossing).toBe(false);
  });
  it('a chef who is cutting does not give way: the other one is held back, and only crosses after 0.4 s', () => {
    const g = open();
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    const board = g.stations.find((s) => s.kind === 'board' && s.tx === 7)!;
    board.item = 'raw0';
    put(b, 7.5, 1.5, 0, -1);
    put(a, 5.5, 1.5);
    walk(g, 100, { 2: { b: true } });
    expect(b.cutting).toBe(true);
    const bx = b.x;
    walk(g, 250, { 1: { x: 1 }, 2: { b: true } });
    expect(b.x).toBe(bx);
    expect(a.x).toBeLessThanOrEqual(bx - 2 * 0.35 + 0.02);
    walk(g, 1300, { 1: { x: 1 }, 2: { b: true } });
    expect(a.x).toBeGreaterThan(bx); // after 0.4 s of pushing against someone who cannot give way, it crosses
  });
});
