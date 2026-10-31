// The lines the lobby and the banner use for the events must say what the sim does under eventsV2 (cake prize, number of events per round).
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import { CAKE_PRIZE } from './state';
import { eventBlurb, eventsHint } from './lines';

describe('eventBlurb', () => {
  it('eventsV2 birthday: the cake prize of the difficulty, with a candle; never the flat 150', () => {
    for (const d of DIFFICULTIES) {
      const line = eventBlurb('birthday', d, true);
      expect(line).toContain(`${CAKE_PRIZE[d]} puntos`);
      expect(line).toContain('vela');
      expect(line).not.toContain('150');
    }
    expect(eventBlurb('birthday', 'normal', true)).toBe('Torta de 250 puntos, con vela');
  });
  it('without eventsV2 the old lines stay (the flat birthday order really is 150 there)', () => {
    expect(eventBlurb('birthday', 'normal', false)).toContain('150');
  });
  it('the four events with presence have their own line under eventsV2', () => {
    for (const k of ['rush', 'birthday', 'blackout', 'spill'] as const)
      expect(eventBlurb(k, 'normal', true), k).not.toBe(eventBlurb(k, 'normal', false));
  });
});

describe('eventsHint', () => {
  it('counts the events of the difficulty calendar (Fácil 1, Normal 2, Difícil 3) and drops the old "one event between 1:00 and 2:00"', () => {
    expect(eventsHint(true, 'easy', false)).toMatch(/^1 evento por ronda/);
    expect(eventsHint(true, 'normal', false)).toMatch(/^2 eventos por ronda/);
    expect(eventsHint(true, 'hard', false)).toMatch(/^3 eventos por ronda/);
    for (const d of DIFFICULTIES) expect(eventsHint(true, d, false)).not.toContain('1:00');
  });
  it('off says so; versus does not promise the coop-only events', () => {
    expect(eventsHint(false, 'hard', false)).toBe('Sin eventos');
    expect(eventsHint(true, 'normal', true)).toBe('2 eventos por ronda');
  });
});
