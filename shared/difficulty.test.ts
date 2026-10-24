import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, params, pressure, starThresholds, stars } from './difficulty';

describe('pressure f(N)', () => {
  it('is 1.0 / 1.4 / 1.8 / 2.0 for 2 / 4 / 6 / 8 players', () => {
    expect([2, 4, 6, 7, 8].map(pressure)).toEqual([1, 1.4, 1.8, 2, 2].map((v) => expect.closeTo(v, 9)));
  });
});

describe('params', () => {
  it('matches the base table with 2 players', () => {
    const [e, n, h] = DIFFICULTIES.map((d) => params(d, 2));
    expect([e!.orderTtlMs, n!.orderTtlMs, h!.orderTtlMs]).toEqual([90_000, 70_000, 55_000]);
    expect([e!.orderEveryMs, n!.orderEveryMs, h!.orderEveryMs]).toEqual([30_000, 22_000, 16_000]);
    expect([e!.maxOrders, n!.maxOrders, h!.maxOrders]).toEqual([3, 4, 5]);
    expect([e!.initialOrders, n!.initialOrders, h!.initialOrders]).toEqual([1, 1, 2]);
    expect([e!.cutMs, n!.cutMs, h!.cutMs]).toEqual([1500, 2000, 2500]);
    expect([e!.cookMs, n!.cookMs, h!.cookMs]).toEqual([6000, 8000, 10_000]);
    expect([e!.tipMax, n!.tipMax, h!.tipMax]).toEqual([10, 8, 6]);
    expect([e!.penalty, n!.penalty, h!.penalty]).toEqual([0, -10, -20]);
    expect([e!.roundMs, e!.reward]).toEqual([180_000, 20]);
  });

  it('scales the interval by f(N) and the queue by floor((N-2)/2) with 4 and 8 players', () => {
    expect(params('normal', 4).orderEveryMs).toBeCloseTo(22_000 / 1.4, 6);
    expect(params('normal', 4).maxOrders).toBe(5);
    expect(params('hard', 8).orderEveryMs).toBe(8000);
    expect(params('hard', 8).maxOrders).toBe(8);
    expect(params('easy', 3).maxOrders).toBe(3);
  });

  it('does not scale patience, cutting, cooking or penalty', () => {
    for (const d of DIFFICULTIES) {
      const a = params(d, 2), b = params(d, 8);
      expect([b.orderTtlMs, b.cutMs, b.cookMs, b.penalty]).toEqual([a.orderTtlMs, a.cutMs, a.cookMs, a.penalty]);
    }
  });

  it('clamps the team size to 2..8', () => {
    expect(params('normal', 1)).toEqual(params('normal', 2));
    expect(params('normal', 20)).toEqual(params('normal', 8));
  });
});

describe('stars', () => {
  it('thresholds follow k * 25 * (180 / interval)', () => {
    expect(starThresholds('normal', 2)).toEqual([82, 133, 174]); // 25 * 180/22 = 204.5
    expect(stars('normal', 2, 81)).toBe(0);
    expect(stars('normal', 2, 82)).toBe(1);
    expect(stars('normal', 2, 200)).toBe(3);
  });
});
