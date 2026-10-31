import { describe, expect, it } from 'vitest';
import { GAMES } from '@pichi/catalog';
import { modeOf, type ModeSpec } from '@pichi/core/contract';
import {
  GHOST_MS,
  balanceTeams,
  compareTeams,
  handicapK,
  holdsPlace,
  joinSmallestTeam,
  leaveTeams,
  makeTeams,
  matchStatus,
  modeAvailability,
  movePlayer,
  pauseOutcome,
  rankTeams,
  reshuffleTeams,
  teamMultipliers,
  teamOf,
  validateTeamSetup,
  type RosterEntry,
  type TeamInfo,
  type TeamResult,
} from './teams';

const pizzas = GAMES[0];
const coop = modeOf(pizzas, 'coop') as ModeSpec;
const versus = modeOf(pizzas, 'versus') as ModeSpec;
const ids = (n: number) => Array.from({ length: n }, (_v, i) => i + 1);
const sizes = (t: readonly (readonly number[])[]) => t.map((x) => x.length);

describe('balanceTeams', () => {
  for (let n = 2; n <= 8; n++) {
    it(`N=${n}: two teams that differ by at most one, every player exactly once`, () => {
      const t = balanceTeams(ids(n), 2, 7);
      expect(t).toHaveLength(2);
      expect(Math.abs(t[0]!.length - t[1]!.length)).toBeLessThanOrEqual(1);
      expect(t.flat().sort((a, b) => a - b)).toEqual(ids(n));
    });
  }
  it('N=3..8 into 3 or 4 teams stays even too, and coop (one team) holds everybody', () => {
    for (let n = 3; n <= 8; n++) {
      const s = sizes(balanceTeams(ids(n), 3, 1));
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    }
    for (let n = 4; n <= 8; n++) {
      const s = sizes(balanceTeams(ids(n), 4, 1));
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    }
    expect(balanceTeams(ids(6), 1, 1)).toEqual([ids(6)]);
  });
  it('is deterministic by seed, independent of the order the ids arrive in, and different seeds deal differently', () => {
    expect(balanceTeams(ids(6), 2, 42)).toEqual(balanceTeams(ids(6), 2, 42));
    expect(balanceTeams([6, 2, 5, 1, 4, 3], 2, 42)).toEqual(balanceTeams(ids(6), 2, 42));
    const deals = new Set(Array.from({ length: 20 }, (_v, seed) => JSON.stringify(balanceTeams(ids(6), 2, seed))));
    expect(deals.size).toBeGreaterThan(3);
  });
  it('a rematch keeps the previous teams when the sizes allow, and fills in newcomers where there is room', () => {
    const prev = [
      [1, 2, 5],
      [3, 4, 6],
    ];
    for (let seed = 0; seed < 10; seed++) expect(balanceTeams(ids(6), 2, seed, prev)).toEqual(prev);
    // 7 players now (7 is new): the team that was bigger keeps the extra seat only if it had one
    for (let seed = 0; seed < 10; seed++) {
      const t = balanceTeams(ids(7), 2, seed, prev);
      expect(sizes(t).sort()).toEqual([3, 4]);
      expect(t.some((x) => prev[0]!.every((p) => x.includes(p)))).toBe(true);
      expect(t.some((x) => prev[1]!.every((p) => x.includes(p)))).toBe(true);
    }
    // one of them left: the rest stay, and the teams are rebalanced by moving only whoever must move
    const t = balanceTeams([1, 2, 3, 4], 2, 3, [
      [1, 2, 5],
      [3, 4],
    ]);
    expect(sizes(t)).toEqual([2, 2]);
    expect(t.map((x) => x.join())).toEqual(['1,2', '3,4']);
  });
  it('refuses a team that would be empty', () => {
    expect(() => balanceTeams([1], 2, 1)).toThrow(RangeError);
    expect(() => balanceTeams(ids(3), 0, 1)).toThrow(RangeError);
  });
});

