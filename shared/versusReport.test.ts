// Versus F4: what the results, the HUD and the phones show, as plain data (versusReport.ts). The rounds here are real sim rounds ended by
// the clock with the numbers of each team set beforehand, so the ranking, the winner and the tie-breaks come out of the real `finish`.
import { describe, expect, it } from 'vitest';
import { COLORS } from './protocol';
import { VERSUS_STYLES } from './games';
import { Emitter, type GameEvents } from './events';
import { TICK_MS, addPlayer, createGame, resolvePause, tick, type Game, type TeamState } from './overcooked';
import { summarizeTeam } from './results';
import { starThresholds } from './stars';
import { VIP_TTL_MS } from './versus';
import { MIRRORS, twinSpawns } from './golden/mirror-bot';
import {
  DECIDED_TEXT,
  HIDE_SCORE_MS,
  NO_LEAD,
  decidedBy,
  kText,
  mvpOf,
  nextLead,
  outcomeFor,
  phoneResult,
  recordRound,
  scoreHidden,
  seriesKey,
  seriesLine,
  tallyDeliveries,
  verdictOf,
  versusReport,
  vipView,
} from './versusReport';

const V1 = MIRRORS.v1;
const TEAMS = [
  { name: 'Picantes', icon: '▲', color: '#A8330A', playerIds: [1, 2, 3] },
  { name: 'Frescos', icon: '●', color: '#14338A', playerIds: [4, 5, 6] },
];

/** A V1 round with 3 v 3 that ends by the clock right away, each team starting with the numbers in `set` (score, delivered, vips, reachedAt...). */
function finished(
  set: [Partial<TeamState>, Partial<TeamState>],
  o: { bus?: Emitter<GameEvents>; noWinner?: boolean; players?: number[][] } = {},
): Game {
  const players = o.players ?? TEAMS.map((t) => t.playerIds);
  const g = createGame({
    rows: V1.rows,
    spawns: twinSpawns(V1.rows, V1.sigma, V1.half),
    difficulty: 'normal',
    seed: 5,
    bus: o.bus,
    teams: players.map((playerIds) => ({ playerIds })),
  });
  players.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  set.forEach((p, i) => Object.assign(g.teams[i]!, p));
  g.noWinner = o.noWinner === true;
  g.params.roundMs = 60;
  for (let i = 0; i < 10 && !g.over; i++) tick(g, new Map());
  expect(g.over, 'the round ended').toBe(true);
  return g;
}
const none = new Map<number, number>();

