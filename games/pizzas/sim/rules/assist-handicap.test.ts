import { describe, expect, it } from 'vitest';
import {
  ASSIST_IMMUNITY_K,
  ASSIST_REACH_MULT,
  ASSIST_WEIGHT,
  effectiveChefs,
  matchStatus,
  teamMultipliers,
  validateTeamSetup,
} from './assist';
import { addFloorItem } from './floor';
import { tick } from '../overcooked';
import { chefHint } from '../phone/hints';
import { GAMES, modeOf } from '@pichi/catalog';
import { handicapK } from '@pichi/core/lobby/teams';
import { lobbySetup, startVersusRound } from '../versus/lobby';
import { idle, place, run, room, at } from './assist.kit';

describe('immune to the banana-skin', () => {
  const walkOver = (assist: number[]) => {
    const g = room(['#..............#', '#..............#'], assist, { hazards: true });
    const slips: number[] = [];
    g.bus.on('chef:slip', (e) => slips.push(e.chef));
    const p = at(g, 1, 8.6, 5.5, 1, 0);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 700, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
    return { g, p, slips };
  };
  it('walking over rubbish: the control slips (once), the Ayudante does not, with the same rubbish and the same walk', () => {
    const control = walkOver([]),
      helped = walkOver([1]);
    expect(control.slips, 'the control slips').toEqual([1]);
    expect(control.p.immuneUntil).toBeGreaterThan(0);
    expect(helped.slips).toEqual([]);
    expect(helped.p.slip ?? null).toBeNull();
    expect(helped.p.immuneUntil, 'never marked immune: it just does not slip').toBeUndefined();
    expect(helped.p.x, 'it kept walking past the rubbish').toBeGreaterThan(11);
  });
  it('standing on it, or having it land at its feet, is no different', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 10.5, 5.5);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 300, new Map());
    expect(p.slip ?? null).toBeNull();
  });
  it('the chef keeps what it carries (it would have dropped it) and the rubbish stays on the floor for the team to clean', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 8.6, 5.5, 1, 0);
    p.item = 'raw1';
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 700, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
    expect(p.item).toBe('raw1');
    expect(g.floor.filter((f) => f.kind === 'trash')).toHaveLength(1);
  });
  it('the hint of a chef on Ayudante near rubbish says "Recoger" (it can still clean) and never "Sin control"', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 9.5, 5.5, 1, 0);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    expect(chefHint(g, p).a).toBe('Recoger');
  });
});

