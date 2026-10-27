// R17: stars by map x difficulty x team size. The thresholds are data: E2[map][difficulty] is the score a decent pair makes on that
// map; E(N) grows less than linearly (congestion); 1, 2 and 3 stars are tune.starPct (35, 60, 85%) of E(N).
//
// Starting values, to be calibrated in playtest. E2 = orders in a round for 2 chefs (initial orders + round / interval) x value of
// a pizza served at half patience in a normal streak (base x 1.55; the base is 70 for a Marinara and 79 with 30% Margarita) x
// share a decent pair serves (easy .75, normal .65, hard .50) x map factor (1 star 1, 2 stars .9, 3 stars .8), rounded to 10.
import type { Difficulty } from '@pichi/core/difficulty';
import { params, teamSize } from '@pichi/core/difficulty';

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
  // Carta larga (adaptive pacing, richer plates, ~200 points a pizza): normal = 0.6 x what the scripted chefs of tools/carta-larga/measure.ts make per teamFactor on 6 seeds (the
  // classics' 3 stars sit at 50-60% of that bot); easy / hard = 0.94 x normal as in the rows above, NOT measured. Maps 25-28 (bot with oven claims, hatch relay, sauce pot, casa upgrades and Bandeja; 3 seeds x nMin/mid/nMax) are each difficulty's own 0.6 x median of the bot. 26 is a floor: the bot does not make the Pizza blanca.
  '20': { easy: 1070, normal: 1140, hard: 1070 },
  '21': { easy: 990, normal: 1050, hard: 990 },
  '22': { easy: 880, normal: 940, hard: 880 },
  '23': { easy: 730, normal: 780, hard: 730 },
  '24': { easy: 1020, normal: 1090, hard: 1020 },
  '25': { easy: 730, normal: 1140, hard: 660 },
  '26': { easy: 280, normal: 400, hard: 520 },
  '27': { easy: 650, normal: 600, hard: 660 },
  '28': { easy: 660, normal: 690, hard: 460 },
};
// Generated maps ("random") and anything not in the table: a middle row (2 stars, a bit of Margarita).
export const E2_DEFAULT: Record<Difficulty, number> = { easy: 310, normal: 340, hard: 310 };

export const e2 = (mapId: string | undefined, d: Difficulty): number => (mapId !== undefined ? E2[mapId]?.[d] : undefined) ?? E2_DEFAULT[d];

// E(N) = E(2) * (1 + 0.4 (min(N, 4) - 2) + 0.15 max(N - 4, 0))
export const teamFactor = (n: number) => {
  const t = teamSize(n);
  return 1 + 0.4 * (Math.min(t, 4) - 2) + 0.15 * Math.max(t - 4, 0);
};
// `factor`: 1 for every round without a card (table version 1); the card's factor (recipes/stars.ts) for table version 2
export const expectedScore = (mapId: string | undefined, d: Difficulty, n: number, factor = 1): number =>
  e2(mapId, d) * teamFactor(n) * factor;

export function starThresholds(mapId: string | undefined, d: Difficulty, n: number, factor = 1): [number, number, number] {
  const e = expectedScore(mapId, d, n, factor);
  const [a, b, c] = params(d, n).tune.starPct;
  return [Math.round(e * a), Math.round(e * b), Math.round(e * c)];
}
export const stars = (mapId: string | undefined, d: Difficulty, n: number, score: number, factor = 1): number =>
  starThresholds(mapId, d, n, factor).filter((t) => score >= t).length;