describe('handicapK', () => {
  it('matches the design table: 1 for even teams, sqrt(rival/own) for the smaller one', () => {
    expect(handicapK(1, 1)).toBe(1);
    expect(handicapK(2, 2)).toBe(1);
    expect(handicapK(3, 3)).toBe(1);
    expect(handicapK(1, 2)).toBe(1.41);
    expect(handicapK(2, 3)).toBe(1.22);
    expect(handicapK(3, 4)).toBe(1.15);
  });
  it('the bigger team never gets a bonus', () => {
    expect(handicapK(2, 1)).toBe(1);
    expect(handicapK(3, 2)).toBe(1);
    expect(handicapK(4, 3)).toBe(1);
  });
  it('rejects 3v1 (ratio above 2) in both directions, and an empty team', () => {
    expect(handicapK(1, 3)).toBeNull();
    expect(handicapK(3, 1)).toBeNull();
    expect(handicapK(1, 4)).toBeNull();
    expect(handicapK(0, 2)).toBeNull();
    expect(handicapK(2, 0)).toBeNull();
    expect(handicapK(2, 4)).toBe(1.41); // ratio exactly 2 is allowed
    expect(handicapK(1, 3, Infinity)).toBe(1.73); // in-game, after drops, the same maths without the refusal
  });
  it('teamMultipliers measures every team against the biggest and is refused as a whole', () => {
    expect(teamMultipliers([3, 2])).toEqual([1, 1.22]);
    expect(teamMultipliers([3, 3])).toEqual([1, 1]);
    expect(teamMultipliers([2, 4, 4])).toEqual([1.41, 1, 1]);
    expect(teamMultipliers([3, 1])).toBeNull();
    expect(teamMultipliers([3, 1], Infinity)).toEqual([1, 1.73]);
  });
});

describe('mode availability and team setup', () => {
  it('a mode outside its player range says why', () => {
    expect(modeAvailability(versus, 1)).toEqual({ ok: false, reason: 'Hay 1 jugador: necesita al menos 2' });
    expect(modeAvailability(versus, 9)).toEqual({ ok: false, reason: 'Hay 9 jugadores: admite hasta 8' });
    for (let n = 2; n <= 8; n++) expect(modeAvailability(versus, n)).toEqual({ ok: true });
  });
  it('accepts every balanced versus split from 2 to 8 players, with k for the smaller side', () => {
    const want: Record<number, number[]> = { 2: [1, 1], 3: [1.41, 1], 4: [1, 1], 5: [1.22, 1], 6: [1, 1], 7: [1.15, 1], 8: [1, 1] };
    for (let n = 2; n <= 8; n++) {
      const split = balanceTeams(ids(n), 2, 1);
      const v = validateTeamSetup(versus, split);
      expect(v.problems, `N=${n}`).toEqual([]);
      const small = split[0]!.length < split[1]!.length ? 0 : 1;
      const k = [...v.k];
      if (small === 1) k.reverse();
      expect(
        k.sort((a, b) => b - a),
        `N=${n}`,
      ).toEqual(want[n]!.slice().sort((a, b) => b - a));
    }
  });
  it('refuses 3v1, an empty team, a wrong team count, a duplicated player and a crowd', () => {
    expect(validateTeamSetup(versus, [[1, 2, 3], [4]])).toMatchObject({ ok: false, problems: [expect.stringContaining('desiguales')] });
    expect(validateTeamSetup(versus, [[1, 2], []]).problems).toContain('Hay un equipo vacío');
    expect(validateTeamSetup(versus, [[1, 2, 3, 4]]).problems).toContain('Hacen falta 2 equipos');
    expect(
      validateTeamSetup(versus, [
        [1, 2],
        [2, 3],
      ]).problems,
    ).toContain('Un jugador está en dos equipos');
    expect(validateTeamSetup(versus, [ids(5), [6, 7, 8, 9, 10]]).ok).toBe(false);
  });
  it('coop is one team with everybody and no handicap; a mode without teams takes none', () => {
    expect(validateTeamSetup(coop, [ids(6)])).toEqual({ ok: true, problems: [], k: [1] });
    expect(validateTeamSetup(coop, [[1], [2]]).ok).toBe(false);
    const ffa: Pick<ModeSpec, 'players'> = { players: [2, 8] };
    expect(validateTeamSetup(ffa, []).problems).toEqual(['Hay 0 jugadores: necesita al menos 2']); // no team complaint, only the player range
    expect(validateTeamSetup(ffa, [[1, 2]]).problems).toContain('El modo no usa equipos');
  });
});

