// Can the lobby's split start at all? The lobby greys every map a team does not fit (versusMapStatus); when that leaves no map,
// the round must not start on a fallback map the screen just said does not work: it says why and what to do (5 contra 3 in a lobby of 8).
import type { ModeSpec } from '@pichi/core/contract';
import { balanceTeams, type TeamInfo } from '@pichi/core/lobby';
import { lobbySetup, teamSizes, versusLobbyMaps } from './lobby';

/** '' when some versus map fits these team sizes; else the lobby text that names the problem and the split that works. */
export function noMapFits(sizes: readonly number[]): string {
  if (versusLobbyMaps(sizes).some((x) => x.status.state === 'recommended')) return '';
  const total = sizes.reduce((a, b) => a + b, 0);
  const even = balanceTeams(
    Array.from({ length: total }, (_v, i) => i + 1),
    sizes.length,
    0,
  ).map((t) => t.length);
  return `${sizes.join(' contra ')}: ningún mapa tiene lugar para tantos en una cocina. Pasen a ${even.join(' contra ')}`;
}

/** Why a versus lobby cannot start ('' when it can): an illegal split first, then a split no map has room for. */
export function versusStartProblem(
  mode: Pick<ModeSpec, 'players' | 'teams'>,
  teams: readonly TeamInfo[] | null,
  assist?: ReadonlySet<number>,
): string {
  const s = lobbySetup(mode, teams, assist);
  return s.ok ? noMapFits(teamSizes(teams)) : s.problems[0]!;
}
