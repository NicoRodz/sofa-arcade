import { describe, expect, it } from 'vitest';
import { KEYBOARD_QUIET_MS, NAV_KEYS, NAV_TO_KEY, acceptNav, captainOf, isNavKey, navToKey, remoteBlocked, remoteVisible } from './captain';

const P = (id: number, connected = true) => ({ id, connected });

describe('captainOf: the first player connected holds the crown', () => {
  it('is the lowest id among the connected ones, whatever order the list comes in', () => {
    expect(captainOf([P(3), P(1), P(2)])).toBe(1);
    expect(captainOf([P(5), P(2)])).toBe(2);
  });
  it('passes to the next one who joined when the captain drops, and rotates again down the line', () => {
    expect(captainOf([P(1, false), P(2), P(3)])).toBe(2);
    expect(captainOf([P(1, false), P(2, false), P(3)])).toBe(3);
  });
  it('goes back to the first player when they reconnect (a locked phone must not lose the crown for good)', () => {
    expect(captainOf([P(1), P(2), P(3)])).toBe(1);
  });
  it('a player who joins later never takes it from an earlier one', () => {
    expect(captainOf([P(1), P(4)])).toBe(1);
  });
  it('is null when nobody is connected, and with nobody at all', () => {
    expect(captainOf([P(1, false), P(2, false)])).toBeNull();
    expect(captainOf([])).toBeNull();
  });
});

describe('acceptNav: only the captain moves the menus', () => {
  it('accepts the captain and refuses everyone else', () => {
    expect(acceptNav(2, 2)).toBe(true);
    expect(acceptNav(2, 1)).toBe(false);
    expect(acceptNav(2, 3)).toBe(false);
  });
  it('refuses everything while nobody holds the crown', () => {
    expect(acceptNav(null, 1)).toBe(false);
    expect(acceptNav(null, null)).toBe(false);
  });
  it('refuses an id that is not the number the relay stamped (a string "2", a missing from)', () => {
    expect(acceptNav(2, '2')).toBe(false);
    expect(acceptNav(2, undefined)).toBe(false);
  });
});

describe('the D-pad speaks the keyboard', () => {
  it('has exactly the keys of the plan: 4 arrows, OK, Atrás, ? (help)', () => {
    expect([...NAV_KEYS]).toEqual(['up', 'down', 'left', 'right', 'ok', 'back', 'help']);
    expect(Object.keys(NAV_TO_KEY).sort()).toEqual([...NAV_KEYS].sort());
  });
  it('maps each button to the KeyboardEvent.key the Mac keyboard already sends', () => {
    expect(navToKey('up')).toBe('ArrowUp');
    expect(navToKey('down')).toBe('ArrowDown');
    expect(navToKey('left')).toBe('ArrowLeft');
    expect(navToKey('right')).toBe('ArrowRight');
    expect(navToKey('ok')).toBe('Enter');
    expect(navToKey('back')).toBe('Escape');
    expect(navToKey('help')).toBe('h');
  });
  it('isNavKey is a closed list', () => {
    expect(NAV_KEYS.every(isNavKey)).toBe(true);
    for (const bad of ['', 'UP', 'Enter', 'ArrowUp', 'start', 7, null, undefined, {}, '__proto__', 'toString'])
      expect(isNavKey(bad)).toBe(false);
  });
});

describe('the keyboard keeps the last word', () => {
  it('drops a remote intent that lands within the quiet window after a key press, and lets it through after', () => {
    expect(remoteBlocked(1000, 1000 + KEYBOARD_QUIET_MS - 1)).toBe(true);
    expect(remoteBlocked(1000, 1000 + KEYBOARD_QUIET_MS)).toBe(false);
    expect(remoteBlocked(1000, 1000)).toBe(true);
  });
  it('a keyboard that was never touched blocks nothing', () => {
    expect(remoteBlocked(null, 5)).toBe(false);
  });
});

describe('where the D-pad is visible', () => {
  it('only the captain, only while joined, on every screen but the round', () => {
    for (const phase of ['menu', 'lobby', 'results']) expect(remoteVisible(true, true, phase), phase).toBe(true);
    expect(remoteVisible(true, true, 'playing')).toBe(false);
    expect(remoteVisible(false, true, 'menu')).toBe(false);
    expect(remoteVisible(true, false, 'menu')).toBe(false);
  });
});