describe('team lists', () => {
  it('coop gives a single team with every player; versus two styled teams; a mode without teams none', () => {
    const c = makeTeams(coop, ids(6), 9)!;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 0, name: 'Equipo', playerIds: ids(6) });
    const v = makeTeams(versus, ids(6), 9)!;
    expect(v.map((t) => t.name)).toEqual(['Picantes', 'Frescos']);
    expect(sizes(v.map((t) => t.playerIds))).toEqual([3, 3]);
    expect(makeTeams({ teams: undefined }, ids(4), 9)).toBeNull();
    expect(makeTeams(versus, [], 9)!.map((t) => t.playerIds)).toEqual([[], []]);
    expect(makeTeams(versus, [1], 9)!.map((t) => t.playerIds.length)).toEqual([1]); // not enough for two: the start check refuses it
  });
  it('a rematch with the previous teams keeps them', () => {
    const first = makeTeams(versus, ids(5), 1)!;
    for (let seed = 2; seed < 8; seed++)
      expect(makeTeams(versus, ids(5), seed, first)!.map((t) => t.playerIds)).toEqual(first.map((t) => t.playerIds));
  });
  it('someone who enters goes to the smallest team (the lowest id on a tie), and only once', () => {
    const t = makeTeams(versus, ids(3), 1)!;
    const smaller = t.find((x) => x.playerIds.length === 1)!;
    const joined = joinSmallestTeam(t, 9);
    expect(teamOf(joined, 9)!.id).toBe(smaller.id);
    expect(joinSmallestTeam(joined, 9)).toEqual(joined);
    expect(teamOf(joinSmallestTeam(makeTeams(versus, [], 1)!, 5), 5)!.id).toBe(0);
    expect(joinSmallestTeam([], 5)).toEqual([]);
  });
  it('a player moves to another team unless the teams are locked or the team does not exist', () => {
    const t: TeamInfo[] = makeTeams(versus, ids(4), 1)!;
    const from = teamOf(t, 1)!,
      to = t.find((x) => x.id !== from.id)!;
    const moved = movePlayer(t, 1, to.id, false);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(teamOf(moved.teams, 1)!.id).toBe(to.id);
      expect(moved.teams.flatMap((x) => x.playerIds).sort()).toEqual(ids(4)); // nobody lost or duplicated
      expect(sizes(moved.teams.map((x) => x.playerIds)).sort()).toEqual([1, 3]);
    }
    expect(movePlayer(t, 1, to.id, true)).toEqual({ ok: false, reason: 'Los equipos están bloqueados' });
    expect(movePlayer(t, 1, 5, false)).toEqual({ ok: false, reason: 'Ese equipo no existe' });
    expect(movePlayer(t, 1, from.id, false)).toMatchObject({ ok: true, teams: t }); // same team: unchanged
    expect(movePlayer(t, 77, to.id, false)).toMatchObject({ ok: true }); // a newcomer can be placed by the host
  });
  it('leaving removes the player; shuffling deals the same players again with the same team styles', () => {
    const t = makeTeams(versus, ids(6), 1)!;
    expect(leaveTeams(t, 3).flatMap((x) => x.playerIds)).not.toContain(3);
    const s = reshuffleTeams(t, 123);
    expect(s.map((x) => x.name)).toEqual(['Picantes', 'Frescos']);
    expect(s.flatMap((x) => x.playerIds).sort()).toEqual(ids(6));
    expect(sizes(s.map((x) => x.playerIds))).toEqual([3, 3]);
    expect(reshuffleTeams(t, 123)).toEqual(s);
    expect(new Set(Array.from({ length: 12 }, (_v, seed) => JSON.stringify(reshuffleTeams(t, seed)))).size).toBeGreaterThan(2);
    expect(reshuffleTeams(makeTeams(versus, [1], 1)!.concat(makeTeams(versus, [], 1)!), 1)).toHaveLength(3); // too few to deal: untouched
  });
});

