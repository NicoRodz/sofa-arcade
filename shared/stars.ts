// R17: stars by map x difficulty x team size. The thresholds are data: E2[map][difficulty] is the score a decent pair makes on that
// map; E(N) grows less than linearly (congestion); 1, 2 and 3 stars are tune.starPct (35, 60, 85%) of E(N).
//
// Starting values, to be calibrated in playtest. E2 = orders in a round for 2 chefs (initial orders + round / interval) x value of
// a pizza served at half patience in a normal streak (base x 1.55; the base is 70 for a Marinara and 79 with 30% Margarita) x
// share a decent pair serves (easy .75, normal .65, hard .50) x map factor (1 star 1, 2 stars .9, 3 stars .8), rounded to 10.
import type { Difficulty } from './difficulty';
import { params, teamSize } from './difficulty';

export const E2: Record<string, Record<Difficulty, number>> = {
  '1': { easy: 330, normal: 350, hard: 330 },
  '2': { easy: 330, normal: 350, hard: 330 },
  '3': { easy: 290, normal: 320, hard: 290 },
  '4': { easy: 290, normal: 320, hard: 290 },
  '5': { easy: 290, normal: 320, hard: 290 },
  '6': { easy: 330, normal: 350, hard: 330 },
  '7': { easy: 290, normal: 320, hard: 290 },
  '8': { easy: 330, normal: 350, hard: 330 },
  '9': { easy: 330, normal: 360, hard: 330 },
  '10': { easy: 330, normal: 360, hard: 330 },
  '11': { easy: 330, normal: 360, hard: 330 },
  '12': { easy: 330, normal: 360, hard: 330 },
  '13': { easy: 290, normal: 320, hard: 290 },
  '14': { easy: 290, normal: 320, hard: 290 },
  '15': { easy: 290, normal: 320, hard: 290 },
};
// Generated maps ("random") and anything not in the table: a middle row (2 stars, a bit of Margarita).
export const E2_DEFAULT: Record<Difficulty, number> = { easy: 310, normal: 340, hard: 310 };

export const e2 = (mapId: string | undefined, d: Difficulty): number => (mapId !== undefined ? E2[mapId]?.[d] : undefined) ?? E2_DEFAULT[d];

// E(N) = E(2) * (1 + 0.4 (min(N, 4) - 2) + 0.15 max(N - 4, 0))
export const teamFactor = (n: number) => { const t = teamSize(n); return 1 + 0.4 * (Math.min(t, 4) - 2) + 0.15 * Math.max(t - 4, 0); };
export const expectedScore = (mapId: string | undefined, d: Difficulty, n: number): number => e2(mapId, d) * teamFactor(n);

export function starThresholds(mapId: string | undefined, d: Difficulty, n: number): [number, number, number] {
  const e = expectedScore(mapId, d, n);
  const [a, b, c] = params(d, n).tune.starPct;
  return [Math.round(e * a), Math.round(e * b), Math.round(e * c)];
}
export const stars = (mapId: string | undefined, d: Difficulty, n: number, score: number): number => starThresholds(mapId, d, n).filter((t) => score >= t).length;
