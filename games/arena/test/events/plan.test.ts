import { describe, expect, it } from 'vitest';
import { DURATION, JITTER, NO_START_TICKS, SLOT_FRACTIONS, EVENT_KINDS } from '../../sim';
import { evRound } from './ev-drive';
import { createManchazo } from '../../sim';
import { substream } from '../../sim/events/rng';

const BASES: [number, number[]][] = [
  [75, [0, 1]],
  [90, [0, 1, 0, 1, 0]],
  [105, [0, 1, 0, 1, 0, 1, 0]],
];

describe('the program of events', () => {
  for (const [secs, teams] of BASES)
    it(`${secs} s base: 3 different events, slots at 25 / 46 / 67 % (+-4 %), none overlapping, none in the last 12 s, across 300 seeds`, () => {
      const base = secs * 60;
      for (let seed = 1; seed <= 300; seed++) {
        const prog = evRound(seed, teams).match.ev!.program;
        expect(prog).toHaveLength(3);
        expect(new Set(prog.map((p) => p.kind)).size).toBe(3);
        let prevEnd = 0;
        prog.forEach((p, k) => {
          expect(EVENT_KINDS).toContain(p.kind);
          const frac = p.at / base;
          // the slot, moved by the jitter, then pushed later only to avoid the one before (or earlier only by the 12 s rule)
          if (p.at < base - NO_START_TICKS - 1 && p.at > prevEnd + 60)
            expect(Math.abs(frac - SLOT_FRACTIONS[k]!)).toBeLessThanOrEqual(JITTER + 1 / base);
          expect(p.at).toBeGreaterThanOrEqual(prevEnd);
          expect(p.at).toBeLessThanOrEqual(base - NO_START_TICKS - 1); // the 12 s rule
          prevEnd = p.at + DURATION[p.kind];
        });
      }
    });
  it('the slots really are proportional to the base: 75 s puts the first around 18.75 s, 105 s around 26.25 s', () => {
    const at = (secs: number, teams: number[]) => evRound(5, teams).match.ev!.program[0]!.at / 60;
    expect(at(75, [0, 1])).toBeGreaterThan(75 * 0.21);
    expect(at(75, [0, 1])).toBeLessThan(75 * 0.29);
    expect(at(105, [0, 1, 0, 1, 0, 1, 0])).toBeGreaterThan(105 * 0.21);
    expect(at(105, [0, 1, 0, 1, 0, 1, 0])).toBeLessThan(105 * 0.29);
  });
  it('same seed, same program (whatever the teams and the map); another seed, another one', () => {
    const a = evRound(11, [0, 1, 0, 1]).match.ev!.program;
    expect(evRound(11, [0, 1, 0, 1]).match.ev!.program).toEqual(a);
    expect(evRound(11, [1, 0, 1, 0]).match.ev!.program).toEqual(a); // the teams swapped: same program
    expect(evRound(12, [0, 1, 0, 1]).match.ev!.program).not.toEqual(a);
  });
  it('same seed, same program on a generated map; the program does not depend on the sabotages flag', () => {
    const a = evRound(21, [0, 1], 123456).match.ev!.program;
    expect(evRound(21, [0, 1], 123456).match.ev!.program).toEqual(a);
    const withSab = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 21, events: true, sabotage: true, mapSeed: 123456 });
    expect(withSab.match.ev!.program).toEqual(a);
  });
  it('the substreams are named: manchazo:events:<seed> and manchazo:clock:<seed> are independent, repeatable draws', () => {
    expect(substream('manchazo:events:9')()).toBe(substream('manchazo:events:9')());
    expect(substream('manchazo:events:9')()).not.toBe(substream('manchazo:clock:9')());
    expect(substream('manchazo:clock:9')()).not.toBe(substream('manchazo:clock:10')());
  });
});
