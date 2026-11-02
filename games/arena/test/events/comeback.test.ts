import { describe, expect, it } from 'vitest';
import {
  createManchazo,
  BASE_RADIUS,
  COMEBACK_COOLDOWN_TICKS,
  COMEBACK_TICKS,
  HIDDEN_TICKS,
  SMALL_TEAM_RADIUS_BONUS,
  losingTeam,
  isHidden,
} from '../../sim';
import { DROP, put } from '../match-drive';
import { borders, evRound, lead, left, quiet, run, untilEnd } from './ev-drive';

describe('the 15 % border (come-back, Hourglass)', () => {
  it('just under 15 % is not losing, just over is: the loser is the team with fewer tiles', () => {
    const base = quiet(evRound());
    const { lo, hi } = borders(base.match.paintable);
    expect((100 * lo) / base.match.paintable).toBeGreaterThan(14.7); // 14.9 % on this map
    expect((100 * hi) / base.match.paintable).toBeLessThan(15.3); // 15.1 %
    for (const team of [0, 1]) {
      const a = evRound();
      lead(a, team, lo);
      expect(losingTeam(a.match)).toBe(-1);
      const b = evRound();
      lead(b, team, hi);
      expect(losingTeam(b.match)).toBe(1 - team);
    }
  });
});

describe('come-back', () => {
  const setup = (tiles: number, team = 0) => {
    const s = quiet(evRound());
    lead(s, team, tiles);
    s.grid.tick = 59; // the once-a-second check falls on tick 60
    return s;
  };
  it("at 14.9 % nothing; at 15.1 % the losing team is announced and its pinatas get +1 radius (the leader's do not)", () => {
    const { lo, hi } = borders(evRound().match.paintable);
    const calm = setup(lo);
    run(calm, 2);
    expect(calm.match.ev!.comeback.team).toBe(-1);
    const s = setup(hi);
    run(s, 2);
    expect(s.match.ev!.comeback.team).toBe(1); // team 0 leads
    expect(s.match.ev!.log).toEqual([{ kind: 'comeback', tick: 60, team: 1 }]); // the TV announcement
    put(s, 1, 20, 7);
    put(s, 0, 5, 7);
    run(s, 1, { 0: DROP, 1: DROP });
    const [lead0, lose1] = [s.match.pinatas.find((p) => p.team === 0)!, s.match.pinatas.find((p) => p.team === 1)!];
    expect(lose1.radius).toBe(BASE_RADIUS + 1 + 0); // 1 v 1: no small-team edge
    expect(lead0.radius).toBe(BASE_RADIUS);
  });
  it('stacks on the small team edge (+1) and ends after 10 s; no new one until 20 s later', () => {
    const s = quiet(evRound(3, [0, 0, 1])); // team 1 is the small one: radius 3
    lead(s, 0, 80);
    s.grid.tick = 59;
    run(s, 2);
    expect(s.match.ev!.comeback.team).toBe(1);
    put(s, 2, 20, 7);
    run(s, 1, { 2: DROP });
    expect(s.match.pinatas[0]!.radius).toBe(BASE_RADIUS + SMALL_TEAM_RADIUS_BONUS + 1);
    run(s, COMEBACK_TICKS + 1);
    expect(s.match.ev!.comeback.team).toBe(-1); // ended; the gap is still there but it is cooling down
    run(s, COMEBACK_COOLDOWN_TICKS - 120);
    expect(s.match.ev!.comeback.team).toBe(-1);
    run(s, 240);
    expect(s.match.ev!.comeback.team).toBe(1); // cooldown over: back
    expect(s.match.ev!.log.filter((a) => a.kind === 'comeback')).toHaveLength(2);
  });
});

describe('hidden scoreboard', () => {
  it('starts exactly 10 s before the end, is announced once, and the final board is not hidden', () => {
    const s = quiet(evRound());
    untilEnd(s, HIDDEN_TICKS + 1);
    expect(isHidden(s)).toBe(false);
    run(s, 1);
    expect(left(s)).toBe(HIDDEN_TICKS);
    expect(isHidden(s)).toBe(true);
    expect(s.match.ev!.log.filter((a) => a.kind === 'hidden')).toHaveLength(0); // announced by the next step
    run(s, 1);
    run(s, 10);
    expect(s.match.ev!.log.filter((a) => a.kind === 'hidden')).toEqual([
      { kind: 'hidden', tick: s.grid.durationTicks - HIDDEN_TICKS, team: -1 },
    ]);
    run(s, HIDDEN_TICKS);
    expect(s.grid.over).toBe(true);
    expect(isHidden(s)).toBe(false);
  });
  it('a round without the events never hides', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3 });
    untilEnd(s, HIDDEN_TICKS);
    expect(isHidden(s)).toBe(false);
  });
});
