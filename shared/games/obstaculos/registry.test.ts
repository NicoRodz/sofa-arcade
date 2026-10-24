import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '../../events';
import { ALL_GAMES, ALL_GAME_IDS, GAMES, GAME_IDS, HIDDEN_GAMES, gameInfo, gameName, gameProblems, isGameId } from '../../games';
import { isIconId } from '../../icons';
import { DEFAULT_CONFIG, configMsg, parseClientMessage } from '../../protocol';
import { GAME_ID } from './constants';
import type { ObstEvents } from './events';

const entry = HIDDEN_GAMES[0];

describe('registry entry (hidden until F3)', () => {
  it('passes the authoring check with the plan labels', () => {
    expect(entry.id).toBe(GAME_ID);
    expect(gameProblems(entry)).toEqual([]);
    expect([entry.controls.stick.label, entry.controls.btn1.label, entry.controls.btn2.label]).toEqual(['Moverse', 'Saltar', 'Agarrar']);
    expect(isIconId(entry.controls.btn1.icon)).toBe(true);
  });
  it('is not listed by the lobby (GAMES) but exists everywhere else', () => {
    expect(GAMES.map((g) => g.id)).not.toContain(GAME_ID);
    expect(ALL_GAMES.map((g) => g.id)).toContain(GAME_ID);
    expect(GAME_IDS).not.toContain(GAME_ID);
    expect(new Set(ALL_GAME_IDS).size).toBe(ALL_GAMES.length);
    expect(isGameId(GAME_ID)).toBe(true);
    expect(gameName(GAME_ID)).toBe('Obstáculos en cadena');
    expect(DEFAULT_CONFIG.game).toBe('pizzas'); // the default stays the first visible game
  });
  it('the phones get its labels through the config message and a screen config naming it parses', () => {
    expect(gameInfo(GAME_ID).controls.btn2.label).toBe('Agarrar');
    expect(configMsg({ ...DEFAULT_CONFIG, game: GAME_ID })).toMatchObject({ t: 'config', game: GAME_ID, controls: entry.controls });
    const raw = JSON.stringify({ t: 'config', game: GAME_ID, difficulty: 'normal', map: DEFAULT_CONFIG.map, seed: 7 });
    expect(parseClientMessage(raw)).toMatchObject({ t: 'config', game: GAME_ID });
    expect(parseClientMessage(raw.replace(GAME_ID, 'nope'))).toBeNull();
  });
});

describe('bus', () => {
  it('carries obst.* events next to the pizza events on one typed emitter', () => {
    const bus = new Emitter<GameEvents & ObstEvents>();
    const seen: string[] = [];
    bus.on('obst.jump', (p) => seen.push(`jump${p.player}:${p.kind}`));
    bus.on('roundEnd', () => seen.push('roundEnd'));
    bus.emit('obst.jump', { player: 3, kind: 'coyote' });
    bus.emit('roundEnd', { score: 1, delivered: 1 });
    expect(seen).toEqual(['jump3:coyote', 'roundEnd']);
  });
});
