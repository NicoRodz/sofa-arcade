// The shell with a game it has never heard of: a fake catalog ('fake' and 'other'), two fake ScreenGames. The shell must send the round to the picked game,
// give `frame` only to the active one and call `activate` when the active game changes. A shell that names a game, or loops over all of them, fails here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, type GameManifest } from '@pichi/core/contract';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import type { MatchStart } from '@pichi/core';
import type { ScreenGame } from './game';

const sent: { t: string; [k: string]: unknown }[] = [];
vi.mock('../net/socket', () => ({ sendMsg: (m: { t: string }) => sent.push(m), socket: () => undefined, setSocket: () => {} }));
vi.stubGlobal('location', { search: '', host: 'x' });

const manifest = (id: string): GameManifest => ({ ...pizzasManifest, id, name: id });
const calls: string[] = [];
const fakeGame = (id: string): ScreenGame => {
  const m: MatchStart = { gameId: id, modeId: 'coop', mapId: 'm', difficulty: 'normal', teams: null, modeOptions: {} };
  return {
    manifest: manifest(id),
    lobby: { pickReset: () => ({}), render: () => {} },
    startMatch: () => {
      calls.push(`${id}:start`);
      return m;
    },
    frame: (d) => calls.push(`${id}:frame:${d}`),
    activate: () => calls.push(`${id}:activate`),
    results: { render: () => calls.push(`${id}:results`), scoreOf: () => (id === 'fake' ? 7 : 9) },
  };
};

let shell: typeof import('./app-state');
let frame: typeof import('./frame');

beforeEach(async () => {
  vi.resetModules();
  calls.length = 0;
  sent.length = 0;
  const { bindCatalog } = await import('./catalog');
  bindCatalog(createCatalog([manifest('fake'), manifest('other')]), { ...DEFAULT_CONFIG, game: 'fake' });
  const { registerGames } = await import('./game');
  registerGames([fakeGame('fake'), fakeGame('other')]);
  shell = await import('./app-state');
  frame = await import('./frame');
});

describe('the shell dispatches by the picked game (no game named)', () => {
  it('startMatch goes to the game picked in the config, and its answer rides in the phase message', () => {
    shell.app.config = { ...shell.app.config, game: 'other' };
    shell.setPhase('playing');
    expect(calls).toEqual(['other:start']);
    expect(sent.find((m) => m.t === 'phase')).toMatchObject({ phase: 'playing', match: { gameId: 'other' } });
    shell.app.config = { ...shell.app.config, game: 'fake' };
    shell.setPhase('results');
    shell.setPhase('playing');
    expect(calls.filter((c) => c.endsWith(':start'))).toEqual(['other:start', 'fake:start']);
  });
  it('the results screen and the scores of the phase message come from the active game', () => {
    shell.app.players.set(1, { info: { id: 1 } } as never);
    shell.app.config = { ...shell.app.config, game: 'other' };
    shell.setPhase('results');
    expect(calls).toEqual(['other:results']);
    expect(sent.find((m) => m.t === 'phase')).toMatchObject({ phase: 'results', scores: [{ id: 1, score: 9 }] });
  });
  it('frame reaches the active game only', () => {
    frame.runFrame(16);
    shell.app.config = { ...shell.app.config, game: 'other' };
    frame.runFrame(17);
    expect(calls.filter((c) => c.includes(':frame:'))).toEqual(['fake:frame:16', 'other:frame:17']);
  });
  it('activate runs on the first frame and every time the active game changes, never twice in a row', () => {
    frame.runFrame(16);
    frame.runFrame(16);
    expect(calls.filter((c) => c.endsWith(':activate'))).toEqual(['fake:activate']);
    shell.app.config = { ...shell.app.config, game: 'other' };
    frame.runFrame(16);
    frame.runFrame(16);
    shell.app.config = { ...shell.app.config, game: 'fake' };
    frame.runFrame(16);
    expect(calls.filter((c) => c.endsWith(':activate'))).toEqual(['fake:activate', 'other:activate', 'fake:activate']);
    expect(calls[0]).toBe('fake:activate'); // activate comes before that game's first frame
  });
});
