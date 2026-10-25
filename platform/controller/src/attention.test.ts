import { describe, expect, it } from 'vitest';
import { cueFor, type CueMemory } from './attention';

const mem = (): CueMemory => ({ phase: null, captain: null });
const phase = (p: string) => ({ t: 'phase', phase: p }) as never;
const captain = (id: number) => ({ t: 'captain', playerId: id }) as never;

describe('cueFor', () => {
  it('rings when the round starts, once, and when the results come', () => {
    const m = mem();
    expect(cueFor(phase('lobby'), 1, m)).toBeNull();
    expect(cueFor(phase('playing'), 1, m)).toBe('go');
    expect(cueFor(phase('playing'), 1, m)).toBeNull();
    expect(cueFor(phase('results'), 1, m)).toBe('done');
  });
  it('the school after a round (or the other way round) does not ring twice', () => {
    const m = mem();
    cueFor(phase('school'), 1, m);
    expect(cueFor(phase('playing'), 1, m)).toBeNull();
  });
  it('tells the phone when the menus become its own, not when another phone gets them', () => {
    const m = mem();
    expect(cueFor(captain(2), 1, m)).toBeNull();
    expect(cueFor(captain(1), 1, m)).toBe('turn');
    expect(cueFor(captain(1), 1, m)).toBeNull();
  });
  it('rings for the own Ayudante switch only when it goes on', () => {
    expect(cueFor({ t: 'assist', playerId: 1, on: true } as never, 1, mem())).toBe('soft');
    expect(cueFor({ t: 'assist', playerId: 1, on: false } as never, 1, mem())).toBeNull();
    expect(cueFor({ t: 'assist', playerId: 2, on: true } as never, 1, mem())).toBeNull();
  });
});
