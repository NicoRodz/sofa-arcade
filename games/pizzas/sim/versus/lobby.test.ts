// F1: the lobby side of Versus as pure rules: which N enables the mode, how the connected players are split and kept split,
// which versus maps fit the teams, and how the lobby choices become a running round (createGame with teams, map, handicap).
import { describe, expect, it } from 'vitest';
import { GAMES, choiceVoteSpec, gameProblems, modeOf } from '@pichi/core/games';
import { SABOTAGE_MODES, SABOTAGE_OPTION } from '../sabotage-config';
import { cast, openVote, settle, makeRoster, snapshot, type VoteConfig } from '@pichi/core/lobby/vote';
import { mulberry32 } from '@pichi/core/rng';
import type { TeamInfo } from '@pichi/core/lobby/teams';
import { VERSUS_MAPS, versusMap } from './maps';
import {
  VERSUS_AUTO,
  VERSUS_RANDOM,
  createVersusGame,
  defaultModeOptions,
  defaultVersusChoice,
  isVersusChoice,
  kitchenSides,
  lobbySetup,
  resolveVersusMap,
  sabotageNotice,
  startVersusRound,
  stepChoice,
  syncTeams,
  teamSizes,
  versusAvailability,
  versusLobbyMaps,
  versusMapStatus,
  withSides,
} from './lobby';

const versus = modeOf(GAMES[0], 'versus');
const coop = modeOf(GAMES[0], 'coop');
const ids = (n: number) => Array.from({ length: n }, (_v, i) => i + 1);
const sizes = (t: readonly TeamInfo[] | null) => teamSizes(t);

describe('versusAvailability: when the mode can be picked', () => {
  it('even N needs 4 or more; odd N needs a legal handicap; the rest says why not', () => {
    const row = (n: number) => {
      const a = versusAvailability(versus, n);
      return [n, a.ok, a.k];
    };
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(row)).toEqual([
      [0, false, 1],
      [1, false, 1],
      [2, false, 1],
      [3, true, 1.41],
      [4, true, 1],
      [5, true, 1.22],
      [6, true, 1],
      [7, true, 1.15],
      [8, true, 1],
      [9, false, 1],
    ]);
  });
  it('the reasons are lobby texts, and an odd lobby carries a heads-up with the multiplier', () => {
    expect(versusAvailability(versus, 2).reason).toMatch(/al menos 4/);
    expect(versusAvailability(versus, 9).reason).toMatch(/hasta 8/);
    expect(versusAvailability(versus, 1).reason).toMatch(/al menos/);
    expect(versusAvailability(versus, 6)).toMatchObject({ ok: true, reason: '', notice: '' });
    expect(versusAvailability(versus, 5).notice).toBe('3 contra 2: el equipo de 2 gana un multiplicador ×1.22');
    expect(versusAvailability(versus, 3).notice).toMatch(/2 contra 1.*×1\.41.*Cooperativo/);
  });
  it('a mode with a tighter ratio refuses the odd split by the same rule (validateTeamSetup decides, not a table)', () => {
    const evenOnly = { ...versus, teams: { ...versus.teams!, maxRatio: 1 } };
    expect(versusAvailability(evenOnly, 5)).toMatchObject({ ok: false });
    expect(versusAvailability(evenOnly, 5).reason).toMatch(/desiguales/);
    expect(versusAvailability(evenOnly, 6).ok).toBe(true);
  });
});

