// Manchazo in the lobby, as pure functions the screen and the tests share: how the connected players are split into teams, and whether the round can start.
// The screen owns the teams (the relay only reads config.teams); the round's handicap comes from their sizes when it starts, not from a flag.
import type { ModeSpec } from '@pichi/core/contract';
import { joinSmallestTeam, leaveTeams, makeTeams, validateTeamSetup, type TeamInfo } from '@pichi/core/lobby';

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The lobby's teams after the connected players changed. Before the first split (`teams` null or empty) they are dealt with the lobby seed. Later a dropped
 * player leaves its team and an arrival joins the smallest; while nobody moved a player by hand (`touched` false) the split is rebalanced keeping what the
 * sizes allow. Returns the same array when nothing changed. Null when the mode has no teams.
 */
export function syncTeams(
  mode: Pick<ModeSpec, 'teams'>,
  teams: readonly TeamInfo[] | null,
  ids: readonly number[],
  seed: number,
  touched: boolean,
): TeamInfo[] | null {
  const spec = mode.teams;
  if (!spec || spec.count[1] < 2) return null;
  const want = [...new Set(ids)];
  if (!teams?.length) return makeTeams(mode, want, seed);
  const have = teams.flatMap((t) => t.playerIds);
  if (sameSet(have, want)) return teams as TeamInfo[];
  if (!touched && want.length >= spec.count[0]) return makeTeams(mode, want, seed, teams);
  const gone = have.filter((id) => !want.includes(id));
  const left = gone.reduce((t, id) => leaveTeams(t, id), teams as readonly TeamInfo[]);
  return want.filter((id) => !have.includes(id)).reduce((t, id) => joinSmallestTeam(t, id), [...left]);
}

/** Why the round cannot start ('' when it can): fewer than 2 players (a lone player makes a single team), an empty team or a split past the mode's ratio. */
export function startProblem(mode: Pick<ModeSpec, 'players' | 'teams'>, teams: readonly Pick<TeamInfo, 'playerIds'>[] | null): string {
  if (!teams) return 'Faltan los equipos';
  const setup = validateTeamSetup(
    mode,
    teams.map((t) => t.playerIds),
  );
  return setup.ok ? '' : setup.problems[0]!;
}

export const teamSizes = (teams: readonly Pick<TeamInfo, 'playerIds'>[] | null | undefined): number[] => (teams ?? []).map((t) => t.playerIds.length);
