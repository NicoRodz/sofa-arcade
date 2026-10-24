import { describe, expect, it } from 'vitest';
import { HOWTO_MS, howToOnKey, isExpired, progress, secondsLeft, type HowToState } from './howto';

const start: HowToState = { mode: 'start', startedAt: 1000 };
const preview: HowToState = { mode: 'preview', startedAt: 1000 };

describe('how-to timing', () => {
  it('counts whole seconds down from 10 and never goes negative', () => {
    expect(secondsLeft(1000, 1000)).toBe(10);
    expect(secondsLeft(1000, 1000 + 1)).toBe(10);
    expect(secondsLeft(1000, 1000 + 9001)).toBe(1);
    expect(secondsLeft(1000, 1000 + HOWTO_MS)).toBe(0);
    expect(secondsLeft(1000, 1000 + HOWTO_MS + 5000)).toBe(0);
  });
  it('progress is clamped to 0..1', () => {
    expect(progress(1000, 500)).toBe(0);
    expect(progress(1000, 1000 + HOWTO_MS / 2)).toBe(0.5);
    expect(progress(1000, 1000 + HOWTO_MS * 3)).toBe(1);
  });
  it('only the start card expires; the preview stays until closed', () => {
    expect(isExpired(start, 1000 + HOWTO_MS - 1)).toBe(false);
    expect(isExpired(start, 1000 + HOWTO_MS)).toBe(true);
    expect(isExpired(preview, 1000 + HOWTO_MS * 5)).toBe(false);
  });
});

describe('how-to keys', () => {
  it('H opens a preview from the lobby only', () => {
    expect(howToOnKey(null, 'lobby', 'h')).toBe('open-preview');
    expect(howToOnKey(null, 'lobby', 'H')).toBe('open-preview');
    expect(howToOnKey(null, 'playing', 'h')).toBe('none');
    expect(howToOnKey(null, 'results', 'h')).toBe('none');
    expect(howToOnKey(null, 'lobby', 'Enter')).toBe('none'); // Enter on the lobby starts the round elsewhere
  });
  it('Enter skips the card before the countdown; H does not', () => {
    expect(howToOnKey(start, 'lobby', 'Enter')).toBe('skip');
    expect(howToOnKey(start, 'lobby', 'h')).toBe('none');
    expect(howToOnKey(start, 'lobby', 'Escape')).toBe('none');
  });
  it('the preview closes with H, Enter or Escape and never starts anything', () => {
    for (const k of ['h', 'H', 'Enter', 'Escape']) expect(howToOnKey(preview, 'lobby', k)).toBe('close');
    expect(howToOnKey(preview, 'lobby', 'x')).toBe('none');
  });
});
