import { describe, expect, it } from 'vitest';
import { FINAL_TICKS, createManchazo, isHidden, type ManchazoState } from '../../sim';
import { nextChange } from '../../sim/living/state';
import { borders, lead } from '../events/ev-drive';
import { idle, phaseRound, quietEvents, toTick } from './phase-drive';

const livingRound = (extra = {}) => quietEvents(phaseRound([0, 1, 0, 1], 5, { sabotage: true, living: true, mapSeed: 777, classicMap: true, ...extra }));
const clocks = (s: ManchazoState) => [...s.match.live!.pairs, ...(s.match.live!.fountain ? [s.match.live!.fountain] : [])];

describe('the Final speeds the living parts x0.75', () => {
  it('brush 240 -> 180, sofa 300 -> 225, fountain 480 -> 360; a change already close keeps its tick, the others are scaled', () => {
    const s = livingRound();
    const periods = clocks(s).map((c) => c.period);
    expect(new Set(periods)).toEqual(new Set([240, 300, 480].filter((p) => periods.includes(p)))); // whichever of the three the map has
    expect(periods.length).toBeGreaterThanOrEqual(2);
    const start = s.grid.durationTicks - FINAL_TICKS;
    toTick(s, start);
    const before = clocks(s).map((c) => ({ ...nextChange({ ...c, pending: false }, start, 60), period: c.period }));
    idle(s); // runs tick `start`: the act turns Final at the end of the step
    expect(s.match.ph!.phase).toBe('final');
    clocks(s).forEach((c, k) => {
      const b = before[k]!;
      expect(c.period).toBe(Math.floor((b.period * 3) / 4));
      const want = b.in <= 60 ? b.in : Math.max(60, Math.ceil((b.in * 3) / 4));
      expect(nextChange({ ...c, pending: false }, start, 60).in).toBe(want);
    });
    expect(new Set(clocks(s).map((c) => c.period))).toEqual(new Set(periods.map((p) => ((p * 3) / 4) | 0)));
  });
  it('before the Final the periods are the original ones (the Opening and the Scramble do not touch them)', () => {
    const s = livingRound();
    const periods = clocks(s).map((c) => c.period);
    toTick(s, s.grid.durationTicks - FINAL_TICKS - 1);
    expect(clocks(s).map((c) => c.period)).toEqual(periods);
  });
  it('a pair really changes on the new schedule: the brush turns every 180 ticks in the Final', () => {
    const s = livingRound();
    toTick(s, s.grid.durationTicks - FINAL_TICKS + 1);
    const brush = s.match.live!.pairs.find((p) => p.spec.kind === 'brush')!;
    const seen: number[] = [];
    let state = brush.state;
    for (let k = 0; k < 600; k++) {
      idle(s);
      if (brush.state !== state) {
        seen.push(s.grid.tick);
        state = brush.state;
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[1]! - seen[0]!).toBe(180);
  });
});

describe('the hidden scoreboard only when the round is close', () => {
  const at600 = (tiles: number, team = 0) => {
    const s = quietEvents(phaseRound());
    lead(s, team, tiles);
    toTick(s, s.grid.durationTicks - 601);
    return s;
  };
  const six = (s: ManchazoState) => Math.floor((6 * s.match.paintable) / 100); // the biggest lead (in tiles) that is 6 pp or less
  it('6 pp or less when the last 10 s begin: they are played blind (as before), and announced once', () => {
    const t = at600(six(at600(0))); // a lead of exactly 6 pp
    idle(t, 2);
    expect(t.match.ph!.hidden).toBe(true);
    expect(isHidden(t)).toBe(true);
    expect(t.match.ev!.log.filter((a) => a.kind === 'hidden')).toHaveLength(1);
  });
  it('more than 6 pp: the scoreboard stays in view and nothing is announced; it is decided once and does not flip later', () => {
    const n = six(at600(0)) + 1;
    const t = at600(n);
    idle(t, 2);
    expect(t.match.ph!.hidden).toBe(false);
    expect(isHidden(t)).toBe(false);
    lead(t, 1, n + 5); // the lead closes inside the last 10 s: the decision stands
    idle(t, 300);
    expect(isHidden(t)).toBe(false);
    expect(t.match.ev!.log.some((a) => a.kind === 'hidden')).toBe(false);
  });
  it('the decision is the same for both teams (the lead of team 1 reads like the lead of team 0)', () => {
    const n = six(at600(0));
    for (const team of [0, 1]) {
      const a = at600(n, team);
      idle(a, 2);
      expect(a.match.ph!.hidden).toBe(true);
      const b = at600(n + 1, team);
      idle(b, 2);
      expect(b.match.ph!.hidden).toBe(false);
    }
  });
  it('without the flag the last 10 s are always blind, whatever the gap', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3, events: true });
    s.match.ev!.next = s.match.ev!.program.length;
    lead(s, 0, borders(s.match.paintable).lo + 20);
    s.grid.tick = s.grid.durationTicks - 601;
    idle(s, 2);
    expect(isHidden(s)).toBe(true);
  });
});