describe("who won and why (the design's tie-break order, read out of a real finished round)", () => {
  it('more points wins, and the margin is the difference', () => {
    const r = versusReport(
      finished([
        { score: 410, delivered: 7 },
        { score: 340, delivered: 9 },
      ]),
      TEAMS,
      none,
    );
    expect(r.verdict).toBe('win');
    expect(r.winner).toBe(0);
    expect(r.decidedBy).toBe('score'); // 9 deliveries do not beat 70 points
    expect(r.margin).toBe(70);
    expect(r.ranked).toEqual([0, 1]);
    expect(r.teams.map((t) => [t.rank, t.winner])).toEqual([
      [1, true],
      [2, false],
    ]);
  });
  it('the same points: the team with more deliveries wins', () => {
    const r = versusReport(
      finished([
        { score: 300, delivered: 5, vips: 3 },
        { score: 300, delivered: 6, vips: 0 },
      ]),
      TEAMS,
      none,
    );
    expect([r.winner, r.decidedBy, r.margin]).toEqual([1, 'delivered', 0]);
  });
  it('the same points and deliveries: more golden orders wins', () => {
    const r = versusReport(
      finished([
        { score: 300, delivered: 5, vips: 0 },
        { score: 300, delivered: 5, vips: 1 },
      ]),
      TEAMS,
      none,
    );
    expect([r.winner, r.decidedBy]).toEqual([1, 'vip']);
  });
  it('the same on all three: whoever reached that score earlier wins', () => {
    const r = versusReport(
      finished([
        { score: 300, delivered: 5, vips: 1, reachedAt: 90_000 },
        { score: 300, delivered: 5, vips: 1, reachedAt: 80_000 },
      ]),
      TEAMS,
      none,
    );
    expect([r.winner, r.decidedBy]).toEqual([1, 'reachedAt']);
    expect(r.verdict).toBe('win');
  });
  it('identical on every rule: a draw, with no winner and both teams sharing the first place', () => {
    const r = versusReport(
      finished([
        { score: 300, delivered: 5, vips: 1, reachedAt: 80_000 },
        { score: 300, delivered: 5, vips: 1, reachedAt: 80_000 },
      ]),
      TEAMS,
      none,
    );
    expect([r.verdict, r.winner, r.decidedBy]).toEqual(['draw', null, null]);
    expect(r.teams.map((t) => [t.rank, t.winner])).toEqual([
      [1, false],
      [1, false],
    ]);
  });
  it('the host going on without a winner, or ending the pause, is no verdict at all', () => {
    const cont = finished([{ score: 400 }, { score: 100 }], { noWinner: true });
    expect([verdictOf(cont), versusReport(cont, TEAMS, none).winner]).toEqual(['nowinner', null]);
    const g = createGame({
      rows: V1.rows,
      spawns: twinSpawns(V1.rows, V1.sigma, V1.half),
      seed: 5,
      teams: [{ playerIds: [1] }, { playerIds: [2] }],
    });
    addPlayer(g, 1, 0, 0);
    addPlayer(g, 2, 1, 1);
    g.teams[0]!.score = 500;
    resolvePause(g, 'end'); // nothing paused: ignored
    expect(g.over).toBe(false);
    g.paused = { teams: [1] };
    resolvePause(g, 'end');
    const r = versusReport(g, TEAMS.slice(0, 2), none);
    expect([r.verdict, r.winner, r.decidedBy]).toEqual(['aborted', null, null]);
  });
  it('decidedBy on a single team or an unfinished list says nothing', () => {
    expect(decidedBy([])).toBeNull();
    expect(decidedBy([{ teamId: 0, score: 1, delivered: 0, vip: 0, reachedAt: 0 }])).toBeNull();
    expect(Object.keys(DECIDED_TEXT).sort()).toEqual(['delivered', 'reachedAt', 'score', 'vip']);
  });
});

describe('the summary of each team', () => {
  it('carries the numbers of the sim: deliveries, tips, best streak, golden orders, handicap, stars (by the team size and the score with k)', () => {
    const g = finished(
      [
        { score: 410, gross: 410, delivered: 7, tips: 180, bestStreak: 4, vips: 1, expired: 1, rejected: 0 },
        { score: 330, gross: 270, delivered: 6, tips: 90, bestStreak: 3, vips: 0, expired: 2, rejected: 1 },
      ],
      {
        players: [
          [1, 2, 3],
          [4, 5],
        ],
      },
    ); // 3 v 2: the small team plays with k 1.22
    const r = versusReport(g, TEAMS, none);
    const [a, b] = r.teams as [(typeof r.teams)[0], (typeof r.teams)[0]];
    expect([a.teamId, a.name, a.icon, a.color, a.score, a.delivered, a.tips, a.bestStreak, a.vips]).toEqual([
      0,
      'Picantes',
      '▲',
      '#A8330A',
      410,
      7,
      180,
      4,
      1,
    ]);
    expect([b.teamId, b.name, b.k, b.gross, b.score, b.expired + b.rejected]).toEqual([1, 'Frescos', 1.22, 270, 330, 3]);
    expect(a.stars).toBe(summarizeTeam(g, 0).stars);
    expect(b.stars).toBe(summarizeTeam(g, 1).stars);
    expect(a.thresholds).toEqual(starThresholds(undefined, 'normal', 3)); // each team's table follows its own size: 3 chefs against 2
    expect(b.thresholds).toEqual(starThresholds(undefined, 'normal', 2));
    expect(a.stars).toBe(a.thresholds.filter((t) => 410 >= t).length);
    expect(b.stars).toBe(b.thresholds.filter((t) => 330 >= t).length);
  });
  it('the MVP of a team is its chef with most deliveries (the first one listed on a tie, nobody when nobody delivered)', () => {
    const tally = new Map([
      [1, 2],
      [2, 5],
      [3, 1],
      [4, 3],
      [5, 3],
    ]);
    const r = versusReport(finished([{ score: 410 }, { score: 330 }]), TEAMS, tally);
    expect(r.teams[0]!.mvp).toEqual({ playerId: 2, delivered: 5 });
    expect(r.teams[1]!.mvp).toEqual({ playerId: 4, delivered: 3 }); // 4 and 5 tie: the lowest id the lobby dealt
    expect(versusReport(finished([{ score: 1 }, { score: 0 }]), TEAMS, none).teams.map((t) => t.mvp)).toEqual([null, null]);
    expect(mvpOf([7, 8], new Map([[9, 4]]))).toBeNull(); // a chef of another team never counts
  });
  it('the tally counts deliveries per chef off the bus and can start over', () => {
    const bus = new Emitter<GameEvents>();
    const t = tallyDeliveries(bus);
    for (const player of [3, 3, 5]) bus.emit('delivered', { player, points: 70, tip: 0, base: 70, mult: 1, team: 0 });
    expect([...t.counts]).toEqual([
      [3, 2],
      [5, 1],
    ]);
    t.reset();
    expect(t.counts.size).toBe(0);
    bus.emit('delivered', { player: 3, points: 1, tip: 0, base: 1, mult: 1 });
    t.off();
    bus.emit('delivered', { player: 3, points: 1, tip: 0, base: 1, mult: 1 });
    expect(t.counts.get(3)).toBe(1);
  });
});