describe('syncTeams: the lobby teams follow the connected players', () => {
  it('coop has no teams; versus splits 6 into 3 and 3, the same way for the same seed', () => {
    expect(syncTeams(coop, null, ids(6), 1, false)).toBeNull();
    const a = syncTeams(versus, null, ids(6), 7, false)!;
    expect(sizes(a)).toEqual([3, 3]);
    expect(a.map((t) => t.name)).toEqual(['Picantes', 'Frescos']);
    expect(syncTeams(versus, null, [...ids(6)].reverse(), 7, false)).toEqual(a);
    expect(a.flatMap((t) => t.playerIds).sort()).toEqual(ids(6));
  });
  it('N 1..8: sizes differ by at most one and every player is on exactly one team', () => {
    for (let n = 2; n <= 8; n++) {
      const t = syncTeams(versus, null, ids(n), n, false)!;
      expect(Math.abs(sizes(t)[0]! - sizes(t)[1]!)).toBeLessThanOrEqual(1);
      expect(t.flatMap((x) => x.playerIds).sort((x, y) => x - y)).toEqual(ids(n));
    }
  });
  it('the first player alone fills team 0 and the second goes to the other team (the smallest)', () => {
    const one = syncTeams(versus, null, [1], 1, false)!;
    expect(sizes(one)).toEqual([1, 0]);
    expect(sizes(syncTeams(versus, one, [1, 2], 1, false))).toEqual([1, 1]);
  });
  it('nothing changed: the same array comes back (no re-render, no re-send)', () => {
    const a = syncTeams(versus, null, ids(4), 1, false)!;
    expect(syncTeams(versus, a, [4, 3, 2, 1], 99, false)).toBe(a);
  });
  it('untouched teams are rebalanced keeping the previous ones as far as sizes allow', () => {
    const a = syncTeams(versus, null, ids(6), 3, false)!;
    const b = syncTeams(versus, a, ids(5), 3, false)!; // player 6 left
    expect(sizes(b).sort()).toEqual([2, 3]);
    for (const t of b) for (const id of t.playerIds) if (id !== 6) expect(a[t.id]!.playerIds).toContain(id); // nobody changed side
  });
  it('after a manual move only arrivals and departures apply: a 4 v 2 is kept, the newcomer joins the small team', () => {
    const [s0, s1] = versus.teams!.styles!;
    const manual: TeamInfo[] = [
      { id: 0, ...s0!, playerIds: [1, 2, 3, 4] },
      { id: 1, ...s1!, playerIds: [5, 6] },
    ];
    const kept = syncTeams(versus, manual, ids(6), 1, true)!;
    expect(sizes(kept)).toEqual([4, 2]);
    expect(sizes(syncTeams(versus, manual, ids(7), 1, true))).toEqual([4, 3]);
    expect(sizes(syncTeams(versus, manual, [1, 2, 3, 5], 1, true))).toEqual([3, 1]); // two left: nobody is moved to compensate
  });
});

describe('lobbySetup: is the split a legal start', () => {
  const t = (...sz: number[]) => {
    let n = 0;
    return sz.map((s) => ({ playerIds: Array.from({ length: s }, () => ++n) }));
  };
  it('4 v 4, 3 v 2 (k 1.22) and 4 v 2 (ratio 2) pass; 5 v 1, an empty team and no teams do not', () => {
    expect(lobbySetup(versus, t(4, 4))).toMatchObject({ ok: true, k: [1, 1] });
    expect(lobbySetup(versus, t(3, 2))).toMatchObject({ ok: true, k: [1, 1.22] });
    expect(lobbySetup(versus, t(4, 2))).toMatchObject({ ok: true, k: [1, 1.41] });
    expect(lobbySetup(versus, t(5, 1)).ok).toBe(false);
    expect(lobbySetup(versus, t(5, 1)).problems.join()).toMatch(/desiguales/);
    expect(lobbySetup(versus, t(3, 0)).problems.join()).toMatch(/vacío/);
    expect(lobbySetup(versus, null)).toMatchObject({ ok: false, problems: ['Faltan los equipos'] });
  });
});

