// The final star table (games/pizzas/sim/stars.ts) against the lobby's real configuration: the calibration tool plays what screen/match/round.ts startCoop plays, and the capable chefs earn 3 stars on the
// maps they can play (E2 is 0.6 x what they make on Carta larga; the classics sit well under them).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seriesRound } from '../carta-larga/bot';
import { lobbyExtra } from './lobby-config';
import { SERIES_MAPS } from '@pichi/game-pizzas/sim/maps';
import { roundRules } from '@pichi/game-pizzas/sim/midround';
import { E2, starThresholds } from '@pichi/game-pizzas/sim/stars';
import { recipeStarFactor } from '@pichi/game-pizzas/sim/recipes/stars';

describe('the star calibration plays the lobby configuration', () => {
  it('every option lobbyExtra passes is one startCoop passes (eventsV2, hazardsV3 and menuV2 included)', () => {
    const src = readFileSync(new URL('../../games/pizzas/screen/match/round.ts', import.meta.url), 'utf8');
    const { extra } = lobbyExtra('20', 'normal', true, 1);
    const spread = Object.keys(roundRules(undefined, 'normal')); // startCoop spreads roundRules
    for (const k of Object.keys(extra).filter((k) => !spread.includes(k))) expect(src, k).toMatch(new RegExp(`\\b${k}\\b`));
    for (const k of ['eventsV2', 'hazardsV3', 'menuV2']) expect(extra, k).toHaveProperty(k, true);
  });
  it('the capable chefs earn 3 stars on Carta larga maps 20-21 and classics 1-2 under the lobby configuration (Normal and Hard)', () => {
    for (const d of ['normal', 'hard'] as const)
      for (const id of ['1', '2', '20', '21']) {
        const series = SERIES_MAPS.some((s) => s.id === id);
        const g = seriesRound({ mapId: id, difficulty: d, n: 3, seed: 1, extra: lobbyExtra(id, d, series, 7932).extra });
        expect(g.score, `${id} ${d}`).toBeGreaterThanOrEqual(starThresholds(id, d, 3, recipeStarFactor(g))[2]);
      }
  });
  it('Hard never asks for more than Normal on a classic and no row is empty', () => {
    for (const [id, row] of Object.entries(E2)) {
      expect(row.easy, id).toBeGreaterThan(0);
      if (Number(id) <= 15) expect(row.hard, id).toBeLessThanOrEqual(row.normal);
    }
  });
});
