import { describe, expect, it } from 'vitest';
import { GHOST_MS } from '@pichi/core/lobby/teams';
import { dropPlayer, rejoinPlayer, resolvePause, tick, type Game } from '../overcooked';
import { summarizeTeam } from '../scoring/results';
import { mk, run, runUntil, orderOf, serve } from './versus.kit';

describe('end of the round: score, deliveries, VIPs, who got there first', () => {
  /** Ends a quiet 2v2 round with the given numbers per team. */
  function finishWith(a: Partial<Game['teams'][number]>, b: Partial<Game['teams'][number]>) {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    for (const t of g.teams) {
      t.orders = [];
      t.nextOrderAt = Infinity;
    }
    g.vip.nextAt = Infinity;
    Object.assign(g.teams[0]!, a);
    Object.assign(g.teams[1]!, b);
    g.time = g.params.roundMs - 1;
    tick(g, new Map());
    expect(g.over).toBe(true);
    return { g, log };
  }
  it('more points wins', () => {
    const { g, log } = finishWith({ score: 300 }, { score: 310, delivered: 1 });
    expect(g.result).toMatchObject({ winner: 1, aborted: false });
    expect(log.roundEnd![0]!.p).toMatchObject({ winner: 1, score: 310 });
    expect(log.roundEnd![0]!.p.results!.map((r) => r.teamId)).toEqual([1, 0]);
  });
  it('same points: more deliveries wins', () => {
    expect(finishWith({ score: 300, delivered: 5 }, { score: 300, delivered: 6 }).g.result!.winner).toBe(1);
  });
  it('same points and deliveries: more VIPs won', () => {
    expect(finishWith({ score: 300, delivered: 5, vips: 1 }, { score: 300, delivered: 5, vips: 0 }).g.result!.winner).toBe(0);
  });
  it('everything equal: the team that reached its final score first', () => {
    expect(
      finishWith({ score: 300, delivered: 5, vips: 1, reachedAt: 90_000 }, { score: 300, delivered: 5, vips: 1, reachedAt: 80_000 }).g
        .result!.winner,
    ).toBe(1);
  });
  it('a complete tie has no winner', () => {
    const { g, log } = finishWith(
      { score: 300, delivered: 5, vips: 1, reachedAt: 90_000 },
      { score: 300, delivered: 5, vips: 1, reachedAt: 90_000 },
    );
    expect(g.result!.winner).toBeNull();
    expect(log.roundEnd![0]!.p.winner).toBeNull();
  });
  it('the score that counts is the one with k, and reachedAt moves with every point', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    for (const t of g.teams) {
      t.orders = [];
      t.nextOrderAt = Infinity;
    }
    g.vip.nextAt = Infinity;
    run(g, 20_000);
    g.teams[0]!.orders = [orderOf(g, 0, 'marinara', 0)];
    g.teams[0]!.orders[0]!.expiresAt = g.time + 5;
    serve(g, 1, 'dish');
    expect(g.teams[0]!.reachedAt).toBe(g.time);
    expect(g.teams[1]!.reachedAt).toBe(0);
    const s = summarizeTeam(g, 1);
    expect(s).toMatchObject({ teamId: 1, k: 1.22, score: 0 });
    expect(s.thresholds[0]).toBeGreaterThan(0);
  });
});

describe('a chef drops', () => {
  it('10 s: ghost with no body or input, what it held goes to the nearest free counter, and it comes back to the same team and chef with k unchanged', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 3000);
    const p = g.players.get(2)!;
    p.item = 'raw1';
    const counters = g.stations.filter((s) => s.kind === 'counter' && s.owner === 0);
    const nearest = [...counters].sort(
      (a, b) => Math.hypot(a.tx + 0.5 - p.x, a.ty + 0.5 - p.y) - Math.hypot(b.tx + 0.5 - p.x, b.ty + 0.5 - p.y),
    )[0]!;
    expect(dropPlayer(g, 2)).toBe(true);
    expect(dropPlayer(g, 2)).toBe(false);
    expect(p.ghost).toBe(true);
    expect(p.item).toBeNull();
    expect(nearest.item).toBe('raw1');
    const at = [p.x, p.y];
    for (let i = 0; i < 600; i++) tick(g, new Map([[2, { x: 1, y: 0, a: 1, b: true }]])); // 10 s of input that a ghost ignores
    expect([p.x, p.y]).toEqual(at);
    expect(g.players.get(2)).toBe(p);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]);
    expect(rejoinPlayer(g, 2)).toBe(true);
    expect(p).toMatchObject({ ghost: false, team: 0, id: 2 });
    expect(g.roster.find((r) => r.id === 2)).toMatchObject({ teamId: 0, droppedAt: null });
    run(g, GHOST_MS + 1000); // and it does not leave later
    expect(g.players.has(2)).toBe(true);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]);
    expect(log.playerDropped!.map((e) => e.p)).toEqual([{ player: 2, team: 0 }]);
    expect(log.playerBack!.map((e) => e.p)).toEqual([{ player: 2, team: 0 }]);
    expect(log.playerGone).toBeUndefined();
  });
  it('a ghost is not in anybody way: no collision with its team-mates', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    dropPlayer(g, 2);
    b.x = a.x;
    b.y = a.y;
    const at = [a.x, a.y];
    run(g, 200);
    expect([a.x, a.y]).toEqual(at);
  });
  it('30 s: after 20 s the chef leaves, k is recomputed from that instant and the late phone watches', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 3000);
    const t0 = g.time;
    dropPlayer(g, 3);
    run(g, GHOST_MS - 300);
    expect(g.players.has(3)).toBe(true);
    expect(g.teams[1]!.k).toBe(1.22);
    run(g, 1000);
    expect(g.players.has(3)).toBe(false);
    expect(g.teams[1]!.k).toBe(1);
    expect(log.playerGone!.map((e) => e.p)).toEqual([{ player: 3, team: 0 }]);
    expect(log.teamK![0]!.t).toBeGreaterThan(t0 + GHOST_MS);
    expect(log.teamK![0]!.t).toBeLessThan(t0 + GHOST_MS + 100);
    run(g, 9000);
    expect(rejoinPlayer(g, 3)).toBe(false);
    expect(g.players.has(3)).toBe(false);
  });
  it('a team left with nobody pauses the clock; the host picks: continue (no winner) or end', () => {
    const play = () => {
      const m = mk([
        [1, 2],
        [3, 4],
      ]);
      run(m.g, 3000);
      dropPlayer(m.g, 3);
      dropPlayer(m.g, 4);
      run(m.g, GHOST_MS + 500);
      return m;
    };
    const { g, log } = play();
    expect(g.paused).toEqual({ teams: [1] });
    expect(log.matchPaused).toHaveLength(1);
    const frozen = g.time;
    run(g, 5000);
    expect(g.time).toBe(frozen);
    resolvePause(g, 'continue');
    expect(g.paused).toBeNull();
    expect(log.matchResumed).toHaveLength(1);
    run(g, 5000);
    expect(g.time).toBeGreaterThan(frozen);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1]);
    runUntil(g, () => g.over);
    expect(g.result).toMatchObject({ winner: null, aborted: false });
    const { g: h } = play();
    resolvePause(h, 'end');
    expect(h.over).toBe(true);
    expect(h.result).toMatchObject({ winner: null, aborted: true });
  });
});