describe('versus maps filtered by team size', () => {
  const status = (id: string, ...sz: number[]) => versusMapStatus(versusMap(id)!, sz).state;
  it('V1 takes everything 2..8; V2 and V4 need 4; V3 up to 6; V5 up to 4', () => {
    expect([2, 3, 4].map((a) => status('V1', a, a))).toEqual(['recommended', 'recommended', 'recommended']);
    expect(status('V2', 1, 1)).toBe('blocked');
    expect(status('V2', 2, 2)).toBe('recommended');
    expect(status('V3', 3, 3)).toBe('recommended');
    expect(status('V3', 4, 4)).toBe('blocked');
    expect(status('V5', 2, 2)).toBe('recommended');
    expect(status('V5', 3, 2)).toBe('blocked');
  });
  it('a lopsided team that does not fit its kitchen blocks the map even when the total does (V3: 4 v 2 = 6 players, 3 starts per side)', () => {
    expect(versusMapStatus(versusMap('V3')!, [4, 2])).toEqual({ state: 'blocked', reason: 'caben 3 por cocina' });
    expect(versusMapStatus(versusMap('V3')!, [3, 3]).state).toBe('recommended');
  });
  it('the list puts the maps that fit first and the default skips the ones already played', () => {
    const list = versusLobbyMaps([3, 3]);
    expect(list).toHaveLength(VERSUS_MAPS.length);
    const firstBlocked = list.findIndex((x) => x.status.state === 'blocked');
    expect(list.slice(0, firstBlocked).every((x) => x.status.state === 'recommended')).toBe(true);
    expect(list.slice(firstBlocked).every((x) => x.status.state === 'blocked')).toBe(true);
    expect(defaultVersusChoice([3, 3], new Set())).toBe(list[0]!.map.id);
    expect(defaultVersusChoice([3, 3], new Set([list[0]!.map.id]))).toBe(list[1]!.map.id);
  });
  it('choices are recognised by the protocol check', () => {
    for (const c of ['V1', 'V5', VERSUS_AUTO, VERSUS_RANDOM]) expect(isVersusChoice(c)).toBe(true);
    for (const c of ['1', 'auto', 'random', 'V9', '']) expect(isVersusChoice(c)).toBe(false);
  });
});

describe('resolveVersusMap and kitchen sides', () => {
  const rand = mulberry32(5);
  it("a fixed choice gives that map with both kitchens' starts (A then B)", () => {
    const m = resolveVersusMap('V1', 1, 'normal', [3, 3], rand);
    expect(m.id).toBe('V1');
    expect(m.spawns).toHaveLength(8);
    expect(m.sigma).toBe('mirrorX');
    expect(m.spawns.slice(0, 4).every(([x]) => x < 8)).toBe(true);
    expect(m.spawns.slice(4).every(([x]) => x >= 8)).toBe(true);
  });
  it('"auto" only draws among the maps that fit (3 v 3: never V5)', () => {
    for (let i = 0; i < 40; i++) expect(resolveVersusMap(VERSUS_AUTO, 1, 'normal', [3, 3], mulberry32(i)).id).not.toBe('V5');
  });
  it('"random" is generated from the seed (same seed, same map; another seed, another map) and is a legal two-kitchen map', () => {
    const a = resolveVersusMap(VERSUS_RANDOM, 77, 'normal', [3, 3], rand),
      b = resolveVersusMap(VERSUS_RANDOM, 77, 'normal', [3, 3], mulberry32(1));
    expect(a.rows).toEqual(b.rows);
    expect(a.id).toBe('vs-gen');
    expect(
      new Set(
        [78, 79, 80, 81, 82].map((s) => resolveVersusMap(VERSUS_RANDOM, s, 'normal', [3, 3], rand).rows.join('')).concat(a.rows.join('')),
      ).size,
    ).toBeGreaterThan(1);
    expect(kitchenSides(a.rows, a.spawns)).toHaveLength(2);
  });
  it('sides come from where the floor really is: V1 left/right, V3 above/below, V5 left/right (its rotation puts the kitchens side by side)', () => {
    const sides = (id: string) => {
      const m = versusMap(id)!;
      return kitchenSides(m.rows, [...m.versus.spawns[0], ...m.versus.spawns[1]]);
    };
    expect(sides('V1')).toEqual(['izquierda', 'derecha']);
    expect(sides('V3')).toEqual(['arriba', 'abajo']);
    expect(sides('V5')).toEqual(['izquierda', 'derecha']);
  });
});

