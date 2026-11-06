// F2: the sim by team (design pizzas-modalidades-coop-versus §1 and §5). Kitchens and owners, twin queues, VIP, handicap k by
// stretches, ghosts and pause, ranking, the mirror proof and the coop regression. Test maps are V1 (mirror) and V3 (rotation)
// from the design, translated to the real legend in golden/mirror-bot.ts.
import { describe, expect, it } from 'vitest';
import { DIRS, fixedMap, isFloor } from '../maps';
import { TICK_MS, addPlayer, createGame, spawnOrder, targetStation, type Game } from '../overcooked';
import { MIRRORS } from '../../test/golden/mirror-bot';
import { type Log, mk, run, orderOf, pressA, serve } from './versus.kit';

describe('kitchens: each team has its own side and stations', () => {
  it('V1: the left kitchen is team 0 and the right one team 1, with the same stations on each side', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(g.versus).toBe(true);
    const owned = (t: number) =>
      g.stations
        .filter((s) => s.owner === t)
        .map((s) => `${s.kind}${s.kind === 'crate' ? s.crate : ''}`)
        .sort();
    expect(g.stations.filter((s) => s.owner === null)).toHaveLength(0);
    expect(owned(0)).toEqual(owned(1));
    expect(owned(0)).toContain('pot');
    expect(owned(0)).toContain('window');
    expect(owned(0)).toContain('crate2');
    for (const s of g.stations) expect(s.owner).toBe(s.tx < 8 ? 0 : 1);
  });
  it('V3 (rotation): the top kitchen is team 0 and the bottom one team 1', () => {
    const { g } = mk(
      [
        [1, 2],
        [3, 4],
      ],
      { rows: MIRRORS.v3.rows },
    );
    for (const s of g.stations) expect(s.owner).toBe(s.ty < 4 ? 0 : 1);
  });
  it('chefs start inside their own kitchen, on the tile of their rank, and the twin ranks are twins', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    for (const p of g.players.values()) expect(p.x < 8).toBe(p.team === 0);
    for (let r = 0; r < 3; r++) {
      const a = g.players.get(1 + r)!,
        b = g.players.get(4 + r)!;
      expect([b.x, b.y]).toEqual([16 - a.x, a.y]);
    }
  });
  it('a chef that is on no team (a latecomer) is not added: it watches', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    expect(addPlayer(g, 9, 4)).toBe(false);
    expect(g.players.has(9)).toBe(false);
  });
  it('a map with a single kitchen cannot host two teams', () => {
    expect(() => createGame({ rows: fixedMap('1')!.rows, teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }] })).toThrow(
      /separate kitchens/,
    );
  });
  it('coop: every station belongs to team 0 and everybody is on it', () => {
    const g = createGame({ rows: fixedMap('3')!.rows, n: 2 }); // river map: two floor regions, still one team
    expect(g.versus).toBe(false);
    expect(g.stations.every((s) => s.owner === 0)).toBe(true);
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    expect([...g.players.values()].map((p) => p.team)).toEqual([0, 0]);
  });
});

describe('owner: a rival kitchen does not answer', () => {
  /** Stands the team-0 chef beside a station, facing it. */
  function beside(g: Game, id: number, s: { tx: number; ty: number }) {
    const p = g.players.get(id)!;
    const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
    p.x = s.tx + dx + 0.5;
    p.y = s.ty + dy + 0.5;
    p.fx = -dx;
    p.fy = -dy;
    p.vx = p.vy = 0;
    return p;
  }
  it("the rival oven takes nothing: the cut dough stays in the chef's hands", () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const rival = g.stations.find((s) => s.kind === 'pot' && s.owner === 1)!;
    const p = beside(g, 1, rival);
    p.item = 'cut0';
    pressA(g, [1]);
    expect(rival.inputs).toEqual([]);
    expect(p.item).toBe('cut0');
    expect(targetStation(g, p)).toBeNull();
  });
  it('the chef own oven does take it (the harness works)', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const own = g.stations.find((s) => s.kind === 'pot' && s.owner === 0)!;
    const p = beside(g, 1, own);
    p.item = 'cut0';
    pressA(g, [1]);
    expect(own.inputs).toEqual([0]);
    expect(p.item).toBeNull();
  });
  it('rival crates give nothing, the rival counter does not hold what it is given, and its window pays nothing', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 0 && s.owner === 1)!;
    const p = beside(g, 1, crate);
    pressA(g, [1]);
    expect(p.item).toBeNull();
    const counter = g.stations.find((s) => s.kind === 'counter' && s.owner === 1)!;
    beside(g, 1, counter).item = 'raw1';
    pressA(g, [1]);
    expect(counter.item).toBeNull();
    const win = g.stations.find((s) => s.kind === 'window' && s.owner === 1)!;
    g.teams[0]!.orders = [orderOf(g, 0, 'marinara', 1000)];
    beside(g, 1, win).item = 'dish';
    pressA(g, [1]);
    expect(g.teams[0]!.delivered + g.teams[1]!.delivered).toBe(0);
    expect(g.teams[0]!.orders).toHaveLength(1);
  });
  it('a station with no owner (a shared pantry) answers to both teams', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 0 && s.owner === 1)!;
    crate.owner = null;
    const p = beside(g, 1, crate);
    pressA(g, [1]);
    expect(p.item).toBe('raw0');
  });
});