describe('a chef drops', () => {
  const roster = (drops: Record<number, number> = {}): RosterEntry[] =>
    [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
      [5, 1],
      [6, 1],
    ].map(([id, teamId]) => ({ id: id!, teamId: teamId!, droppedAt: drops[id!] ?? null }));

  it('holds the place for 20 s (the boundary counts), then gives it up', () => {
    const e: RosterEntry = { id: 1, teamId: 0, droppedAt: 100_000 };
    expect(GHOST_MS).toBe(20_000);
    expect(holdsPlace(e, 110_000)).toBe(true);
    expect(holdsPlace(e, 120_000)).toBe(true);
    expect(holdsPlace(e, 120_001)).toBe(false);
    expect(holdsPlace({ ...e, droppedAt: null }, 9e9)).toBe(true);
  });
  it('a 10 s drop changes nothing; a 30 s drop recomputes k from that instant', () => {
    const r = roster({ 1: 50_000 }); // 3v3, chef 1 dropped at 50 s
    expect(matchStatus([0, 1], r, 60_000, 'score-k')).toEqual({ counts: [3, 3], k: [1, 1], emptyTeams: [], paused: false });
    expect(matchStatus([0, 1], r, 70_000, 'score-k')).toMatchObject({ counts: [3, 3], k: [1, 1] }); // exactly 20 s: still there
    expect(matchStatus([0, 1], r, 80_000, 'score-k')).toEqual({ counts: [2, 3], k: [1.22, 1], emptyTeams: [], paused: false });
  });
  it('k keeps applying to a lopsided result (3v1 after drops is not refused) and is 1 without the score-k handicap', () => {
    const r = roster({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }); // 3 + 2 dropped long ago: only chef 6 (team 1) is left
    expect(matchStatus([0, 1], roster({ 1: 0, 2: 0 }), 30_000, 'score-k').k).toEqual([1.73, 1]); // 1 vs 3
    expect(matchStatus([0, 1], roster({ 1: 0, 2: 0 }), 30_000, 'none').k).toEqual([1, 1]);
    expect(matchStatus([0, 1], r, 30_000, 'score-k').paused).toBe(true);
  });
  it('a team left empty pauses the match, and the host picks to continue or end', () => {
    const r = roster({ 4: 0, 5: 0, 6: 0 });
    expect(matchStatus([0, 1], r, 10_000, 'score-k').paused).toBe(false); // still in the grace window
    const after = matchStatus([0, 1], r, 40_000, 'score-k');
    expect(after).toEqual({ counts: [3, 0], k: [1, 1], emptyTeams: [1], paused: true });
    expect(pauseOutcome('continue')).toEqual({ endsMatch: false, winner: false });
    expect(pauseOutcome('end')).toEqual({ endsMatch: true, winner: false });
  });
  it('a chef that comes back inside the window is the same entry: same team, nothing recomputed', () => {
    const r = roster({ 2: 50_000 });
    expect(
      matchStatus(
        [0, 1],
        r.map((e) => (e.id === 2 ? { ...e, droppedAt: null } : e)),
        90_000,
        'score-k',
      ).counts,
    ).toEqual([3, 3]);
  });
});

describe('ranking', () => {
  const r = (o: Partial<TeamResult>): TeamResult => ({ teamId: 0, score: 100, delivered: 5, vip: 1, reachedAt: 100_000, ...o });
  it('orders by score with k, then deliveries, then VIPs, then who got there first', () => {
    expect(rankTeams([r({ teamId: 0, score: 100 }), r({ teamId: 1, score: 120 })]).winner).toBe(1);
    expect(rankTeams([r({ teamId: 0, delivered: 6 }), r({ teamId: 1 })]).winner).toBe(0);
    expect(rankTeams([r({ teamId: 0 }), r({ teamId: 1, vip: 2 })]).winner).toBe(1);
    expect(rankTeams([r({ teamId: 0, reachedAt: 150_000 }), r({ teamId: 1, reachedAt: 140_000 })]).winner).toBe(1);
    expect(rankTeams([r({ teamId: 0, delivered: 6, vip: 0 }), r({ teamId: 1, delivered: 5, vip: 2 })]).winner).toBe(0); // deliveries before VIPs
    expect(
      rankTeams([r({ teamId: 0, score: 100, delivered: 1 }), r({ teamId: 1, score: 99, delivered: 9, vip: 9, reachedAt: 1 })]).winner,
    ).toBe(0); // the score rule comes first
  });
  it('a tie on every rule is a draw; one team always wins', () => {
    expect(rankTeams([r({ teamId: 0 }), r({ teamId: 1 })]).winner).toBeNull();
    expect(rankTeams([r({ teamId: 3 })]).winner).toBe(3);
    expect(rankTeams([]).winner).toBeNull();
    expect(compareTeams(r({ score: 1 }), r({ score: 2 }))).toBeGreaterThan(0);
    expect(
      rankTeams([r({ teamId: 0, score: 1 }), r({ teamId: 1, score: 3 }), r({ teamId: 2, score: 2 })]).order.map((x) => x.teamId),
    ).toEqual([1, 2, 0]);
  });
});
