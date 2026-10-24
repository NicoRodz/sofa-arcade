// R13-R17: base by recipe, tip by patience left, streak multiplier, penalties and stars. One test per path.
import { describe, expect, it } from 'vitest';
import { TICK_MS, addPlayer, createGame, recipeBase, tick, tipMultiplier, type Controls, type Game, type Recipe } from './overcooked';
import { DIFFICULTIES, TUNING, params, type Difficulty } from './difficulty';
import { DIRS, FIXED_MAPS, fixedMap, isFloor } from './maps';
import { E2, E2_DEFAULT, expectedScore, starThresholds, stars, teamFactor } from './stars';
import { summarize } from './results';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const run = (g: Game, ms: number) => { for (let t = 0; t < ms; t += TICK_MS) tick(g, new Map()); };
function setup(o: { difficulty?: Difficulty; rows?: readonly string[]; n?: number } = {}) {
  const g = createGame({ difficulty: o.difficulty ?? 'normal', rows: o.rows, n: o.n ?? 2 });
  addPlayer(g, 1, 0);
  g.orders = [];
  return g;
}
/** Puts a dish in the chef's hands and presses A at the window. The order (if any) must already be in g.orders. */
function serve(g: Game, item: 'dish' | 'dishQ' = 'dish') {
  const p = g.players.get(1)!;
  const w = g.stations.find((s) => s.kind === 'window')!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, w.tx + dx, w.ty + dy))!;
  p.x = w.tx + dx + 0.5; p.y = w.ty + dy + 0.5; p.fx = -dx; p.fy = -dy;
  p.item = item;
  tick(g, new Map([[1, { ...idle, a: 1 }]]));
}
const order = (g: Game, recipe: Recipe, leftFrac: number, id = g.orderSeq++) => { g.orders.push({ id, expiresAt: g.time + leftFrac * g.params.orderTtlMs, warned: true, recipe }); };

describe('R13 base: 20 per ingredient + 10 per process', () => {
  it('a Marinara is worth 2 x 20 + 3 x 10 = 70 and a Margarita 3 x 20 + 4 x 10 = 100', () => {
    const t = TUNING.normal;
    expect(recipeBase('marinara', t)).toBe(70);
    expect(recipeBase('margarita', t)).toBe(100);
  });
  it('a delivery with no patience left pays exactly the base', () => {
    const g = setup(); order(g, 'marinara', 0);
    serve(g);
    expect(g.score).toBe(70);
    const h = setup({ rows: fixedMap('9')!.rows }); order(h, 'margarita', 0);
    serve(h, 'dishQ');
    expect(h.score).toBe(100);
  });
  it('a Margarita that serves a Marinara order is paid what the order asked', () => {
    const g = setup({ rows: fixedMap('9')!.rows }); order(g, 'marinara', 0);
    serve(g, 'dishQ');
    expect(g.score).toBe(70);
  });
});

describe('R14 tip: up to +50% of the base by the patience left', () => {
  it('full patience pays +35 on a Marinara, half patience +18 (rounded), none at the end', () => {
    const g = setup(); order(g, 'marinara', 1);
    serve(g);
    expect(g.score).toBe(70 + 35);
    expect(g.tips).toBe(35);
    const h = setup(); order(h, 'marinara', 0.5);
    serve(h);
    expect(h.score).toBeGreaterThanOrEqual(70 + 17);
    expect(h.score).toBeLessThanOrEqual(70 + 18); // 17.5, a tick of patience is gone by the time A is read
    const z = setup(); order(z, 'marinara', 0);
    serve(z);
    expect(z.tips).toBe(0);
  });
  it('the same share on every difficulty', () => {
    for (const d of DIFFICULTIES) { const g = setup({ difficulty: d }); order(g, 'marinara', 1); serve(g); expect(g.score, d).toBe(105); }
  });
});

describe('R15 streak: x1 to x4, only on the tip', () => {
  it('each correct delivery raises the multiplier x1, x2, x3, x4 and it stops at x4', () => {
    const g = setup();
    const got: number[] = [];
    g.bus.on('delivered', (e) => got.push(e.mult));
    for (let i = 0; i < 6; i++) { order(g, 'marinara', 1); serve(g); }
    expect(got).toEqual([1, 2, 3, 4, 4, 4]);
    expect(g.bestStreak).toBe(6);
  });
  it('multiplies the tip and not the base: the 3rd delivery at full patience pays 70 + 35 x 3', () => {
    const g = setup();
    for (let i = 0; i < 2; i++) { order(g, 'marinara', 0); serve(g); }
    const before = g.score;
    order(g, 'marinara', 1);
    serve(g);
    expect(g.score - before).toBe(70 + 35 * 3);
  });
  it('an expired order resets it (and applies the penalty)', () => {
    const g = setup();
    const events: { n: number; mult: number }[] = [];
    g.bus.on('streak', (e) => events.push(e));
    for (let i = 0; i < 3; i++) { order(g, 'marinara', 0); serve(g); }
    expect(g.streak).toBe(3);
    const before = g.score;
    g.orders = [{ id: 500, expiresAt: g.time + 100, warned: true, recipe: 'marinara' }];
    run(g, 300);
    expect(g.streak).toBe(0);
    expect(g.expired).toBe(1);
    expect(g.score).toBe(before + params('normal', 2).penalty);
    expect(events.at(-1)).toEqual({ n: 0, mult: 1 });
    order(g, 'marinara', 1); serve(g);
    expect(g.score).toBe(before + params('normal', 2).penalty + 105); // back to x1
  });
  it('the wrong plate resets it too, and a streak survives an empty queue', () => {
    const g = setup(); g.hasCheese = true;
    for (let i = 0; i < 2; i++) { order(g, 'marinara', 0); serve(g); }
    expect(g.streak).toBe(2);
    g.orders = [];
    serve(g); // nothing asked for: the dish stays in hand, nothing is lost
    expect(g.players.get(1)!.item).toBe('dish');
    expect(g.streak).toBe(2);
    order(g, 'margarita', 1);
    serve(g); // Marinara against a Margarita-only queue: wrong plate
    expect(g.streak).toBe(0);
  });
  it('tipMultiplier follows the table', () => {
    expect([0, 1, 2, 3, 4, 10].map((s) => tipMultiplier(s, TUNING.normal))).toEqual([1, 2, 3, 4, 4, 4]);
  });
});

