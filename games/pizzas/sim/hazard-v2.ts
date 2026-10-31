// HAZARD_V2 (design "¡Que salgan las pizzas!", tanda 1): the numbers of the harder hazards, one row per difficulty. Pure data and pure reads; nothing here draws from a stream.
// Each system reads its block only when its own flag is on (g.burn, g.magnet, g.surf, g.mid); the rounds without those flags keep the old constants to the bit.
// Fire sizes are a pure function of (seed, FIRE_SEED_TAG, local fire index k): the k-th fire of a kitchen has the same size in both kitchens of a versus match (mirror-safe).
import type { Difficulty } from '@pichi/core/difficulty';

export const FIRE_SEED_TAG = 0xf17e5eed;
export const EVENT_SCHEDULE_TAG = 0x5c4ed01e;

export interface FireParams {
  graceMs: number; // from ready to burnt
  delayMs: number; // from burnt to fire
  spreadMs: number;
  rings: number;
  smallMs: number; // chef-ms to put a small fire out
  smallCap: number; // chefs that add to a small fire
  bigPermil: number; // base chance of a big fire (per mille)
  bigMs: number;
  bigMin: number; // chefs at once for a big fire to progress
  bigCap: number;
  bigSpreadMs: number;
  bigRingsPlus: number;
  bigSoloDecay: number; // chef-ms lost per ms with fewer than bigMin chefs (0: the progress only pauses)
}
export interface RatParams {
  walk: number; // tiles/s
  alert: number; // tiles/s when a chef within alertTiles is closing in
  alertTiles: number;
  alertTurnDps: number;
  runMs: number;
  pauseMs: number;
  touchRadius: number;
  touchSpeed: number;
  scareRadius: number; // dash radius
  afterDashMs: number;
  afterRadius: number;
  dodgeCdMs: number;
  dodgeRange: number; // a dash that starts this close, in front, is dodged
  dodgeConeDeg: number; // full width of the cone
  dodgeTiles: number;
  dodgeMs: number;
  pantMs: number;
  pantSpeed: number; // fraction of the speed while panting
}
export interface IceParams {
  tauAccelMs: number;
  tauStopMs: number;
}
export interface EventParams {
  windows: readonly (readonly [number, number])[]; // fractions of the round: [from, to] of each event's start
  gapMs: number; // from the end of one event to the announce of the next
  blackoutMs: number;
}
export interface HazardParams {
  fire: FireParams;
  rat: RatParams;
  ice: IceParams;
  events: EventParams;
}

const rat = (
  walk: number,
  alert: number,
  turn: number,
  pause: number,
  tr: number,
  ts: number,
  dash: number,
  after: number,
  cd: number,
): RatParams => ({
  walk,
  alert,
  alertTiles: 3,
  alertTurnDps: turn,
  runMs: 1600,
  pauseMs: pause,
  touchRadius: tr,
  touchSpeed: ts,
  scareRadius: dash,
  afterDashMs: after === 1.3 ? 200 : after === 1.0 ? 150 : 200,
  afterRadius: after,
  dodgeCdMs: cd,
  dodgeRange: 2.5,
  dodgeConeDeg: 60,
  dodgeTiles: 1.2,
  dodgeMs: 200,
  pantMs: 600,
  pantSpeed: 0.5,
});
const fire = (
  graceMs: number,
  delayMs: number,
  spreadMs: number,
  rings: number,
  smallMs: number,
  bigPermil: number,
  bigMs: number,
  bigSpread: number,
): FireParams => ({
  graceMs,
  delayMs,
  spreadMs,
  rings,
  smallMs,
  smallCap: 2,
  bigPermil,
  bigMs,
  bigMin: 2,
  bigCap: 3,
  bigSpreadMs: bigSpread,
  bigRingsPlus: 1,
  bigSoloDecay: bigPermil >= 500 ? 0.5 : 0,
});
const ev = (w: readonly (readonly [number, number])[], blackoutMs: number): EventParams => ({ windows: w, gapMs: 30_000, blackoutMs });

export const HAZARD_V2: Record<Difficulty, HazardParams> = {
  easy: {
    fire: fire(15_000, 5000, 3000, 2, 3000, 0, 0, 3000), // Easy has no fire (burn.fireAllowed): the row only keeps the old numbers
    rat: rat(1.9, 2.8, 450, 600, 0.5, 2.0, 1.1, 1.3, 5000),
    ice: { tauAccelMs: 900, tauStopMs: 1000 },
    events: ev([[0.333, 0.667]], 10_000), // switched on by hand in Easy: one event, as before
  },
  normal: {
    fire: fire(8000, 5000, 2500, 3, 4000, 300, 8000, 2000),
    rat: rat(2.2, 3.4, 540, 400, 0.45, 2.5, 0.9, 1.1, 3000),
    ice: { tauAccelMs: 1100, tauStopMs: 1300 },
    events: ev(
      [
        [0.2, 0.4],
        [0.55, 0.75],
      ],
      12_000,
    ),
  },
  hard: {
    fire: fire(6000, 3000, 2000, 4, 5000, 500, 10_000, 1500),
    rat: rat(2.6, 3.8, 540, 300, 0.45, 3.0, 0.8, 1.0, 2000),
    ice: { tauAccelMs: 1300, tauStopMs: 1600 },
    events: ev(
      [
        [0.15, 0.3],
        [0.45, 0.6],
        [0.72, 0.85],
      ],
      15_000,
    ),
  },
};

/** The numbers for this difficulty and kitchen; `chefs` = chefs in the kitchen (the escalation by head count). */
export function hazardParams(d: Difficulty, chefs = 2): HazardParams {
  const base = HAZARD_V2[d];
  const extra = Math.max(0, chefs - 3) * 5; // +5 pp of big fire per chef above 3
  const dodge = Math.max(1500, base.rat.dodgeCdMs - Math.max(0, chefs - 2) * 250);
  return {
    ...base,
    fire: { ...base.fire, bigPermil: chefs <= 1 || base.fire.bigPermil === 0 ? 0 : Math.min(700, base.fire.bigPermil + extra * 10) },
    rat: { ...base.rat, dodgeCdMs: dodge },
  };
}

/** A 32-bit mix of three integers (murmur-style finaliser): the pure stand-in for a stream. */
export function hash32(a: number, b: number, c: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul((c | 0) + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Is the k-th fire of a kitchen a big one? Pure in (seed, k, chefs, difficulty); consumes no stream. */
export const fireIsBig = (seed: number, k: number, d: Difficulty, chefs: number, bigAllowed: boolean): boolean =>
  bigAllowed && hash32(seed >>> 0, FIRE_SEED_TAG, k) % 1000 < hazardParams(d, chefs).fire.bigPermil;
