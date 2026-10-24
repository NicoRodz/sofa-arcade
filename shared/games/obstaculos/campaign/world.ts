// Per-world numbers for 2 players live in S1's sim/campaign.ts (campaignParams, WORLD_TABLE: N=2 frozen by its test); this file only adds what the
// level side needs. D is the metric's own scale (0..100); S1's band is the plan's 0..1, so it is multiplied by 100 here.
import { campaignParams, WORLD_ORDER, type WorldId } from '../sim/campaign';

export { WORLD_ORDER, type WorldId };
export const WORLD_NAME: Record<WorldId, string> = { beach: 'Playa', forest: 'Bosque', glacier: 'Glaciar', mine: 'Mina', volcano: 'Volcán', summit: 'Cumbres' };

export const bandOf = (w: WorldId): readonly [number, number] => { const b = campaignParams(2, w).band; return [Math.round(b[0] * 100), Math.round(b[1] * 100)]; };
// The metric is an estimate (its Spearman calibration is >= 0.7, not 1): a level is "in band" within this many points of the band's edges.
export const BAND_SLACK = 5;
export const inBand = (w: WorldId, d: number): boolean => { const [lo, hi] = bandOf(w); return d >= lo - BAND_SLACK && d <= hi + BAND_SLACK; };
export const checkpointEverySec = (w: WorldId): number => campaignParams(2, w).checkpointEverySec;

// Hints (plan §2): a bubble of at most 6 words, at most 2 per level, none in levels 6 and 7 of a world.
export const HINT_MAX_WORDS = 6;
export const HINT_MAX_PER_LEVEL = 2;
export const HINT_FREE_FROM = 6;
