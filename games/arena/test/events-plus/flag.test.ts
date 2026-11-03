import { describe, expect, it } from 'vitest';
import { ALL_EVENT_KINDS, DURATION, NO_START_TICKS, createManchazo, hashManchazo } from '../../sim';
import { play } from '../match-drive';
import { plusRound } from './plus-drive';

// Hashes taken on master (217f779, F8a) with the events on and no `eventsPlus`: the F8b flag off must not change a single bit.
describe('eventsPlus off: the round is F8a, bit for bit', () => {
  it.each([
    [{ slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed: 7, sabotage: true, events: true }, 2364289968, [107, 103]],
    [
      { slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed: 9, sabotage: true, sabotagePlus: true, events: true, mapSeed: 123456, classicMap: true },
      1109769916,
      [122, 112],
    ],
    [
      {
        slots: [0, 1, 2, 3, 4, 5, 6, 7],
        teams: [0, 1, 0, 1, 0, 1, 0, 1],
        seed: 11,
        sabotage: true,
        sabotagePlus: true,
        events: true,
        living: true,
        mapSeed: 777,
        classicMap: true,
      },
      1794679382,
      [144, 114],
    ],
  ] as const)('round %#', (cfg, hash, counts) => {
    const s = createManchazo(cfg);
    expect(s.match.ev!.plus).toBeUndefined();
    expect('plus' in s.match.ev!).toBe(false);
    play(s, 5, 4500);
    expect(hashManchazo(s)).toBe(hash);
    expect(s.match.counts).toEqual(counts);
  });
  it('without the flag no F8b event is ever drawn', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed, events: true });
      expect(s.match.ev!.program.every((p) => ['bigPinata', 'rain', 'gold', 'vacuum'].includes(p.kind))).toBe(true);
    }
  });
  it('with the flag on the round differs, and the F0 fallback map is not modified in place (a copy is made)', () => {
    const a = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 7, events: true });
    const b = plusRound(7);
    expect(hashManchazo(a)).not.toBe(hashManchazo(b));
    expect(b.grid.map).not.toBe(a.grid.map);
  });
});

describe('the program with the flag on', () => {
  it('draws 3 of nine kinds, never overlapping and never in the last 12 s; all nine show up across seeds; the same seed gives the same program', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const s = plusRound(seed, [0, 1, 0, 1], seed * 977);
      const prog = s.match.ev!.program;
      expect(prog).toHaveLength(3);
      let prevEnd = 0;
      for (const p of prog) {
        expect(ALL_EVENT_KINDS).toContain(p.kind);
        expect(p.at).toBeGreaterThanOrEqual(prevEnd);
        expect(p.at).toBeLessThan(s.match.ev!.base - NO_START_TICKS);
        prevEnd = p.at + DURATION[p.kind];
        seen.add(p.kind);
      }
      expect(plusRound(seed, [0, 1, 0, 1], seed * 977).match.ev!.program).toEqual(prog);
    }
    expect([...seen].sort()).toEqual([...ALL_EVENT_KINDS].sort());
  });
  it('Apagon only changes the render: the paint after the same script is the one of a round without it', () => {
    const [a, b] = [plusRound(5, [0, 1, 0, 1]), plusRound(5, [0, 1, 0, 1])];
    for (const s of [a, b]) s.match.ev!.program = [];
    b.match.ev!.program = [{ kind: 'blackout', at: 100, row: 0, order: [], down: true }];
    play(a, 3, 900);
    play(b, 3, 900);
    expect(b.match.ev!.log.map((x) => x.kind)).toContain('blackout');
    expect(Array.from(b.match.paint)).toEqual(Array.from(a.match.paint));
    expect(b.grid.bodies.map((x) => [x.x, x.y])).toEqual(a.grid.bodies.map((x) => [x.x, x.y]));
  });
});
