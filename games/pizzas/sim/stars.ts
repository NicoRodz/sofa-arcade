// R17: stars by map x difficulty x team size. The thresholds are data: E2[map][difficulty] is the score a decent pair makes on that
// map; E(N) grows less than linearly (congestion); 1, 2 and 3 stars are tune.starPct (35, 60, 85%) of E(N).
//
// Starting values, to be calibrated in playtest. E2 = orders in a round for 2 chefs (initial orders + round / interval) x value of
// a pizza served at half patience in a normal streak (base x 1.55; the base is 70 for a Marinara and 79 with 30% Margarita) x
// share a decent pair serves (easy .75, normal .65, hard .50) x map factor (1 star 1, 2 stars .9, 3 stars .8), rounded to 10.
//
// Rebased for HAZARD_V2 (events 2 on Normal / 3 on Hard, harder fire, rat and ice) under the rules a lobby round plays by default (roundRules): Normal and Hard rows = old row x (median score with HAZARD_V2 / without) of the
// scripted chefs, N = 2, same seeds; Easy keeps its rows (no events by default). Classics 1-15: tools/hazards/measure.ts score (golden chefs + firefighting, 120-400 seeds), measurable on maps 1, 2, 4, 7, 9, 11, 15
// (Normal x1.04-1.12, Hard x0.77-1.12); the other classics and E2_DEFAULT use the median ratio of those seven (Normal x1.078, Hard x0.933). Carta larga 20-28: tools/hazards/stars-calibrate.ts (carta-larga chefs, 30 seeds x nMin/mid/nMax,
// median of score / teamFactor). A row only moves when the ratio is off by 5% or more (the noise of the measure).
import type { Difficulty } from '@pichi/core/difficulty';
import { params, teamSize } from '@pichi/core/difficulty';

export const E2: Record<string, Record<Difficulty, number>> = {
  '1': { easy: 330, normal: 370, hard: 290 },
  '2': { easy: 330, normal: 350, hard: 280 },
  '3': { easy: 290, normal: 340, hard: 270 },
  '4': { easy: 290, normal: 340, hard: 220 },
  '5': { easy: 290, normal: 340, hard: 270 },
  '6': { easy: 330, normal: 380, hard: 310 },
  '7': { easy: 290, normal: 350, hard: 290 },
  '8': { easy: 330, normal: 380, hard: 310 },
  '9': { easy: 330, normal: 390, hard: 360 },
  '10': { easy: 330, normal: 390, hard: 310 },
  '11': { easy: 330, normal: 390, hard: 370 },
  '12': { easy: 330, normal: 390, hard: 310 },
  '13': { easy: 290, normal: 340, hard: 270 },
  '14': { easy: 290, normal: 340, hard: 270 },
  '15': { easy: 290, normal: 360, hard: 270 },
  // Carta larga (adaptive pacing, richer plates, ~200 points a pizza): normal = 0.6 x what the scripted chefs of tools/carta-larga/measure.ts make per teamFactor on 6 seeds (the
  // classics' 3 stars sit at 50-60% of that bot); easy / hard = 0.94 x normal as in the rows above, NOT measured. Maps 25-28 (bot with oven claims, hatch relay, sauce pot, casa upgrades and Bandeja; 3 seeds x nMin/mid/nMax) are each difficulty's own 0.6 x median of the bot. 26 is a floor: the bot does not make the Pizza blanca.
  '20': { easy: 1070, normal: 1020, hard: 910 },
  '21': { easy: 990, normal: 1050, hard: 820 },
  '22': { easy: 880, normal: 940, hard: 710 },
  '23': { easy: 730, normal: 670, hard: 630 },
  '24': { easy: 1020, normal: 1090, hard: 860 },
  '25': { easy: 730, normal: 1060, hard: 590 },
  '26': { easy: 280, normal: 370, hard: 420 },
  '27': { easy: 650, normal: 600, hard: 660 },
  '28': { easy: 660, normal: 690, hard: 440 },
};
// Generated maps ("random") and anything not in the table: a middle row (2 stars, a bit of Margarita).
export const E2_DEFAULT: Record<Difficulty, number> = { easy: 310, normal: 370, hard: 290 };

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