describe('the handicap k (versus): an Ayudante weighs 0.7 and its immunity costs 0.05 of k  [numbers to calibrate]', () => {
  it('with no Ayudantes every k is what it always was (the old table: 2v1 1.41, 3v2 1.22, 4v3 1.15)', () => {
    for (const [counts, want] of [
      [
        [2, 2],
        [1, 1],
      ],
      [
        [2, 1],
        [1, 1.41],
      ],
      [
        [3, 2],
        [1, 1.22],
      ],
      [
        [4, 3],
        [1, 1.15],
      ],
    ] as const) {
      expect(teamMultipliers(counts, Infinity)).toEqual(want);
      expect(teamMultipliers(counts, Infinity, [0, 0])).toEqual(want);
      expect(teamMultipliers(counts, Infinity, undefined)).toEqual(want);
    }
    expect(handicapK(2, 3)).toBe(Math.max(1, Math.round(Math.sqrt(3 / 2) * 100) / 100));
  });
  it("the constants are the council's, written down as numbers to calibrate", () => {
    expect([ASSIST_WEIGHT, ASSIST_IMMUNITY_K, ASSIST_REACH_MULT]).toEqual([0.7, 0.05, 1.5]);
    expect(effectiveChefs(3, 0)).toBe(3);
    expect(effectiveChefs(3, 1)).toBeCloseTo(2.7, 9);
  });
  it('2 v 2 with one Ayudante in team 0: its team gets sqrt(2/1.7) = 1.08 minus 0.05 = 1.03; the other stays at 1', () => {
    expect(teamMultipliers([2, 2], Infinity, [1, 0])).toEqual([1.03, 1]);
    expect(teamMultipliers([2, 2], Infinity, [0, 1])).toEqual([1, 1.03]);
  });
  it('two Ayudantes in the same team of 2 (eff 1.4 vs 2): sqrt(2/1.4) = 1.20 minus 0.10 = 1.10', () => {
    expect(teamMultipliers([2, 2], Infinity, [2, 0])).toEqual([1.1, 1]);
  });
  it('an Ayudante on the BIGGER team of an uneven match: 3 v 2, 1 Ayudante among the 3 -> eff 2.7 v 2: the three get 1 (floor), the two get sqrt(2.7/2) = 1.16', () => {
    expect(teamMultipliers([3, 2], Infinity, [1, 0])).toEqual([1, 1.16]);
  });
  it('k never drops below 1, and the legal split is still judged on the real counts (3v1 stays refused)', () => {
    expect(teamMultipliers([3, 3], 2, [3, 0])!.every((k) => k >= 1)).toBe(true);
    expect(teamMultipliers([3, 1], 2, [0, 1])).toBeNull();
  });
  it('the sim applies it: createGame / startVersusRound with an Ayudante gives the team its k, and the lobby shows the same number before the start', () => {
    const versus = modeOf(GAMES[0], 'versus');
    const teams = [
      { id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1, 3] },
      { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2, 4] },
    ];
    const lobby = lobbySetup(versus, teams, new Set([1]));
    expect(lobby.k).toEqual([1.03, 1]);
    expect(lobbySetup(versus, teams).k, 'without the set: as before').toEqual([1, 1]);
    expect(lobbySetup(versus, teams, new Set()).k).toEqual([1, 1]);
    const round = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'normal',
      seed: 3,
      modeOptions: { handicap: true, sabotage: 'off' },
      slotOf: (i) => i - 1,
      rand: () => 0.1,
      assist: [1],
    });
    expect(round.game.teams.map((t) => t.k)).toEqual(lobby.k);
    const plain = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'normal',
      seed: 3,
      modeOptions: { handicap: true, sabotage: 'off' },
      slotOf: (i) => i - 1,
      rand: () => 0.1,
    });
    expect(plain.game.teams.map((t) => t.k)).toEqual([1, 1]);
    // the handicap option off: nothing is applied whoever plays on Ayudante
    const off = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'normal',
      seed: 3,
      modeOptions: { handicap: false, sabotage: 'off' },
      slotOf: (i) => i - 1,
      rand: () => 0.1,
      assist: [1],
    });
    expect(off.game.teams.map((t) => t.k)).toEqual([1, 1]);
    expect(
      validateTeamSetup(
        versus,
        [
          [1, 3],
          [2, 4],
        ],
        new Set([1]),
      ).k,
    ).toEqual([1.03, 1]);
  });
  it('a score is multiplied by that k (a delivery is worth 3% more for the team with the Ayudante)', () => {
    const teams = [
      { id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1, 3] },
      { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2, 4] },
    ];
    const gain = (assist: number[]) => {
      const g = startVersusRound({
        teams,
        choice: 'V1',
        difficulty: 'normal',
        seed: 3,
        modeOptions: { handicap: true, sabotage: 'off', recipes: false },
        slotOf: (i) => i - 1,
        rand: () => 0.1,
        assist,
      }).game; // recipes off: the test delivers a Marinara and the queue of V1 must ask for one
      const p = g.players.get(1)!;
      const w = g.stations.find((s) => s.kind === 'window' && s.owner === 0)!;
      place(g, 1, w);
      p.item = 'dish';
      let got = 0;
      g.bus.on('delivered', (e) => {
        got = e.points;
      });
      g.countdown = 0;
      tick(g, new Map([[1, { ...idle, a: 1 }]]));
      return got;
    };
    const base = gain([]),
      helped = gain([1]);
    expect(base).toBeGreaterThan(0);
    expect(helped).toBe(Math.round((base / 1) * 1.03));
  });
  it('drops follow the Ayudantes: when the Ayudante of a team leaves for good, k is recomputed without it (matchStatus)', () => {
    const roster = [
      { id: 1, teamId: 0, droppedAt: null, assist: true as const },
      { id: 3, teamId: 0, droppedAt: null },
      { id: 2, teamId: 1, droppedAt: null },
      { id: 4, teamId: 1, droppedAt: null },
    ];
    expect(matchStatus([0, 1], roster, 0, 'score-k').k).toEqual([1.03, 1]);
    const gone = roster.map((r) => (r.id === 1 ? { ...r, droppedAt: 0 } : r));
    const st = matchStatus([0, 1], gone, 25_000, 'score-k'); // past the grace time: the chef is gone
    expect(st.counts).toEqual([1, 2]);
    expect(st.k).toEqual([1.41, 1]);
  });
});
