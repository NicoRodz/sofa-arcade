import { describe, expect, it } from 'vitest';
import { shouldShowHowTo } from './howto';

describe('phone how-to card', () => {
  it('shows on join (nothing seen yet) and when the game changes', () => {
    expect(shouldShowHowTo(null, 'pizzas', 'lobby')).toBe(true);
    expect(shouldShowHowTo('pizzas', 'other', 'lobby')).toBe(true);
    expect(shouldShowHowTo('pizzas', 'other', 'results')).toBe(true);
  });
  it('does not repeat for a game already shown (config re-sent, difficulty changed)', () => {
    expect(shouldShowHowTo('pizzas', 'pizzas', 'lobby')).toBe(false);
  });
  it('never opens over a round in progress', () => {
    expect(shouldShowHowTo(null, 'pizzas', 'playing')).toBe(false);
    expect(shouldShowHowTo('pizzas', 'other', 'playing')).toBe(false);
  });
});
