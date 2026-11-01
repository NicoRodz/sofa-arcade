// R17: stars by map x difficulty x team size. The thresholds are data: E2[map][difficulty] is the score a decent pair makes on that
// map; E(N) grows less than linearly (congestion); 1, 2 and 3 stars are tune.starPct (35, 60, 85%) of E(N).
//
// Starting values, to be calibrated in playtest. E2 = orders in a round for 2 chefs (initial orders + round / interval) x value of
// a pizza served at half patience in a normal streak (base x 1.55; the base is 70 for a Marinara and 79 with 30% Margarita) x
// share a decent pair serves (easy .75, normal .65, hard .50) x map factor (1 star 1, 2 stars .9, 3 stars .8), rounded to 10.
//
// Rebased for HAZARD_V2 (PR #5), then again for the lobby's final configuration (patchMap, hazardsV3, eventsV2, menuV2; the `stars-final` PR) with tools/hazards/stars-calibrate.ts: the chefs of
// tools/carta-larga/bot.ts, 24 seeds x nMin/mid/nMax per map and difficulty, metric score / (teamFactor x card factor), the options of screen/match/round.ts startCoop.
//  - Carta larga 20-28: E2 = 0.6 x median(real), as before. Maps 26 (the bot does not reliably make the Pizza blanca: p25-p75 337-808 in Normal, not monotone across difficulties) and the 5% rule below keep the row.
//  - Classics 1-15 (E2 came from a formula, not from a bot): E2 = old x median(real) / median(base), base = the configuration of PR #5. Maps 1, 2, 4, 7, 8, 9, 11 are measurable; their per-map ratio is used
//    unless it is within the noise (90% bootstrap interval of the median) of the pooled median ratio (Easy x1.108, Normal x1.083, Hard x1.110), which 3, 5, 6 and E2_DEFAULT take (the bot never plays them).
//  - Classics are also capped by the test "3 stars are within reach" (70% of the orders at half patience): Easy 340, Normal 390 on maps 1-8 (no cheese); and Hard <= Normal.
//  - Maps 10, 12, 13, 14, 15 keep their rows: the bot does not knead (12: 0), does not avoid oil (with a janitor that wipes one tile every 1.5 s: 10/14/15 Hard score 60% of the base, 15 Normal is bimodal
//    by N, p25-p75 221-801) and has no gate job (13). Those 0.6 are the bot's limit, not the maps': lower them only with a playtest.
// A row only moves when the ratio is off by 5% or more (the noise of the measure).
import type { Difficulty } from '@pichi/core/difficulty';
import { params, teamSize } from '@pichi/core/difficulty';

export const E2: Record<string, Record<Difficulty, number>> = {
  '1': { easy: 340, normal: 390, hard: 320 },
  '2': { easy: 340, normal: 380, hard: 310 },
  '3': { easy: 320, normal: 370, hard: 300 },
  '4': { easy: 320, normal: 370, hard: 240 },
  '5': { easy: 320, normal: 370, hard: 300 },
  '6': { easy: 340, normal: 390, hard: 340 },
  '7': { easy: 320, normal: 380, hard: 370 },
  '8': { easy: 340, normal: 390, hard: 390 },
  '9': { easy: 330, normal: 420, hard: 400 },
  '10': { easy: 330, normal: 390, hard: 310 },
  '11': { easy: 330, normal: 390, hard: 390 },
  '12': { easy: 330, normal: 390, hard: 310 },
  '13': { easy: 290, normal: 340, hard: 270 },
  '14': { easy: 290, normal: 340, hard: 270 },
  '15': { easy: 290, normal: 360, hard: 270 },
  // Carta larga (adaptive pacing, richer plates, ~200 points a pizza): normal = 0.6 x what the scripted chefs of tools/carta-larga/measure.ts make per teamFactor on 6 seeds (the
  // classics' 3 stars sit at 50-60% of that bot); easy / hard = 0.94 x normal as in the rows above, NOT measured. Maps 25-28 (bot with oven claims, hatch relay, sauce pot, casa upgrades and Bandeja; 3 seeds x nMin/mid/nMax) are each difficulty's own 0.6 x median of the bot. 26 is a floor: the bot does not make the Pizza blanca.
  '20': { easy: 1070, normal: 1310, hard: 910 },
  '21': { easy: 690, normal: 1120, hard: 680 },
  '22': { easy: 720, normal: 1290, hard: 1070 },
  '23': { easy: 730, normal: 560, hard: 330 },
  '24': { easy: 840, normal: 1300, hard: 1080 },
  '25': { easy: 1080, normal: 1060, hard: 500 },
  '26': { easy: 280, normal: 370, hard: 420 },
  '27': { easy: 590, normal: 600, hard: 660 },
  '28': { easy: 660, normal: 620, hard: 520 },
};
// Generated maps ("random") and anything not in the table: a middle row (2 stars, a bit of Margarita).
export const E2_DEFAULT: Record<Difficulty, number> = { easy: 340, normal: 400, hard: 320 };

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
