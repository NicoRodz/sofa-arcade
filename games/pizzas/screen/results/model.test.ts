import { describe, expect, it } from 'vitest';
import type { Summary } from '../../sim/scoring/results';
import { seriesView, summaryView } from './model';

const sum: Summary = {
  score: 260,
  stars: 1,
  thresholds: [195, 335, 450],
  next: 75,
  delivered: 9,
  expired: 2,
  rejected: 1,
  tips: 40,
  bestStreak: 4,
  table: 1,
};
const r = (slot: number, delivered: number) => ({ slot, name: `J${slot}`, delivered });

describe('Pizzas results view model', () => {
  it('starline: the next threshold and what is missing; null with three stars', () => {
    expect(summaryView(sum, []).starline).toEqual({ next: 335, missing: 75 });
    expect(summaryView({ ...sum, stars: 3, next: null }, []).starline).toBeNull();
    expect(summaryView(sum, []).starlineTitle).toBe('★ 195 · ★★ 335 · ★★★ 450');
  });
  it('stats: four tiles in order, "Falladas" adds expired and rejected', () => {
    expect(summaryView(sum, []).stats).toEqual([
      { cls: 'good', value: 9, label: 'Entregadas' },
      { cls: 'gold', value: 4, label: 'Mejor racha' },
      { cls: 'gold', value: 40, label: 'En propinas' },
      { cls: 'bad', value: 3, label: 'Falladas' },
    ]);
  });
  it('podium: 2nd, 1st, 3rd left to right; the crown only on the first', () => {
    const p = summaryView(sum, [r(0, 5), r(1, 3), r(2, 1), r(3, 0)]).podium;
    expect(p.map((e) => [e.place, e.slot, e.crown])).toEqual([
      [2, 1, false],
      [1, 0, true],
      [3, 2, false],
    ]);
  });
  it('podium: two deliverers -> 2nd, 1st; one -> just the winner; none -> empty (chefs with 0 do not climb)', () => {
    expect(summaryView(sum, [r(0, 5), r(1, 3), r(2, 0)]).podium.map((e) => e.place)).toEqual([2, 1]);
    expect(summaryView(sum, [r(4, 2), r(1, 0)]).podium.map((e) => e.place)).toEqual([1]);
    expect(summaryView(sum, [r(0, 0)]).podium).toEqual([]);
  });
  it('series line: null when empty', () => {
    expect(seriesView('')).toBeNull();
    expect(seriesView('Picantes 1–0 Frescos')).toBe('Picantes 1–0 Frescos');
  });
});
