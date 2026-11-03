import { describe, expect, it } from 'vitest';
import { FINAL_TICKS, PHASE_WARN_TICKS, openingTicks, rawPhase } from '../../sim';
import { lead, run } from '../events/ev-drive';
import { idle, phaseLog, phaseRound, quietEvents, teamsOf, toTick } from './phase-drive';

const ROUNDS = [
  [2, 4500, 1350],
  [5, 5400, 1620],
  [7, 6300, 1890],
] as const; // players, round ticks (75, 90, 105 s), the Opening's end (30 %)

describe('the acts: exact transitions', () => {
  it.each(ROUNDS)(
    '%i players: the Scramble begins at 30 % of the round (tick %i -> %i) and the Final 1080 ticks before the end',
    (n, total, open) => {
      const s = quietEvents(phaseRound(teamsOf(n)));
      expect(s.grid.durationTicks).toBe(total);
      expect(openingTicks(total)).toBe(open);
      toTick(s, open - 1);
      idle(s); // runs tick open - 1
      expect(s.match.ph!.phase).toBe('opening');
      idle(s); // runs tick open
      expect(s.match.ph!.phase).toBe('scramble');
      toTick(s, total - FINAL_TICKS - 1);
      idle(s);
      expect(s.match.ph!.phase).toBe('scramble');
      idle(s);
      expect(s.match.ph!.phase).toBe('final');
      expect(s.grid.tick - 1).toBe(total - 1080);
    },
  );
  it('rawPhase is a pure function of the tick and the time left', () => {
    expect([0, 1349, 1350, 3419, 3420, 4499].map((t) => rawPhase(t, 4500, 4500))).toEqual([
      'opening',
      'opening',
      'scramble',
      'scramble',
      'final',
      'final',
    ]);
    expect(rawPhase(3000, 4500 + 900, 4500)).toBe('scramble'); // the same tick with the Hourglass's 15 s is not the Final yet
  });
});

describe('the acts: announcements 120 ticks ahead and at the change', () => {
  it.each(ROUNDS)('%i players: warn at change - 120, phase at the change, once each, in the sim log', (n, total, open) => {
    const s = quietEvents(phaseRound(teamsOf(n)));
    idle(s, total - 1);
    expect(phaseLog(s)).toEqual([
      ['warnScramble', open - PHASE_WARN_TICKS],
      ['phaseScramble', open],
      ['warnFinal', total - FINAL_TICKS - PHASE_WARN_TICKS],
      ['phaseFinal', total - FINAL_TICKS],
    ]);
  });
});

describe('the acts and the Hourglass (+15 s)', () => {
  it('inside the Final the round stays in the Final (the act never goes back) and nothing is announced again', () => {
    const s = quietEvents(phaseRound());
    toTick(s, 4500 - 500);
    idle(s);
    expect(s.match.ph!.phase).toBe('final');
    const before = phaseLog(s).length;
    s.grid.durationTicks += 900; // what a filled Hourglass does: 1400 ticks left, more than the 1080 of a Final
    idle(s, 300);
    expect(s.match.ph!.phase).toBe('final');
    expect(phaseLog(s)).toHaveLength(before);
  });
  it('before the Final the Final moves 15 s later, with its own new warning, and the first warning is not repeated for the Opening', () => {
    const s = quietEvents(phaseRound());
    toTick(s, 3000);
    idle(s);
    s.grid.durationTicks += 900; // the Final would have begun at 3420: it now begins at 4320
    toTick(s, 3420 + 5);
    expect(s.match.ph!.phase).toBe('scramble');
    idle(s, 5400 - s.grid.tick - 1);
    expect(phaseLog(s).filter(([k]) => k === 'phaseFinal')).toEqual([['phaseFinal', 4320]]);
    expect(
      phaseLog(s)
        .filter(([k]) => k === 'warnFinal')
        .map(([, t]) => t),
    ).toEqual([4320 - 120]);
  });
  it('a warning already given for a Final that then moves is given again for the new one', () => {
    const s = quietEvents(phaseRound());
    toTick(s, 3300 + 1); // 120 ticks before 3420: warned
    expect(phaseLog(s).filter(([k]) => k === 'warnFinal')).toEqual([['warnFinal', 3300]]);
    s.grid.durationTicks += 900;
    idle(s, 1200);
    expect(
      phaseLog(s)
        .filter(([k]) => k === 'warnFinal')
        .map(([, t]) => t),
    ).toEqual([3300, 4200]);
  });
  it('end to end: a real filled Hourglass in the Scramble pushes the Final back by exactly its 15 s', () => {
    const s = quietEvents(phaseRound());
    lead(s, 1, 70); // team 0 trails by far: the Hourglass falls at 30 s left
    toTick(s, 4500 - 1800);
    idle(s, 1);
    expect(s.match.ev!.clock.phase).toBe('warn');
    for (let y = 6; y <= 8; y++) for (let x = 12; x <= 14; x++) if (s.match.paint[y * 27 + x] !== 0) s.match.paint[y * 27 + x] = 0;
    s.grid.bodies[0]!.x = 13 * 16 + 8;
    s.grid.bodies[0]!.y = 7 * 16 + 8;
    run(s, 180 + 240);
    expect(s.match.ev!.clock.outcome).toBe('filled');
    expect(s.grid.durationTicks).toBe(5400);
    expect(s.match.ph!.phase).toBe('scramble');
    idle(s, 5400 - 1080 + 1 - s.grid.tick + 1);
    expect(s.match.ph!.phase).toBe('final');
    expect(phaseLog(s).find(([k]) => k === 'phaseFinal')![1]).toBe(5400 - 1080);
  });
});
