import { describe, expect, it } from 'vitest';
import { COMING_SOON, GAMES, type GameDef } from '@party/shared/games';
import { SFX } from './audio/recipes';
import {
  GRID_COLS,
  NAV_SFX,
  availability,
  clampSel,
  lobbyEscGoesBack,
  menuCards,
  menuOnKey,
  menuPick,
  selectableCount,
  soundFor,
} from './menu';

const pizzas = GAMES[0] as GameDef;
const mk = (id: string, min: number, max: number): GameDef => ({
  ...structuredClone(pizzas),
  id,
  name: `Juego ${id}`,
  minPlayers: min,
  maxPlayers: max,
});
const liveOne: readonly GameDef[] = [pizzas]; // pizzas alone: the cards below do not depend on how many real games the registry has
const four = [mk('a', 1, 8), mk('b', 3, 4), mk('c', 2, 8), mk('d', 2, 8)]; // 4 games: a 2nd row of the grid
const cards4 = (n: number) => menuCards(n, four, []);
const ids = (n: number, games: readonly GameDef[] = four, soon = COMING_SOON) => menuCards(n, games, soon).map((c) => c.id);

describe('registry -> cards', () => {
  it('one card per registry game, in registry order, with name, blurb and player range from the registry', () => {
    const c = menuCards(4, GAMES, [])[0]!;
    expect(c).toMatchObject({ id: 'pizzas', name: pizzas.name, blurb: pizzas.blurb, range: '2 a 8 jugadores', state: 'ready', notice: '' });
    expect(ids(4, four, [])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('a game added to the registry gets its card by itself, with its own range', () => {
    const added = ids(4, [...liveOne, mk('nuevo', 3, 5)], []);
    expect(added).toEqual(['pizzas', 'nuevo']);
    expect(menuCards(4, [...liveOne, mk('nuevo', 3, 5)], [])[1]!.range).toBe('3 a 5 jugadores');
  });
  it('announced games show as "soon" after the live ones; once published they stop showing twice', () => {
    const before = menuCards(4, liveOne);
    expect(before.map((c) => c.id)).toEqual(['pizzas', ...COMING_SOON.map((s) => s.id)]);
    expect(before.slice(1).every((c) => c.state === 'soon' && c.notice === 'Próximamente')).toBe(true);
    const published = ids(4, [...liveOne, mk('arena', 2, 8)]); // an announced game moves into the registry
    expect(published.filter((x) => x === 'arena')).toHaveLength(1);
    expect(menuCards(4, [...liveOne, mk('arena', 2, 8)]).find((c) => c.id === 'arena')!.state).toBe('ready');
  });
});

describe('range -> enabled / disabled', () => {
  it('disabled below the minimum and above the maximum, with the count in the notice; enabled inside, edges included', () => {
    const g = mk('x', 3, 5);
    expect(availability(g, 2)).toEqual({ state: 'few', notice: 'Hay 2 jugadores: necesita al menos 3' });
    expect(availability(g, 3).state).toBe('ready');
    expect(availability(g, 5).state).toBe('ready');
    expect(availability(g, 6)).toEqual({ state: 'many', notice: 'Hay 6 jugadores: admite hasta 5' });
    expect(availability(g, 0).notice).toBe('Hay 0 jugadores: necesita al menos 3');
    expect(availability(mk('y', 2, 8), 1).notice).toBe('Hay 1 jugador: necesita al menos 2'); // singular
  });
  it('the real pizzas card follows the connected players: 0 and 1 wait, 2 to 8 play', () => {
    const state = (n: number) => menuCards(n)[0]!.state;
    expect([0, 1, 2, 8].map(state)).toEqual(['few', 'few', 'ready', 'ready']);
  });
  it('the real obstaculos card is published: 1 player is too few, 2 to 8 play, and it is no longer announced', () => {
    const card = (n: number) => menuCards(n).find((c) => c.id === 'obstaculos')!;
    expect([1, 2, 8].map((n) => card(n).state)).toEqual(['few', 'ready', 'ready']);
    expect(card(4).range).toBe('2 a 8 jugadores');
    expect(menuCards(4).filter((c) => c.id === 'obstaculos')).toHaveLength(1);
  });
  it('a disabled card refuses to be picked (with the reason); a ready one is picked; a soon card does nothing', () => {
    expect(menuPick(cards4(1), 'b')).toEqual({ kind: 'refuse', notice: 'Hay 1 jugador: necesita al menos 3' });
    expect(menuPick(cards4(3), 'b')).toEqual({ kind: 'pick', id: 'b' });
    expect(menuPick(menuCards(4), COMING_SOON[0]!.id)).toEqual({ kind: 'none' });
    expect(menuPick(cards4(3), 'nope')).toEqual({ kind: 'none' });
  });
});

describe('keyboard selection', () => {
  it('arrows move one card sideways and one row up or down, and stop at the edges', () => {
    const c = cards4(3);
    expect(GRID_COLS).toBe(3);
    expect(menuOnKey(c, 0, 'ArrowRight')).toEqual({ kind: 'move', sel: 1 });
    expect(menuOnKey(c, 1, 'ArrowLeft')).toEqual({ kind: 'move', sel: 0 });
    expect(menuOnKey(c, 0, 'ArrowLeft')).toEqual({ kind: 'none' });
    expect(menuOnKey(c, 0, 'ArrowDown')).toEqual({ kind: 'move', sel: 3 }); // 4th card, second row
    expect(menuOnKey(c, 3, 'ArrowUp')).toEqual({ kind: 'move', sel: 0 });
    expect(menuOnKey(c, 1, 'ArrowDown')).toEqual({ kind: 'none' }); // nothing under card 2
    expect(menuOnKey(c, 3, 'ArrowRight')).toEqual({ kind: 'none' }); // last card
  });
  it('the highlight never lands on an announced card', () => {
    const c = menuCards(4, liveOne); // pizzas + the announced ones
    expect(selectableCount(c)).toBe(1);
    expect(menuOnKey(c, 0, 'ArrowRight')).toEqual({ kind: 'none' });
    expect(menuOnKey(c, 0, 'ArrowDown')).toEqual({ kind: 'none' });
    expect(clampSel(c, 2)).toBe(0);
    expect(clampSel(c, -3)).toBe(0);
  });
  it('Enter (or Space) picks the highlighted card when it is playable and refuses when it is not', () => {
    expect(menuOnKey(cards4(3), 1, 'Enter')).toEqual({ kind: 'pick', id: 'b' });
    expect(menuOnKey(cards4(3), 2, ' ')).toEqual({ kind: 'pick', id: 'c' });
    expect(menuOnKey(cards4(2), 1, 'Enter')).toMatchObject({ kind: 'refuse' }); // b needs 3
    expect(menuOnKey(cards4(2), 99, 'Enter')).toEqual({ kind: 'pick', id: 'd' }); // stale selection is clamped
  });
  it('other keys do nothing', () => {
    for (const k of ['a', 'Escape', 'Tab', 'h']) expect(menuOnKey(cards4(3), 0, k)).toEqual({ kind: 'none' });
  });
});

describe('navigation sound and Esc', () => {
  it('each action maps to a synthesised UI voice that exists; moving, picking and back differ; refusing reuses the game buzz', () => {
    expect(soundFor({ kind: 'move', sel: 1 })).toBe('move');
    expect(soundFor({ kind: 'pick', id: 'a' })).toBe('pick');
    expect(soundFor({ kind: 'refuse', notice: '' })).toBe('refuse');
    expect(soundFor({ kind: 'none' })).toBeNull();
    expect(new Set(Object.values(NAV_SFX)).size).toBe(4);
    for (const id of Object.values(NAV_SFX)) expect(SFX[id]).toBeDefined();
    for (const id of [NAV_SFX.move, NAV_SFX.pick, NAV_SFX.back]) expect(SFX[id].bus).toBe('ui');
  });
  it('Esc goes back to the menu only from the lobby, with no how-to card open and no round starting', () => {
    expect(lobbyEscGoesBack('lobby', 'Escape', false, false)).toBe(true);
    expect(lobbyEscGoesBack('lobby', 'Escape', true, false)).toBe(false);
    expect(lobbyEscGoesBack('lobby', 'Escape', false, true)).toBe(false);
    expect(lobbyEscGoesBack('lobby', 'Enter', false, false)).toBe(false);
    for (const ph of ['menu', 'playing', 'results']) expect(lobbyEscGoesBack(ph, 'Escape', false, false)).toBe(false);
  });
});
