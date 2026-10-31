// QA versus 31-oct M1 and M2: a phone that came back after GHOST_MS found the mando without a chef; and in 2 contra 1 the pause
// stayed up although the lone chef was back. Now the chef sits down again in its own kitchen and the pause ends.
import { describe, expect, it } from 'vitest';
import { GHOST_MS } from '@pichi/core/lobby/teams';
import { Emitter, type GameEvents } from '../round/events';
import { TICK_MS, addPlayer, createGame, dropPlayer, rejoinPlayer, reseatPlayer, returnPlayer, tick, type Game } from '../overcooked';
import { MIRRORS, twinSpawns } from '../../test/golden/mirror-bot';

const V1 = MIRRORS.v1;
function mk(teams: number[][]) {
  const bus = new Emitter<GameEvents>();
  const log: string[] = [];
  for (const k of ['playerBack', 'matchPaused', 'matchResumed', 'teamK'] as const) bus.on(k, () => log.push(k));
  const g = createGame({
    rows: V1.rows,
    spawns: twinSpawns(V1.rows, V1.sigma, V1.half),
    difficulty: 'normal',
    seed: 5,
    bus,
    teams: teams.map((playerIds) => ({ playerIds })),
    handicap: true,
  });
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  return { g, log };
}
const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map());
};
const gone = (g: Game, id: number) => {
  run(g, 2000);
  dropPlayer(g, id);
  run(g, GHOST_MS + 1000);
};

describe('a phone back after the grace time sits down again', () => {
  it('returnPlayer (what the screen calls): inside the grace time it is the same chef, after it the chef sits down again', () => {
    const early = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(early.g, 2000);
    dropPlayer(early.g, 3);
    run(early.g, 5000);
    const body = early.g.players.get(3);
    expect(returnPlayer(early.g, 3, 2)).toBe(true);
    expect(early.g.players.get(3)).toBe(body); // not rebuilt: it kept its body, its place and what it learnt
    const late = mk([[1, 2], [3]]);
    gone(late.g, 3);
    expect(returnPlayer(late.g, 3, 2)).toBe(true);
    expect(late.g.players.has(3)).toBe(true);
    expect(late.g.paused).toBeNull();
    expect(returnPlayer(late.g, 3, 2)).toBe(false); // nothing left to restore
  });
  it('3 contra 2: the chef returns to its own kitchen, once, and k goes back with it', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    gone(g, 3);
    expect(g.players.has(3)).toBe(false);
    expect(g.teams[1]!.k).toBe(1);
    expect(rejoinPlayer(g, 3)).toBe(false); // too late for the old path: that one still says no
    expect(reseatPlayer(g, 3, 2)).toBe(true);
    expect(g.players.get(3)).toMatchObject({ team: 0, ghost: false, id: 3 });
    expect(g.roster.filter((r) => r.id === 3)).toEqual([{ id: 3, teamId: 0, droppedAt: null }]);
    run(g, 200);
    expect(g.teams[1]!.k).toBe(1.22);
    expect(log).toContain('playerBack');
    run(g, GHOST_MS + 1000); // and it does not leave again
    expect(g.players.has(3)).toBe(true);
    expect(reseatPlayer(g, 3, 2)).toBe(false); // already seated
  });
  it('2 contra 1: the pause for the empty team ends when the lone chef is back; the round has a winner again', () => {
    const { g, log } = mk([[1, 2], [3]]);
    gone(g, 3);
    expect(g.paused).toEqual({ teams: [1] });
    const frozen = g.time;
    run(g, 2000);
    expect(g.time).toBe(frozen);
    expect(reseatPlayer(g, 3, 2)).toBe(true);
    expect(g.paused).toBeNull();
    expect(log.filter((e) => e === 'matchResumed')).toHaveLength(1);
    expect(g.noWinner).toBeFalsy();
    run(g, 1000);
    expect(g.time).toBeGreaterThan(frozen);
    expect(g.paused).toBeNull(); // the pause does not come back
    expect(g.teams[1]!.k).toBe(1.41);
  });
  it('the pause stays while another team is still empty: only the team that is back stops waiting', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    run(g, 2000);
    dropPlayer(g, 1);
    dropPlayer(g, 2);
    dropPlayer(g, 3);
    dropPlayer(g, 4);
    run(g, GHOST_MS + 1000);
    expect(g.paused!.teams).toEqual([0, 1]);
    expect(reseatPlayer(g, 1, 0)).toBe(true);
    expect(g.paused).not.toBeNull();
    expect(reseatPlayer(g, 3, 0)).toBe(true);
    expect(g.paused).toBeNull();
  });
  it('a chef that never played this round (a newcomer, id 9) is not seated: it waits for the next round', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 1000);
    expect(addPlayer(g, 9, 5)).toBe(false);
    expect(reseatPlayer(g, 9, 5)).toBe(false);
    expect(g.players.has(9)).toBe(false);
  });
});
