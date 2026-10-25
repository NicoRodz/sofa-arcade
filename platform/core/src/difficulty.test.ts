import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, maxOrders, orderEveryMs, params } from './difficulty';

describe('order flow by team size', () => {
  it('Normal interval is 40 s / (0.6 + 0.2 N): 40, 28.6, 22.2 and 18.2 s for 2, 4, 6 and 8 players', () => {
    expect([2, 4, 6, 8].map((n) => orderEveryMs('normal', n))).toEqual(
      [40_000, 40_000 / 1.4, 40_000 / 1.8, 40_000 / 2.2].map((v) => expect.closeTo(v, 6)),
    );
  });
  it('Easy stretches the interval x1.25 and Hard shrinks it x0.8', () => {
    expect(orderEveryMs('easy', 2)).toBe(50_000);
    expect(orderEveryMs('hard', 2)).toBe(32_000);
  });
  it('queue is 2 + ceil(N/2): 3, 4, 4, 5, 5, 6, 6 for 2..8', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(maxOrders)).toEqual([3, 4, 4, 5, 5, 6, 6]);
  });
  it('initial orders, cheese share and plates follow the design bands', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map((n) => params('normal', n).initialOrders)).toEqual([1, 2, 2, 2, 2, 3, 3]);
    expect([2, 4, 6, 8].map((n) => params('normal', n).cheesePct)).toEqual([30, 40, 50, 60]);
    expect([2, 4, 6, 8].map((n) => params('normal', n).plates)).toEqual([3, 4, 5, 6]);
  });
});

describe('params', () => {
  it('keeps the base table for patience, cutting, cooking and penalty', () => {
    const [e, n, h] = DIFFICULTIES.map((d) => params(d, 2));
    expect([e!.orderTtlMs, n!.orderTtlMs, h!.orderTtlMs]).toEqual([90_000, 70_000, 55_000]);
    expect([e!.cutMs, n!.cutMs, h!.cutMs]).toEqual([1500, 2000, 2500]);
    expect([e!.cookMs, n!.cookMs, h!.cookMs]).toEqual([6000, 8000, 10_000]);
    expect([e!.penalty, n!.penalty, h!.penalty]).toEqual([0, -10, -20]);
    expect(e!.roundMs).toBe(180_000);
  });

  it('does not scale patience, cutting, cooking or penalty with the team', () => {
    for (const d of DIFFICULTIES) {
      const a = params(d, 2),
        b = params(d, 8);
      expect([b.orderTtlMs, b.cutMs, b.cookMs, b.penalty]).toEqual([a.orderTtlMs, a.cutMs, a.cookMs, a.penalty]);
    }
  });

  it('clamps the team size to 2..8', () => {
    expect(params('normal', 1)).toEqual(params('normal', 2));
    expect(params('normal', 20)).toEqual(params('normal', 8));
  });
});
