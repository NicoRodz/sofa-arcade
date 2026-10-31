// The "Ayudante" profile (council M3 / M11): a per-player option, chosen from the player's own phone in the lobby, that makes the kitchen
// easier for ONE chef without touching anyone else's. Pure constants and rules; the sim reads them only for a chef whose `assist` flag is set,
// so a round with nobody on Ayudante runs exactly as before (the coop golden rounds and the mirror proof pin that).
//
// What it gives (all of it behind the flag, see round/targeting.ts and round/chef.ts):
//  - reach x1.5 and auto-aim: A / B work on the NEAREST usable station within the bigger radius, and the chef turns to it by itself (auto-grab)
//  - no inertia: the stick moves the chef at once (the 'normal' difficulty smooths the speed; this chef never feels that)
//  - one-tap chopping: a tap of B starts the cut / the wash and it goes on while the chef stays at the station (the stick pulling away, or the item done, ends it)
//  - immune to the banana-skin (the catapult's rubbish): never slips
//  - a propeller beanie on screen, so the rest of the table SEES the help (the screen draws it, the lobby lists it)
//
// The numbers below are first guesses from the council's design notes. NOT calibrated: no human has played with them yet.
import type { ModeSpec } from '@pichi/core/contract';
import {
  GHOST_MS,
  matchStatus as baseMatchStatus,
  teamMultipliers as baseTeamMultipliers,
  validateTeamSetup as baseValidateTeamSetup,
  type BiasOf,
  type MatchStatus,
  type RosterEntry,
  type TeamId,
  type TeamSetup,
} from '@pichi/core/lobby/teams';
export const ASSIST_REACH_MULT = 1.5; // interaction radius, times the normal one (REACH + REACH_SLACK)
export const ASSIST_FACING_BONUS = 0.4; // tiles: the station the chef faces counts this much nearer (and the one behind it this much farther): what the player steers towards is not overridden by a neighbour that is merely a bit closer
export const ASSIST_STICK_CANCEL = 0.3; // stick deflection from which a one-tap chop gives way to walking (unless the stick pushes INTO the station: that is not walking away)
export const ASSIST_WEIGHT = 0.7; // versus: an Ayudante chef counts as this much of a chef when the handicap k is worked out (TO CALIBRATE)
export const ASSIST_IMMUNITY_K = 0.05; // versus: each Ayudante takes this off its team's k, the price of never slipping (TO CALIBRATE)

/** Chefs of a team that count for the handicap: Ayudantes weigh ASSIST_WEIGHT each. With none this is exactly `n`. */
export const effectiveChefs = (n: number, assists: number) => n - assists * (1 - ASSIST_WEIGHT);

// --- The team handicap with Ayudante: core/lobby/teams stays game-free and takes this correction as a parameter. Each Ayudante weighs ASSIST_WEIGHT of a chef
// and takes ASSIST_IMMUNITY_K off its team's k; with none, every number is what the platform alone gives.
/** `assists`: the Ayudante chefs of each team, same order as `counts`. */
export const ayudanteBias: BiasOf = (assists, counts) =>
  assists.some((a) => a > 0)
    ? { effective: counts.map((c, i) => effectiveChefs(c, assists[i] ?? 0)), discount: assists.map((a) => ASSIST_IMMUNITY_K * a) }
    : undefined;

export const teamMultipliers = (counts: readonly number[], maxRatio?: number, assists?: readonly number[]): number[] | null =>
  baseTeamMultipliers(counts, maxRatio, assists && ayudanteBias(assists, counts));

export const validateTeamSetup = (
  mode: Pick<ModeSpec, 'players' | 'teams'>,
  teams: readonly (readonly number[])[],
  assist?: ReadonlySet<number>,
): TeamSetup => baseValidateTeamSetup(mode, teams, assist, ayudanteBias);

export const matchStatus = (
  teamIds: readonly TeamId[],
  roster: readonly RosterEntry[],
  now: number,
  handicap: Parameters<typeof baseMatchStatus>[3],
  graceMs = GHOST_MS,
): MatchStatus => baseMatchStatus(teamIds, roster, now, handicap, graceMs, ayudanteBias);
