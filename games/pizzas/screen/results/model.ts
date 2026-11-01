// What Pizzas' results panel shows, as plain data (the round summary of a co-op game): the template (view.ts) only draws it.
import type { Summary } from '../../sim/scoring/results';

export interface StatView {
  cls: 'good' | 'gold' | 'bad';
  value: number;
  label: string;
}
export interface PodiumEntry {
  place: 1 | 2 | 3;
  slot: number;
  name: string;
  count: number;
  crown: boolean;
}
export interface SummaryView {
  starline: { next: number; missing: number } | null; // null: three stars already
  starlineTitle: string;
  stats: StatView[];
  podium: PodiumEntry[]; // left to right on the stage; empty when nobody delivered
}
export interface Ranked {
  slot: number;
  name: string;
  delivered: number;
}

export function summaryView(sum: Summary, ranked: readonly Ranked[]): SummaryView {
  const [t1, t2, t3] = sum.thresholds;
  const top = ranked.filter((r) => r.delivered > 0).slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  return {
    starline: sum.next === null ? null : { next: sum.thresholds[sum.stars]!, missing: sum.next },
    starlineTitle: `★ ${t1} · ★★ ${t2} · ★★★ ${t3}`,
    stats: [
      { cls: 'good', value: sum.delivered, label: 'Entregadas' },
      { cls: 'gold', value: sum.bestStreak, label: 'Mejor racha' },
      { cls: 'gold', value: sum.tips, label: 'En propinas' },
      { cls: 'bad', value: sum.expired + sum.rejected, label: 'Falladas' },
    ],
    podium: order.flatMap((i) => {
      const r = top[i];
      return r ? [{ place: (i + 1) as 1 | 2 | 3, slot: r.slot, name: r.name, count: r.delivered, crown: i === 0 }] : [];
    }),
  };
}

// Versus: the series line under the cards, or null when there is none yet.
export const seriesView = (line: string | null): string | null => line || null;
