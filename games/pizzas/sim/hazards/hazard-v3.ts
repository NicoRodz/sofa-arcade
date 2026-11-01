// HAZARD_V3 (design "¡Que salgan las pizzas!", tanda 2, PR-B): the numbers of the hazards that have to cost points, one row per difficulty. Pure data and pure reads, no stream.
// A round reads its row through `hz3Params(g)`: with the flag off (`g.hz3` false) that is LEGACY, the constants the modules had before, so the rounds without the flag are bit for bit what they were.
// Easy keeps LEGACY on purpose (the design: no punishments in Easy), except where the table below says otherwise. Ticks are 60 per second.
import type { Difficulty } from '@pichi/core';
import type { Game } from '../round/state';

export interface Hz3Params {
  penalty: number; // points lost per expired order (negative); 0 keeps the difficulty's own number
  oil: { dripEvery: number; wipeTicks: number; spillPatches: number; spillDry: number; dropOnSlip: boolean };
  sprinkler: { every: number; on: number; warn: number };
  belt: { period: number; warn: number };
  gate: { open: number; closed: number; warn: number; offset: number }; // offset: ticks between one timer door and the next (the doors of a map are staggered)
  bridge: { breaks: number; repair: number }; // repair: ticks a chef holds B in front of a broken bridge to mend it (0: it only mends itself)
  raft: { pause: number; cap: number }; // cap: chefs that fit on the raft tile (0: no limit)
  tray: { loses: boolean }; // a chef that slips on oil with a plate of the Bandeja loses the pizza instead of dropping it
  kneader: { solo: number }; // permil of a tick a lone chef gives (GOAL is 150 000)
  wood: { cap: number }; // ticks one full load of wood lasts (fuel decays by 1 per tick)
  heat: { recover: number };
  rat: { stealOnEscape: boolean };
  lossGapMs: number; // at most one lost item per hazard in this time (anti-frustration)
}

/** The numbers every module had before HAZARD_V3. */
export const LEGACY: Hz3Params = {
  penalty: 0,
  oil: { dripEvery: 720, wipeTicks: 60, spillPatches: 6, spillDry: 1800, dropOnSlip: false },
  sprinkler: { every: 1200, on: 120, warn: 0 },
  belt: { period: 1800, warn: 180 },
  gate: { open: 480, closed: 360, warn: 60, offset: 0 },
  bridge: { breaks: 6, repair: 0 },
  raft: { pause: 60, cap: 0 },
  tray: { loses: false },
  kneader: { solo: 350 },
  wood: { cap: 900 },
  heat: { recover: 3 },
  rat: { stealOnEscape: false },
  lossGapMs: 30_000,
};

const s = (sec: number) => Math.round(sec * 60);
export const HAZARD_V3: Record<Difficulty, Hz3Params> = {
  easy: LEGACY,
  normal: {
    penalty: -25,
    oil: { dripEvery: s(10), wipeTicks: s(1.5), spillPatches: 8, spillDry: s(40), dropOnSlip: false },
    sprinkler: { every: s(25), on: s(4), warn: s(2) },
    belt: { period: s(22), warn: s(3) },
    gate: { open: s(7), closed: s(6), warn: s(1), offset: s(3) },
    bridge: { breaks: 6, repair: s(2) },
    raft: { pause: s(1.5), cap: 2 },
    tray: { loses: false },
    kneader: { solo: Math.round(150_000 / s(9)) }, // 9 s alone
    wood: { cap: s(40) },
    heat: { recover: 3 }, // the table says +4; the module's own note says 4 makes the thermometer invisible (see the PR)
    rat: { stealOnEscape: true },
    lossGapMs: 30_000,
  },
  hard: {
    penalty: -40,
    oil: { dripEvery: s(8), wipeTicks: s(1.5), spillPatches: 10, spillDry: s(40), dropOnSlip: true },
    sprinkler: { every: s(25), on: s(4), warn: s(2) },
    belt: { period: s(16), warn: s(2) },
    gate: { open: s(6), closed: s(7), warn: s(1), offset: s(3) },
    bridge: { breaks: 4, repair: s(2) },
    raft: { pause: s(1.5), cap: 2 },
    tray: { loses: true },
    kneader: { solo: Math.round(150_000 / s(11)) }, // 11 s alone
    wood: { cap: s(30) },
    heat: { recover: 3 },
    rat: { stealOnEscape: true },
    lossGapMs: 30_000,
  },
};

/** The row this round runs with: HAZARD_V3[difficulty] when the round has the flag, else the legacy constants. */
export const hz3Params = (g: Game): Hz3Params => (g.hz3 ? HAZARD_V3[g.difficulty] : LEGACY);
