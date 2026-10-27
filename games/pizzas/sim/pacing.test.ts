// Adaptive pacing: orders by the load of the queue (Carta larga), the old clock when it is off.
import { describe, expect, it } from 'vitest';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from './overcooked';
import { fixedMap } from './maps';
import { MIN_GAP_MS, loadOf, patienceMs, targetLoad } from './recipes/pacing';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const play = (adaptive: boolean, seconds: number, n = 2) => {
  const m = fixedMap('20')!;
  const g = createGame({ rows: m.rows, mapId: '20', recipes: true, adaptive, n, spawns: m.spawns, difficulty: 'normal', seed: 5 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  const seen: { t: number; load: number; open: number }[] = [];
  for (let t = 0; t < (seconds * 1000) / TICK_MS; t++) {
    tick(g, new Map([...g.players.keys()].map((id) => [id, idle])));
    if (t % 60 === 0) seen.push({ t: g.time, load: loadOf(g.teams[0]!), open: g.teams[0]!.orders.length });
  }
  return { g, seen };
};

describe('adaptive pacing', () => {
  it('keeps the load of an unserved queue near the target and never buries it: it stops asking when the queue is heavy', () => {
    const { g, seen } = play(true, 70);
    const target = targetLoad('normal', 2);
    const top = Math.max(...seen.map((s) => s.load));
    expect(top).toBeLessThan(target + 2.4); // one order over the target at most (the heaviest recipe is 2.3)
    expect(g.teams[0]!.orders.length).toBeGreaterThanOrEqual(2);
  });
  it('a new order waits at least the minimum gap after the last one', () => {
    const { g } = play(true, 30);
    expect(g.teams[0]!.nextOrderAt).toBeGreaterThanOrEqual(MIN_GAP_MS.normal);
  });
  it('off (the default): the old fixed clock, orders keep coming every orderEveryMs up to the queue limit', () => {
    const { g } = play(false, 70);
    expect(g.teams[0]!.orders.length).toBe(Math.min(g.params.maxOrders, g.teams[0]!.orderSeq));
  });
  it('the patience grows with the effort of the plate only when it is on', () => {
    const on = createGame({ adaptive: true }) as Game;
    const off = createGame({}) as Game;
    expect(patienceMs(on, 'marinara')).toBe(on.params.orderTtlMs);
    expect(patienceMs(on, 'pepqueso')).toBeCloseTo(on.params.orderTtlMs * 1.9);
    expect(patienceMs(off, 'pepqueso')).toBe(off.params.orderTtlMs);
  });
});