describe('createVersusGame: the lobby becomes a round', () => {
  const pick = (n: number) => syncTeams(versus, null, ids(n), 4, false)!;
  const start = (teams: TeamInfo[], o: { handicap?: boolean; map?: string; seed?: number } = {}) => {
    const map = resolveVersusMap(o.map ?? 'V1', o.seed ?? 4, 'normal', sizes(teams), mulberry32(1));
    return createVersusGame({
      teams: withSides(teams, map),
      map,
      difficulty: 'normal',
      seed: o.seed ?? 4,
      modeOptions: { ...defaultModeOptions(versus), ...(o.handicap === undefined ? {} : { handicap: o.handicap }) },
      slotOf: (id) => id - 1,
    });
  };
  it('6 players: two teams of 3, every chef in its kitchen on its team, the map is V1 and the round is versus', () => {
    const teams = pick(6);
    const g = start(teams);
    expect(g.versus).toBe(true);
    expect(g.mapId).toBe('V1');
    expect(g.teams.map((t) => t.n)).toEqual([3, 3]);
    expect([...g.players.keys()].sort()).toEqual(ids(6));
    for (const t of teams)
      for (const id of t.playerIds) {
        const p = g.players.get(id)!;
        expect(p.team).toBe(t.id);
        expect(p.x < 8).toBe(t.id === 0);
        expect(p.slot).toBe(id - 1);
      }
    expect(g.stations.every((s) => s.owner === (s.tx < 8 ? 0 : 1))).toBe(true);
  });
  it('5 players (3 v 2): the small team carries k 1.22, the big one 1; the handicap option off makes both 1', () => {
    const teams = pick(5);
    expect(sizes(teams).sort()).toEqual([2, 3]);
    const g = start(teams);
    const small = teams.find((t) => t.playerIds.length === 2)!.id;
    expect(g.teams[small]!.k).toBe(1.22);
    expect(g.teams[1 - small]!.k).toBe(1);
    expect(start(teams, { handicap: false }).teams.map((t) => t.k)).toEqual([1, 1]);
  });
  it('the same seed gives both teams the same orders at the same instants (twin queues)', () => {
    const g = start(pick(4), { seed: 9 });
    expect(g.teams[0]!.orders.map((o) => o.recipe)).toEqual(g.teams[1]!.orders.map((o) => o.recipe));
  });
  it('a player on no team (arrived late) is not added: it watches', () => {
    const teams = pick(4);
    const g = start(teams);
    expect(g.players.has(9)).toBe(false);
  });
  it('every versus map starts for the sizes it admits (rot180 maps too)', () => {
    for (const [id, n] of [
      ['V3', 6],
      ['V4', 8],
      ['V5', 4],
      ['V2', 4],
    ] as const) {
      const g = start(pick(n), { map: id });
      expect(g.players.size).toBe(n);
      expect(g.teams.map((t) => t.n)).toEqual([n / 2, n / 2]);
    }
  });
});