describe('what a phone is told', () => {
  it("the verdict, the winner and every team's score; each phone reads its own outcome", () => {
    const r = versusReport(finished([{ score: 410 }, { score: 340 }]), TEAMS, none);
    const p = phoneResult(r);
    expect(p).toEqual({
      verdict: 'win',
      winner: 0,
      scores: [
        { team: 0, score: 410 },
        { team: 1, score: 340 },
      ],
    });
    expect([outcomeFor(p, 0), outcomeFor(p, 1), outcomeFor(p, null)]).toEqual(['won', 'lost', 'none']);
    const draw = phoneResult(
      versusReport(
        finished([
          { score: 5, reachedAt: 1 },
          { score: 5, reachedAt: 1 },
        ]),
        TEAMS,
        none,
      ),
    );
    expect([draw.verdict, outcomeFor(draw, 0), outcomeFor(draw, 1)]).toEqual(['draw', 'draw', 'draw']);
    const no = phoneResult(versusReport(finished([{ score: 9 }, { score: 1 }], { noWinner: true }), TEAMS, none));
    expect([no.verdict, no.winner, outcomeFor(no, 0)]).toEqual(['nowinner', null, 'none']);
  });
});

describe('the series of the session', () => {
  const T = [{ playerIds: [1, 2, 3] }, { playerIds: [4, 5, 6] }];
  const names = ['Picantes', 'Frescos'];
  it('counts wins and draws of the same group; nothing to show before the first round', () => {
    expect(seriesLine(null, names)).toBeNull();
    let s = recordRound(null, T, 'win', 0);
    expect(seriesLine(s, names)).toBe('Picantes 1–0 Frescos');
    s = recordRound(s, T, 'win', 1);
    s = recordRound(s, T, 'win', 0);
    expect(seriesLine(s, names)).toBe('Picantes 2–1 Frescos');
    s = recordRound(s, T, 'draw', null);
    expect(seriesLine(s, names)).toBe('Picantes 2–1 Frescos · 1 empate');
    s = recordRound(s, T, 'draw', null);
    expect(seriesLine(s, names)).toBe('Picantes 2–1 Frescos · 2 empates');
  });
  it('a round the host ended or played on without a winner does not count', () => {
    const s = recordRound(recordRound(null, T, 'win', 1), T, 'aborted', null);
    expect(recordRound(s, T, 'nowinner', null)).toEqual(s);
  });
  it('the same chefs on swapped teams go on with the series; a different group starts over', () => {
    const s = recordRound(null, T, 'win', 0);
    const swapped = [{ playerIds: [1, 2, 4] }, { playerIds: [3, 5, 6] }];
    expect(seriesKey(swapped)).toBe(seriesKey(T));
    expect(recordRound(s, swapped, 'win', 1).wins).toEqual([1, 1]);
    const other = [{ playerIds: [1, 2, 3] }, { playerIds: [4, 5, 7] }];
    expect(recordRound(s, other, 'win', 1).wins).toEqual([0, 1]);
  });
});

