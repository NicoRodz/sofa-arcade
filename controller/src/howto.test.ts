import { describe, expect, it } from 'vitest';
import { seenAfterPhase, shouldShowHowTo } from './howto';

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
  it('stays closed in the start menu: no game has been picked yet', () => {
    expect(shouldShowHowTo(null, 'pizzas', 'menu')).toBe(false);
    expect(shouldShowHowTo('other', 'pizzas', 'menu')).toBe(false);
  });
  it('shows when the screen leaves the menu for a game, every time it enters one', () => {
    let seen: string | null = null;
    seen = seenAfterPhase(seen, 'lobby');
    expect(shouldShowHowTo(seen, 'pizzas', 'lobby')).toBe(true); // first entry
    seen = 'pizzas';
    expect(shouldShowHowTo(seenAfterPhase(seen, 'lobby'), 'pizzas', 'lobby')).toBe(false); // same lobby, nothing new
    seen = seenAfterPhase(seen, 'menu'); // screen goes back to the menu...
    expect(seen).toBeNull();
    expect(shouldShowHowTo(seenAfterPhase(seen, 'lobby'), 'pizzas', 'lobby')).toBe(true); // ...and enters the same game again
    expect(seenAfterPhase('pizzas', 'results')).toBe('pizzas');
  });
});
