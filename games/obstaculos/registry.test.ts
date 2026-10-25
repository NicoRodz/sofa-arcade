import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { COMING_SOON, GAMES, GAME_IDS, gameInfo, gameName, gameProblems, isGameId } from '@pichi/core/games';
import { isIconId } from '@pichi/core/icons';
import { DEFAULT_CONFIG, configMsg, parseClientMessage } from '@pichi/core';
import { GAME_ID } from './constants';
import { DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import { parseObstOptions, setupLabel, toModeOptions } from './lobby';
import type { ObstEvents } from './events';

const entry = GAMES.find((g) => g.id === GAME_ID)!;

describe('registry entry (published by F3)', () => {
  it('passes the authoring check with the plan labels', () => {
    expect(entry.id).toBe(GAME_ID);
    expect(gameProblems(entry)).toEqual([]);
    expect([entry.controls.stick.label, entry.controls.btn1.label, entry.controls.btn2.label]).toEqual(['Moverse', 'Saltar', 'Agarrar']);
    expect(isIconId(entry.controls.btn1.icon)).toBe(true);
  });
  it('is listed by the menu with its 2-8 range and no longer announced as "soon"', () => {
    expect(GAMES.map((g) => g.id)).toContain(GAME_ID);
    expect(GAME_IDS).toContain(GAME_ID);
    expect(entry).toMatchObject({ minPlayers: 2, maxPlayers: 8 });
    expect(COMING_SOON.map((s) => s.id)).not.toContain(GAME_ID);
    expect(isGameId(GAME_ID)).toBe(true);
    expect(gameName(GAME_ID)).toBe('Obstáculos en cadena');
    expect(DEFAULT_CONFIG.game).toBe('pizzas'); // the default stays the first game
  });
  it('the phones get its labels through the config message and a screen config naming it parses', () => {
    expect(gameInfo(GAME_ID).controls.btn2.label).toBe('Agarrar');
    expect(configMsg({ ...DEFAULT_CONFIG, game: GAME_ID })).toMatchObject({ t: 'config', game: GAME_ID, controls: entry.controls });
    const raw = JSON.stringify({ t: 'config', game: GAME_ID, difficulty: 'normal', map: DEFAULT_CONFIG.map, seed: 7 });
    expect(parseClientMessage(raw)).toMatchObject({ t: 'config', game: GAME_ID });
    expect(parseClientMessage(raw.replace(GAME_ID, 'nope'))).toBeNull();
  });
});

describe('the lobby choices travel in the generic config (modeOptions) and reach the phones', () => {
  it('mode and level survive the screen -> relay -> phone trip, and a malformed one falls back to the defaults on the phone side', () => {
    const raw = JSON.stringify({
      t: 'config',
      game: GAME_ID,
      difficulty: 'hard',
      map: DEFAULT_CONFIG.map,
      seed: 4242,
      modeOptions: toModeOptions({ tether: 'free', level: 9 }),
    });
    const m = parseClientMessage(raw);
    expect(m).toMatchObject({ t: 'config', game: GAME_ID, modeOptions: { tether: 'free', level: 9 } });
    const { t: _t, ...cfg } = m as Extract<NonNullable<typeof m>, { t: 'config' }>;
    const msg = configMsg({ ...DEFAULT_CONFIG, ...cfg });
    expect(setupLabel(parseObstOptions(msg.modeOptions), msg.difficulty, msg.seed, DIFFICULTY_LABEL)).toBe(
      'Difícil · Libres · Desde el nivel 9',
    );
    expect(parseObstOptions({ tether: 7, level: -3 })).toEqual({ tether: 'chain', level: 1 });
    const bad = JSON.stringify({
      t: 'config',
      game: GAME_ID,
      difficulty: 'hard',
      map: DEFAULT_CONFIG.map,
      seed: 1,
      modeOptions: { a: { nested: true } },
    });
    expect(parseClientMessage(bad)).toBeNull();
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
