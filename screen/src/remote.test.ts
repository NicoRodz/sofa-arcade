// The Captain's D-pad reaches the screen as the key it replaces and goes through the very same pure handlers as the Mac keyboard:
// whatever a key does in each state (menu, lobby, how-to card, results), the matching button does, and nothing else.
import { describe, expect, it } from 'vitest';
import { NAV_KEYS, navToKey, type NavKey } from '@party/shared';
import { GAMES, type GameDef } from '@party/shared/games';
import { HOWTO_MS, howToOnKey, isExpired, type HowToState } from './howto';
import { lobbyEscGoesBack, menuCards, menuOnKey } from './menu';

const pizzas = GAMES[0] as GameDef;
const mk = (id: string): GameDef => ({ ...structuredClone(pizzas), id, name: id, minPlayers: 1, maxPlayers: 8 });
const cards = menuCards(4, [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')], []); // 5 games: two rows of the 3-column grid
const KEYBOARD: Record<NavKey, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  ok: 'Enter',
  back: 'Escape',
  help: 'h',
};

describe('D-pad -> the same intents as the keyboard', () => {
  it('every button produces exactly the key it stands for', () => {
    for (const k of NAV_KEYS) expect(navToKey(k), k).toBe(KEYBOARD[k]);
  });
  it('start menu: the arrows move the highlight over the grid, OK picks the highlighted game', () => {
    expect(menuOnKey(cards, 0, navToKey('right'))).toEqual({ kind: 'move', sel: 1 });
    expect(menuOnKey(cards, 1, navToKey('left'))).toEqual({ kind: 'move', sel: 0 });
    expect(menuOnKey(cards, 1, navToKey('down'))).toEqual({ kind: 'move', sel: 4 });
    expect(menuOnKey(cards, 4, navToKey('up'))).toEqual({ kind: 'move', sel: 1 });
    expect(menuOnKey(cards, 2, navToKey('ok'))).toEqual({ kind: 'pick', id: 'c' });
    for (const k of NAV_KEYS)
      for (let sel = 0; sel < 5; sel++)
        expect(menuOnKey(cards, sel, navToKey(k)), `${k} on ${sel}`).toEqual(menuOnKey(cards, sel, KEYBOARD[k]));
  });
  it('start menu: the edges of the grid do nothing, like the keyboard', () => {
    expect(menuOnKey(cards, 0, navToKey('left'))).toEqual({ kind: 'none' });
    expect(menuOnKey(cards, 0, navToKey('up'))).toEqual({ kind: 'none' });
    expect(menuOnKey(cards, 4, navToKey('right'))).toEqual({ kind: 'none' });
    expect(menuOnKey(cards, 4, navToKey('down'))).toEqual({ kind: 'none' });
    expect(menuOnKey(cards, 0, navToKey('help'))).toEqual({ kind: 'none' }); // H only means something in a lobby
    expect(menuOnKey(cards, 0, navToKey('back'))).toEqual({ kind: 'none' });
  });
  it('a game outside its player range is refused with the same notice, not picked', () => {
    const few = menuCards(1, [{ ...mk('x'), minPlayers: 3 }], []);
    expect(menuOnKey(few, 0, navToKey('ok'))).toEqual({ kind: 'refuse', notice: few[0]!.notice });
  });
  it('lobby: back goes to the start menu, help opens the how-to card, unless a card or the iris owns the key', () => {
    expect(lobbyEscGoesBack('lobby', navToKey('back'), false, false)).toBe(true);
    expect(lobbyEscGoesBack('lobby', navToKey('back'), true, false)).toBe(false);
    expect(lobbyEscGoesBack('lobby', navToKey('back'), false, true)).toBe(false);
    expect(lobbyEscGoesBack('results', navToKey('back'), false, false)).toBe(false);
    expect(howToOnKey(null, 'lobby', navToKey('help'))).toBe('open-preview');
    expect(howToOnKey(null, 'menu', navToKey('help'))).toBe('none');
    expect(howToOnKey(null, 'results', navToKey('help'))).toBe('none');
  });
  it('how-to card before a round: OK skips it, nothing else does; the preview card closes with OK, back or help', () => {
    const start: HowToState = { mode: 'start', startedAt: 0 };
    expect(howToOnKey(start, 'lobby', navToKey('ok'))).toBe('skip');
    for (const k of NAV_KEYS.filter((x) => x !== 'ok')) expect(howToOnKey(start, 'lobby', navToKey(k)), k).toBe('none');
    const preview: HowToState = { mode: 'preview', startedAt: 0 };
    for (const k of ['ok', 'back', 'help'] as const) expect(howToOnKey(preview, 'lobby', navToKey(k)), k).toBe('close');
    for (const k of ['up', 'down', 'left', 'right'] as const) expect(howToOnKey(preview, 'lobby', navToKey(k)), k).toBe('none');
    expect(isExpired(start, HOWTO_MS - 1)).toBe(false); // sanity: the card was still running when OK arrived
  });
});
