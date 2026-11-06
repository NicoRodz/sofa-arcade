import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from '../round/events';
import { fixedMap } from '../maps';
import { addPlayer, createGame, spawnOrder } from '../overcooked';
import { MIRRORS, runVersus } from '../../test/golden/mirror-bot';
import { runGolden, SCENARIOS, type GoldenRun } from '../../test/golden/bot';
import n2 from '../../test/golden/fixtures/coop-n2-map2-normal.json';
import n4 from '../../test/golden/fixtures/coop-n4-map9-hard.json';
import n6 from '../../test/golden/fixtures/coop-n6-map11-easy.json';
import { V1, mk, runUntil } from './versus.kit';

describe('prueba del espejo: scripted chefs reflected by the isometry tie exactly', () => {
  const compare = (r: ReturnType<typeof runVersus>) => {
    const [a, b] = r.g.teams;
    const fields = (t: NonNullable<typeof a>) => ({
      score: t.score,
      gross: t.gross,
      delivered: t.delivered,
      tips: t.tips,
      bestStreak: t.bestStreak,
      expired: t.expired,
      rejected: t.rejected,
      vips: t.vips,
      reachedAt: t.reachedAt,
    });
    // each team's own events: the same ticks, the same payloads (the chef and the station index differ between kitchens; `tie` says who was processed second in a shared tick)
    const own = (team: number) =>
      r.bus.log
        .map((l) => l.split('|'))
        .filter(([, , p]) => (JSON.parse(p!) as { team?: number }).team === team)
        .map(([tk, type, p]) => {
          const o = JSON.parse(p!) as Record<string, unknown>;
          delete o.team;
          delete o.player;
          delete o.station;
          delete o.tie;
          return `${tk}|${type}|${JSON.stringify(o)}`;
        });
    return { a: fields(a!), b: fields(b!), ea: own(0), eb: own(1) };
  };
  it('V1 3v3 (reflection): identical score, counters and events in both kitchens, and the chefs end up as twins', () => {
    const r = runVersus({
      ...V1,
      difficulty: 'normal',
      seed: 3,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    const { a, b, ea, eb } = compare(r);
    expect(a.delivered).toBeGreaterThanOrEqual(5); // a tie at zero proves nothing
    expect(a.score).toBeGreaterThan(300);
    expect(a.bestStreak).toBeGreaterThanOrEqual(1);
    expect(ea.filter((e) => e.includes('|delivered|')).length).toBe(a.delivered);
    expect(b).toEqual(a);
    expect(eb).toEqual(ea);
    expect(r.g.result).toMatchObject({ winner: null });
    for (let i = 1; i <= 3; i++) {
      const p = r.g.players.get(i)!,
        q = r.g.players.get(i + 3)!;
      expect(q.x).toBeCloseTo(16 - p.x, 3);
      expect(q.y).toBeCloseTo(p.y, 3);
      expect(q.item).toBe(p.item);
    }
  });
  it('V3 2v2 (rotation of 180 degrees): the same', () => {
    const r = runVersus({
      ...MIRRORS.v3,
      difficulty: 'hard',
      seed: 8,
      teams: [
        [1, 2],
        [3, 4],
      ],
    });
    const { a, b, ea, eb } = compare(r);
    expect(a.delivered).toBeGreaterThanOrEqual(3);
    expect(b).toEqual(a);
    expect(eb).toEqual(ea);
  });
  it('the VIP is part of the proof: a golden order wins in both kitchens in the same tick', () => {
    // seed 2 on Easy: both golden orders (75 s and 150 s) are Marinaras, which the scripted chefs (plain pizza) can serve
    const r = runVersus({
      ...V1,
      difficulty: 'easy',
      seed: 2,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    const [a, b] = r.g.teams;
    expect(a!.vips + b!.vips).toBe(4);
    expect(b!.vips).toBe(a!.vips);
    expect(b!.score).toBe(a!.score);
  });
  it('a different team play breaks the tie (the proof can fail): one chef less in team 1 loses points', () => {
    const r = runVersus({
      ...V1,
      difficulty: 'normal',
      seed: 3,
      teams: [
        [1, 2, 3],
        [4, 5],
      ],
      handicap: false,
    });
    expect(r.g.teams[0]!.score).not.toBe(r.g.teams[1]!.score);
  });
});

describe('coop regression: one team is the same round as before', () => {
  const FIX: Record<string, GoldenRun> = { [n2.name]: n2, [n4.name]: n4, [n6.name]: n6 };
  for (const sc of SCENARIOS) {
    it(`${sc.name}: with a declared single team the whole round matches the recorded fixture`, () => {
      const got = runGolden({ ...sc, teams: [{ playerIds: Array.from({ length: sc.n }, (_v, i) => i + 1) }] });
      const { events: ge, ...gr } = got,
        { events: we, ...wr } = FIX[sc.name]!;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
    });
  }
  it('coop draws a recipe only when the order is admitted (a full queue spends nothing); versus draws at every slot', () => {
    const seq = (versus: boolean, skipped: number) => {
      const g = versus
        ? mk(
            [
              [1, 2],
              [3, 4],
            ],
            { seed: 7 },
          ).g
        : createGame({ n: 2, seed: 7, rows: fixedMap('9')!.rows });
      const t = g.teams[0]!;
      t.orders = [];
      for (let i = 0; i < g.params.maxOrders; i++) t.orders.push({ id: 100 + i, expiresAt: Infinity, warned: true, recipe: 'marinara' });
      for (let i = 0; i < skipped; i++) spawnOrder(g, t); // full: nothing is admitted
      expect(t.orders).toHaveLength(g.params.maxOrders);
      const out: string[] = [];
      for (let i = 0; i < 24; i++) {
        t.orders = [];
        spawnOrder(g, t);
        out.push(t.orders[0]!.recipe);
      }
      return out.join();
    };
    expect(seq(false, 5)).toBe(seq(false, 0));
    expect(seq(true, 5)).not.toBe(seq(true, 0));
  });
  it('coop events carry no team and no VIP fields; the legacy fields are team 0', () => {
    const g = createGame({ n: 2 });
    expect(g.versus).toBe(false);
    expect(g.teams).toHaveLength(1);
    g.score = 42;
    expect(g.teams[0]!.score).toBe(42);
    g.orders = [];
    expect(g.teams[0]!.orders).toEqual([]);
    const seen: unknown[] = [];
    const bus = new Emitter<GameEvents>();
    for (const k of ['orderNew', 'streak', 'potStart', 'roundEnd'] as const) bus.on(k, (p) => seen.push(p));
    const h = createGame({ n: 2, bus, countdownMs: 0 });
    addPlayer(h, 1, 0);
    h.params.roundMs = 1000;
    runUntil(h, () => h.over);
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect(Object.keys(p as object)).not.toContain('team');
  });
});
