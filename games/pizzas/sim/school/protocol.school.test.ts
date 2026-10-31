// The wire side of the Cocina escuela: the school phase, the per-phone step message, the "I already know it" message, and the Captain's remote.
import { describe, expect, it } from 'vitest';
import { PHASES, PROTOCOL_VERSION, nextPhase, remoteVisible } from '@pichi/core';
import { parseClientMessage } from '@pichi/catalog';

const parse = (m: object) => parseClientMessage(JSON.stringify(m));
const good = { t: 'school', playerId: 3, step: 1, total: 4, text: 'Toma tomate y pícalo en la tabla', btn: 'b' };

describe('phase "school"', () => {
  it('is a phase of its own, between the lobby and the round, and the protocol version says so', () => {
    expect(PHASES).toContain('school');
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(6);
    expect(parse({ t: 'phase', phase: 'school' })).toEqual({ t: 'phase', phase: 'school' });
  });
  it('the lobby goes to the school and back; no other phase does', () => {
    expect(nextPhase('lobby', 'practice')).toBe('school');
    expect(nextPhase('school', 'endPractice')).toBe('lobby');
    for (const ph of ['menu', 'playing', 'results'] as const) expect(nextPhase(ph, 'practice')).toBe(ph);
    expect(nextPhase('lobby', 'endPractice')).toBe('lobby');
    expect(nextPhase('school', 'start')).toBe('school'); // the school ends through endPractice (the screen decides what follows), never straight into a round
  });
  it('the old transitions are untouched', () => {
    expect(nextPhase('menu', 'pick')).toBe('lobby');
    expect(nextPhase('lobby', 'start')).toBe('playing');
    expect(nextPhase('playing', 'timeout')).toBe('results');
    expect(nextPhase('results', 'again')).toBe('lobby');
  });
});

describe("the screen's 'school' message to one phone", () => {
  it('parses the step, the total, the instruction and the button to light', () => {
    expect(parse(good)).toEqual(good);
    expect(parse({ ...good, step: 4, done: true, btn: undefined })).toEqual({
      t: 'school',
      playerId: 3,
      step: 4,
      total: 4,
      text: good.text,
      done: true,
    });
  });
  it('refuses a malformed one (no player, step beyond the total, empty or huge text, unknown button)', () => {
    for (const bad of [
      { ...good, playerId: 'x' },
      { ...good, step: 5 },
      { ...good, step: -1 },
      { ...good, total: 0 },
      { ...good, text: '' },
      { ...good, text: 'x'.repeat(49) },
      { ...good, btn: 'c' },
      { ...good, step: 1.5 },
    ])
      expect(parse(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("a phone's 'schoolDone'", () => {
  it('carries nothing but an optional skip flag (it never says who: the relay knows the socket)', () => {
    expect(parse({ t: 'schoolDone' })).toEqual({ t: 'schoolDone' });
    expect(parse({ t: 'schoolDone', skip: true })).toEqual({ t: 'schoolDone', skip: true });
    expect(parse({ t: 'schoolDone', skip: 'yes', playerId: 9 })).toEqual({ t: 'schoolDone' });
  });
});

describe("the Captain's D-pad", () => {
  it('shows in the menus and the lobby, not over the pad of the round or of the school (the school card has its own "saltar para todos")', () => {
    expect(remoteVisible(true, true, 'lobby')).toBe(true);
    expect(remoteVisible(true, true, 'results')).toBe(true);
    expect(remoteVisible(true, true, 'playing')).toBe(false);
    expect(remoteVisible(true, true, 'school')).toBe(false);
    expect(remoteVisible(false, true, 'lobby')).toBe(false);
  });
});