describe('the scoreboard', () => {
  it('shows ??? only while the clock runs, in the last 20 s, and only when the host kept the option', () => {
    expect(HIDE_SCORE_MS).toBe(20_000);
    expect(scoreHidden(true, true, 20_000)).toBe(true);
    expect(scoreHidden(true, true, 20_001)).toBe(false);
    expect(scoreHidden(true, true, 0)).toBe(true);
    expect(scoreHidden(false, true, 5000)).toBe(false);
    expect(scoreHidden(true, false, 5000)).toBe(false); // the countdown: nothing to hide yet
  });
  it('writes the handicap with a decimal comma, and nothing at 1', () => {
    expect([kText(1), kText(1.22), kText(1.41), kText(1.15)]).toEqual(['', '×1,22', '×1,41', '×1,15']);
  });
  it('a comeback is the trailing team taking the lead; the first points, a tie and regaining its own lead are not', () => {
    let s = NO_LEAD;
    const step = (scores: number[], hidden = false) => {
      const r = nextLead(s, scores, hidden);
      s = r.state;
      return r.cue;
    };
    expect(step([0, 0])).toBeNull();
    expect(step([70, 0])).toBeNull(); // first points
    expect(step([70, 70])).toBeNull(); // tie
    expect(step([140, 70])).toBeNull(); // the same team regains its own lead
    expect(step([140, 210])).toBe('comeback'); // team 1 overtakes
    expect(step([140, 210])).toBeNull(); // nothing changed
    expect(step([280, 210])).toBe('comeback'); // and back
    expect(step([280, 280])).toBeNull();
    expect(step([280, 350])).toBe('comeback'); // overtakes after a tie: the last one to lead alone was team 0
  });
  it('while the scoreboard is hidden the lead does not move and no cue goes out (the sound would give it away)', () => {
    let s = nextLead(NO_LEAD, [100, 0], false).state;
    const hiddenStep = nextLead(s, [100, 500], true);
    expect(hiddenStep.cue).toBeNull();
    expect(hiddenStep.state).toBe(s);
    s = hiddenStep.state;
    expect(nextLead(s, [100, 500], false).cue).toBe('comeback'); // revealed: it reads the lead it kept
  });
});

describe('the golden order card', () => {
  it('is up from the moment the golden order shows up until a team wins it or it runs out', () => {
    const bus = new Emitter<GameEvents>();
    const g = createGame({
      rows: V1.rows,
      spawns: twinSpawns(V1.rows, V1.sigma, V1.half),
      difficulty: 'easy',
      seed: 5,
      bus,
      teams: [{ playerIds: [1] }, { playerIds: [2] }],
    });
    addPlayer(g, 1, 0, 0);
    addPlayer(g, 2, 1, 1);
    expect(vipView(g, VIP_TTL_MS)).toBeNull();
    g.vip.nextAt = 0;
    tick(g, new Map());
    const v = vipView(g, VIP_TTL_MS)!;
    expect(v.recipe).toBe(g.vip.round!.recipe);
    expect(v.fraction).toBeGreaterThan(0.99);
    for (let t = 0; t < 15_000; t += TICK_MS) tick(g, new Map());
    expect(vipView(g, VIP_TTL_MS)!.fraction).toBeCloseTo(0.5, 1);
    for (const t of g.teams) for (const o of t.orders) if (o.vip) o.expiresAt = g.time; // both queues lose it
    expect(vipView(g, VIP_TTL_MS)).toBeNull();
  });
});

describe('team colours', () => {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lab = (hex: string): [number, number, number] => {
    const r = lin(parseInt(hex.slice(1, 3), 16)),
      g = lin(parseInt(hex.slice(3, 5), 16)),
      b = lin(parseInt(hex.slice(5, 7), 16));
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
      z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const deltaE = (a: string, b: string) => {
    const p = lab(a),
      q = lab(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  it('no team colour is close to any chef colour (the first draft was an orange and a blue at distance 7 and 9 from the orange and blue chefs)', () => {
    for (const team of VERSUS_STYLES)
      for (const chef of COLORS) expect(deltaE(team.color, chef), `${team.name} ${team.color} vs chef ${chef}`).toBeGreaterThan(20);
    expect(deltaE('#F26A1B', '#FF7A1A')).toBeLessThan(10); // the measure does catch the old pair
  });
  it('the two teams are far from each other and carry different glyphs', () => {
    expect(deltaE(VERSUS_STYLES[0]!.color, VERSUS_STYLES[1]!.color)).toBeGreaterThan(40);
    expect(VERSUS_STYLES[0]!.icon).not.toBe(VERSUS_STYLES[1]!.icon);
  });
});
