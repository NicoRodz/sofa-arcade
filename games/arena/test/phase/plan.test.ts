import { describe, expect, it } from 'vitest';
import { EVENT_KINDS, createManchazo, eligiblePhases, openingTicks, rawPhase } from '../../sim';

const BIG = ['bigPinata', 'rain', 'gold', 'vacuum'];
const cfg = (seed: number, extra = {}) => ({ slots: [0, 1], teams: [0, 1], seed, events: true, phases: true, ...extra });

describe('the director and the acts', () => {
  it('declares the four big events for the Scramble only; an undeclared kind may start anywhere', () => {
    for (const k of BIG) expect(eligiblePhases(k)).toEqual(['scramble']);
    expect(eligiblePhases('blackout')).toEqual(['opening', 'scramble', 'final']);
    expect(eligiblePhases('whatever')).toEqual(['opening', 'scramble', 'final']);
  });
  it('with the F8b pool no big event ever starts in the Opening, and the Opening slot always gets an event of the other five', () => {
    const slot0 = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const s = createManchazo(cfg(seed, { eventsPlus: true, mapSeed: seed * 41 }));
      const prog = s.match.ev!.program;
      expect(prog).toHaveLength(3);
      const base = s.grid.durationTicks;
      for (const p of prog) if (BIG.includes(p.kind)) expect(rawPhase(p.at, base, base)).toBe('scramble');
      expect(prog[0]!.at).toBeLessThan(openingTicks(base)); // the 25 % slot falls in the Opening ...
      expect(BIG).not.toContain(prog[0]!.kind); // ... so it is never a big one
      slot0.add(prog[0]!.kind);
    }
    expect([...slot0].sort()).toEqual(['balloons', 'blackout', 'contagion', 'happyHour', 'move']); // every plus kind can open the round
  });
  it('with only the F4 four the Opening slot is spent (2 events a round); the other slots land in the Scramble', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createManchazo(cfg(seed));
      const prog = s.match.ev!.program;
      expect(prog).toHaveLength(2);
      expect(
        prog.every((p) => EVENT_KINDS.includes(p.kind) && rawPhase(p.at, s.grid.durationTicks, s.grid.durationTicks) === 'scramble'),
      ).toBe(true);
    }
  });
  it('without the flag the program is the one of master: three events, the 25 % slot included, a big one allowed in the Opening', () => {
    let big = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const prog = createManchazo({ ...cfg(seed), phases: false }).match.ev!.program;
      expect(prog).toHaveLength(3);
      if (BIG.includes(prog[0]!.kind)) big++;
    }
    expect(big).toBeGreaterThan(30);
  });
  it('the same seed gives the same program', () => {
    for (let seed = 1; seed <= 20; seed++)
      expect(createManchazo(cfg(seed, { eventsPlus: true })).match.ev!.program).toEqual(
        createManchazo(cfg(seed, { eventsPlus: true })).match.ev!.program,
      );
  });
});
