import { describe, expect, it } from 'vitest';
import { checkGame } from '@pichi/core/testkit';
import { modeOf } from '@pichi/core/contract';
import { makeTeams, teamOf, type TeamInfo } from '@pichi/core/lobby';
import { arenaController } from '../controller';
import { arenaManifest, TEAM_STYLES } from '../manifest';
import { arenaProtocol } from '../protocol';
import { handicap, startProblem, syncTeams, teamSizes } from '../sim';

const mode = modeOf(arenaManifest, 'versus');
const ids = (n: number) => Array.from({ length: n }, (_v, i) => i + 10);

describe('Arena declares Manchazo: orange against blue, 2 to 8 players', () => {
  it('the ModeSpec: players [2,8], two teams, the game decides the handicap, the styles tell the teams apart by glyph', () => {
    expect(mode.players).toEqual([2, 8]);
    expect(mode.teams).toMatchObject({ count: [2, 2], handicap: 'game', styles: TEAM_STYLES });
    expect(new Set(TEAM_STYLES.map((t) => t.icon)).size).toBe(2);
    expect(arenaManifest.defaultMode).toBe('versus');
    expect(checkGame({ manifest: arenaManifest, protocol: arenaProtocol, controller: arenaController })).toEqual([]);
  });
  it('button 1 is the pinata on the phone', () => {
    expect(mode.controls?.btn1).toEqual({ label: 'Piñata', icon: 'star' });
  });
  it.each([2, 3, 5, 7, 8])('%i players: two teams with the styles, sizes differ by at most one, every start is legal', (n) => {
    const teams = syncTeams(mode, null, ids(n), 7, false)!;
    expect(teams.map((t) => t.name)).toEqual(['Naranja', 'Azul']);
    const [a, b] = teamSizes(teams) as [number, number];
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    expect(a + b).toBe(n);
    expect(startProblem(mode, teams)).toBe('');
  });
  it('1 player cannot start, and neither can 0, an empty team or a split past 4 to 1', () => {
    const one = syncTeams(mode, null, ids(1), 7, false)!;
    expect(startProblem(mode, one)).not.toBe('');
    expect(startProblem(mode, null)).not.toBe('');
    expect(startProblem(mode, [{ playerIds: ids(2) }, { playerIds: [] }])).toMatch(/vacío/);
    expect(startProblem(mode, [{ playerIds: ids(5) }, { playerIds: [99] }])).toMatch(/desiguales/);
    expect(startProblem(mode, [{ playerIds: ids(4) }, { playerIds: [99] }])).toBe('');
  });
  it('a rematch keeps the teams; somebody arriving joins the smallest, somebody leaving leaves their team', () => {
    const first = syncTeams(mode, null, ids(4), 3, false)!;
    expect(makeTeams(mode, ids(4), 99, first)!.map((t) => t.playerIds)).toEqual(first.map((t) => t.playerIds));
    const moved = first.map((t, i): TeamInfo => ({ ...t, playerIds: i === 0 ? [10, 11, 12] : [13] }));
    const joined = syncTeams(mode, moved, [...ids(4), 14], 3, true)!;
    expect(teamSizes(joined)).toEqual([3, 2]);
    const left = syncTeams(mode, joined, [10, 11, 13, 14], 3, true)!;
    expect(teamOf(left, 12)).toBeUndefined();
    expect(teamSizes(left)).toEqual([2, 2]);
    expect(syncTeams(mode, left, [10, 11, 13, 14], 3, true)).toBe(left); // nothing changed: the same array
  });
  it('the handicap comes from the team sizes: radius +1 and one reserve pinata per missing player', () => {
    expect(handicap([4, 1])).toEqual({ radius: [2, 3], reserve: [0, 3] });
    expect(handicap([3, 4])).toEqual({ radius: [3, 2], reserve: [1, 0] });
  });
});