describe('R16 penalties', () => {
  it('an expired order costs 0 / -10 / -20 by difficulty, and the score never goes below 0', () => {
    expect(DIFFICULTIES.map((d) => params(d, 2).penalty)).toEqual([0, -10, -20]);
    for (const d of DIFFICULTIES) {
      const g = setup({ difficulty: d });
      g.score = 50;
      g.orders = [{ id: 1, expiresAt: g.time + 100, warned: true, recipe: 'marinara' }];
      run(g, 300);
      expect(g.score, d).toBe(50 + params(d, 2).penalty);
    }
    const z = setup(); z.score = 4;
    z.orders = [{ id: 1, expiresAt: z.time + 100, warned: true, recipe: 'marinara' }];
    run(z, 300);
    expect(z.score).toBe(0);
  });
  it('the wrong plate is refused: no points, the pizza is gone, the plate comes back dirty, an event says so', () => {
    const g = setup({ rows: fixedMap('10')!.rows }); // a map with a sink: plates are finite
    expect(g.finitePlates).toBe(true);
    const events: number[] = [];
    g.bus.on('dishRejected', (e) => events.push(e.player));
    order(g, 'margarita', 1);
    const dirty = g.stations.find((s) => s.kind === 'dirty')!;
    serve(g);
    expect(g.score).toBe(0);
    expect(g.players.get(1)!.item).toBeNull();
    expect(g.orders).toHaveLength(1); // the Margarita order is still waiting
    expect(events).toEqual([1]);
    expect(dirty.count).toBe(0);
    run(g, 6100);
    expect(dirty.count).toBe(1);
  });
});

describe('R17 stars by map x difficulty x team size', () => {
  it('there is a row for each of the 15 maps and every difficulty, and the thresholds climb', () => {
    for (const m of FIXED_MAPS) for (const d of DIFFICULTIES) for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      expect(E2[m.id]?.[d], `${m.id} ${d}`).toBeGreaterThan(0);
      const [a, b, c] = starThresholds(m.id, d, n);
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
    }
  });
  it('E(N) = E(2) x (1 + 0.4 (min(N,4) - 2) + 0.15 max(N-4, 0)): 1, 1.4, 1.8, 1.95, 2.1, 2.25, 2.4', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(teamFactor).map((v) => Math.round(v * 100) / 100)).toEqual([1, 1.4, 1.8, 1.95, 2.1, 2.25, 2.4]);
    expect(expectedScore('1', 'normal', 6)).toBeCloseTo(350 * 2.1, 6);
  });
  it('1, 2 and 3 stars are 35%, 60% and 85% of E(N); the boundaries are inclusive', () => {
    const [a, b, c] = starThresholds('1', 'normal', 2); // E = 350
    expect([a, b, c]).toEqual([122, 210, 298]);
    expect([a - 1, a, b - 1, b, c - 1, c].map((s) => stars('1', 'normal', 2, s))).toEqual([0, 1, 1, 2, 2, 3]);
  });
  it('the same score is worth fewer stars with more players, and map and difficulty change the bar', () => {
    expect(stars('1', 'normal', 2, 220)).toBe(2);
    expect(stars('1', 'normal', 6, 220)).toBe(0);
    expect(starThresholds('3', 'normal', 2)[2]).toBeLessThan(starThresholds('1', 'normal', 2)[2]); // a 2-star map has a lower bar
    expect(starThresholds('1', 'easy', 2)).not.toEqual(starThresholds('1', 'normal', 2));
  });
  it('a generated map (no id) uses the default row', () => {
    expect(starThresholds(undefined, 'normal', 2)).toEqual(starThresholds('random', 'normal', 2));
    expect(expectedScore(undefined, 'hard', 2)).toBe(E2_DEFAULT.hard);
  });
  it('3 stars are within reach: serving 70% of the orders of a round at half patience with a normal streak is enough on every map, difficulty and size', () => {
    for (const m of FIXED_MAPS) for (const d of DIFFICULTIES) for (const n of [2, 4, 6, 8]) {
      const p = params(d, n);
      const orders = p.initialOrders + Math.floor(p.roundMs / p.orderEveryMs);
      const perPizza = (m.rows.some((r) => r.includes('3')) ? 79 : 70) * 1.55;
      expect(0.7 * orders * perPizza, `${m.id} ${d} N=${n}`).toBeGreaterThanOrEqual(starThresholds(m.id, d, n)[2]);
    }
  });
  it('the results summary carries the stars, the missing points and the round numbers', () => {
    const g = createGame({ mapId: '1', difficulty: 'normal', n: 2 });
    addPlayer(g, 1, 0);
    g.score = 150; g.delivered = 3; g.expired = 1; g.rejected = 1; g.tips = 40; g.bestStreak = 3;
    expect(summarize(g)).toEqual({ score: 150, stars: 1, thresholds: [122, 210, 298], next: 60, delivered: 3, expired: 1, rejected: 1, tips: 40, bestStreak: 3 });
    g.score = 300;
    expect(summarize(g)).toMatchObject({ stars: 3, next: null });
  });
});