describe('twin queues: same seed per team, same recipes at the same instants', () => {
  const orderNews = (log: Log, team: number) =>
    (log.orderNew ?? []).filter((e) => e.p.team === team && !e.p.vip).map((e) => `${e.t.toFixed(3)}:${e.p.recipe}`);
  it('both teams receive the same order sequence, with both recipes present', () => {
    const { g, log } = mk(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      { difficulty: 'hard' },
    );
    run(g, 178_000);
    const a = orderNews(log, 0),
      b = orderNews(log, 1);
    expect(a.length).toBeGreaterThanOrEqual(5);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.split(':')[1])).size).toBe(2);
  });
  it('delivering in A does not change anything in B (queue, deadlines, events)', () => {
    const one = mk([
        [1, 2],
        [3, 4],
      ]),
      two = mk([
        [1, 2],
        [3, 4],
      ]);
    run(one.g, 8000);
    run(two.g, 8000);
    serve(two.g, 1); // team 0 serves its first order; team 1 does nothing in either game
    run(one.g, 36_000 + TICK_MS);
    run(two.g, 36_000); // 44 s: the second order (40 s) is in both queues, the VIP (60 s) is not
    serve(two.g, 1);
    run(one.g, 3000 + TICK_MS);
    run(two.g, 3000);
    expect(two.g.teams[0]!.delivered).toBe(2);
    expect(one.g.teams[0]!.delivered).toBe(0);
    expect(orderNews(two.log, 1)).toHaveLength(1);
    const view = (g: Game, log: Log) => ({
      orders: g.teams[1]!.orders,
      score: g.teams[1]!.score,
      news: orderNews(log, 1),
      expired: (log.orderExpired ?? []).filter((e) => e.p.team === 1).map((e) => e.t.toFixed(3)),
    });
    expect(view(two.g, two.log)).toEqual(view(one.g, one.log));
  });
  it('a full queue does not shift the recipes: the team that skips a slot still draws it, so each recipe arrives when the rival got it', () => {
    const { g, log } = mk(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      { seed: 9, difficulty: 'hard' },
    );
    const filler = () => g.teams[0]!.orders.push({ id: g.teams[0]!.orderSeq++, expiresAt: Infinity, warned: true, recipe: 'marinara' });
    for (let s = 0; s < 178; s++) {
      // team 1 serves every order as it comes; team 0 has a full queue in the middle minute and an empty one around it
      const full = s >= 60 && s < 120;
      if (full) while (g.teams[0]!.orders.length < g.params.maxOrders) filler();
      else g.teams[0]!.orders = [];
      run(g, 1000);
      if (g.teams[1]!.orders.length) serve(g, 4);
    }
    const a = orderNews(log, 0),
      b = orderNews(log, 1);
    expect(a.length).toBeGreaterThanOrEqual(4); // team 0 did admit some, of both recipes...
    expect(new Set(a.map((x) => x.split(':')[1])).size).toBe(2);
    expect(b.length).toBeGreaterThan(a.length); // ...and skipped others
    for (const x of a) expect(b).toContain(x); // every order it got is the rival's order of that very instant, same recipe
    expect(new Set(b.map((x) => x.split(':')[1])).size).toBe(2);
  });
  it('the order of calls does not matter: spawnOrder by hand on one team leaves the other stream alone', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const before = g.teams[1]!.rng();
    const { g: h } = mk([
      [1, 2],
      [3, 4],
    ]);
    for (let i = 0; i < 5; i++) {
      h.teams[0]!.orders = [];
      spawnOrder(h, h.teams[0]!);
    }
    expect(h.teams[1]!.rng()).toBe(before);
  });
});