describe('the sabotage option in the lobby (Apagado / Suave / Caos)', () => {
  const choice = versus.choices!.find((c) => c.id === SABOTAGE_OPTION)!;
  it('the versus mode declares it, with three named values; coop has none; the registry stays valid', () => {
    expect(choice.values.map((v) => v.label)).toEqual(['Apagado', 'Suave', 'Caos']);
    expect(choice.values.map((v) => v.id)).toEqual([...SABOTAGE_MODES]);
    expect(coop.choices).toBeUndefined();
    expect(gameProblems(GAMES[0])).toEqual([]);
  });
  it('the default follows the difficulty: Suave on Fácil and Normal, Caos on Difícil; with no difficulty, the registry default', () => {
    expect(['easy', 'normal', 'hard'].map((d) => defaultModeOptions(versus, d as 'easy')[SABOTAGE_OPTION])).toEqual([
      'soft',
      'soft',
      'chaos',
    ]);
    expect(defaultModeOptions(versus)[SABOTAGE_OPTION]).toBe('soft');
    expect(defaultModeOptions(versus, 'hard')).toMatchObject({ hiddenScore: true, handicap: true }); // the toggles keep their defaults
    expect(defaultModeOptions(coop)).toEqual({});
  });
  it("Left and Right (the keyboard, and the Captain's D-pad that sends the same keys) step through the values and stop at the ends", () => {
    expect(stepChoice(choice, 'soft', 'ArrowRight')).toBe('chaos');
    expect(stepChoice(choice, 'soft', 'ArrowLeft')).toBe('off');
    expect(stepChoice(choice, 'off', 'ArrowLeft')).toBeNull();
    expect(stepChoice(choice, 'chaos', 'ArrowRight')).toBeNull();
    expect(stepChoice(choice, 'soft', 'Enter')).toBeNull();
    expect(stepChoice(choice, 'nope', 'ArrowRight')).toBeNull();
  });
  it('the same registry feeds a phone vote (vote.ts): three options, the leader wins when the lobby settles it', () => {
    const spec = choiceVoteSpec(choice);
    expect(spec).toMatchObject({ key: 'sabotage', type: 'enum', default: 'soft', votable: true });
    expect(spec.values.map((v) => v.id)).toEqual(['off', 'soft', 'chaos']);
    const cfg: VoteConfig = { voteId: 1, kind: 'item', options: spec.values.map((v) => v.id), current: spec.default, windowMs: null };
    const ctx = { now: 1000, rng: mulberry32(1), roster: makeRoster([1, 2, 3], 0) };
    let v = openVote(cfg, 0);
    v = cast(v, ctx, 1, 1, 'chaos');
    v = cast(v, { ...ctx, now: 2000 }, 2, 1, 'chaos');
    v = cast(v, { ...ctx, now: 3000 }, 3, 1, 'off');
    expect(snapshot(v, ctx).counts).toEqual({ off: 1, soft: 0, chaos: 2 });
    expect(settle(v, ctx).result?.winner).toBe('chaos');
  });
  it('the notice: a level that is on, on a map with no catapult, says so; off or a map with one says nothing', () => {
    expect(sabotageNotice('soft', versusMap('V1')!.rows)).toBe('');
    expect(sabotageNotice('soft', versusMap('11-vs')!.rows)).toMatch(/sin sabotaje/);
    expect(sabotageNotice('off', versusMap('11-vs')!.rows)).toBe('');
    expect(sabotageNotice('chaos', null)).toBe('');
  });
  describe('startVersusRound turns the option into the sim', () => {
    const teams = syncTeams(versus, null, ids(4), 4, false)!;
    const round = (modeOptions: Record<string, boolean | string>, choice = 'V1') =>
      startVersusRound({ teams, choice, difficulty: 'normal', seed: 4, modeOptions, slotOf: (id) => id - 1, rand: mulberry32(1) });
    it('Suave / Caos on V1: the sim has the sabotage; Apagado or no option at all: it does not, and the hazards stay down', () => {
      expect(round({ sabotage: 'soft' }).game.sab?.mode).toBe('soft');
      expect(round({ sabotage: 'chaos' }).game.sab?.mode).toBe('chaos');
      for (const o of [{ sabotage: 'off' }, {}, { sabotage: 'nonsense' }] as Record<string, string>[]) {
        const g = round(o).game;
        expect([g.sab, g.hazards]).toEqual([null, false]);
      }
    });
    it('a map with no catapult plays without it, whatever the option says; so does a generated one', () => {
      expect(round({ sabotage: 'soft' }, '11-vs').game.sab).toBeNull();
      expect(round({ sabotage: 'soft' }, VERSUS_RANDOM).game.sab).toBeNull();
    });
  });
});
