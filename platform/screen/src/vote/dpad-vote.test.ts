// Starting a round from the lobby by key / D-pad: Enter opens the how-to card, Enter again (or 10 s) starts, Esc goes back, and nothing
// the Captain taps during the iris or the card can start a round twice or with nobody connected.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, type GameManifest } from '@pichi/core/contract';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import type { ScreenGame } from '../shell/game';

const sent: { t: string; [k: string]: unknown }[] = [];
const menuActs: unknown[] = [];
const els = new Map<string, { cls: Set<string>; classList: object }>();
vi.mock('../net/socket', () => ({ sendMsg: (m: { t: string }) => sent.push(m), socket: () => undefined, setSocket: () => {} }));
vi.mock('../ui/dom', () => ({
  $: (id: string) => {
    if (!els.has(id)) {
      const cls = new Set<string>();
      els.set(id, { cls, classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c) }, addEventListener: () => {} } as never);
    }
    return els.get(id);
  },
}));
vi.mock('../screens/howto/view', () => ({ renderHowTo: () => {} }));
vi.mock('../lobby/focus-nav-dom', () => ({ lobbyFocusKey: () => false }));
vi.mock('../menu/view', () => ({ menuAct: (a: unknown) => menuActs.push(a) }));
vi.mock('../art/fx', () => ({ toggleShake: () => {} }));
vi.stubGlobal('location', { search: '', host: 'x' });

const manifest: GameManifest = { ...pizzasManifest, id: 'fake', name: 'fake' };
let beforeStart: (() => boolean) | undefined;
let gameKey: ((k: string, r: boolean) => boolean) | undefined;
let resultsEnter: (() => void) | undefined;
const fakeGame = (): ScreenGame => ({
  manifest,
  lobby: { pickReset: () => ({}), render: () => {}, beforeStart: () => beforeStart?.() ?? false },
  startMatch: () => ({ gameId: 'fake', modeId: 'coop', mapId: 'm', difficulty: 'normal', teams: null, modeOptions: {} }),
  frame: () => {},
  activate: () => {},
  key: (k, r) => gameKey?.(k, r) ?? false,
  results: { render: () => {}, scoreOf: () => 0, ...(resultsEnter ? { enter: () => resultsEnter!() } : {}) },
});

let shell: typeof import('../shell/app-state');
let vote: typeof import('./dpad-vote');
let flow: typeof import('../shell/round-flow');

const addPlayer = (id: number, connected = true) =>
  shell.app.players.set(id, { info: { id, slot: id, connected, name: `p${id}`, color: '#fff' } } as never);
const phases = () => sent.filter((m) => m.t === 'phase').map((m) => m.phase);

beforeEach(async () => {
  vi.resetModules();
  sent.length = menuActs.length = 0;
  els.clear();
  beforeStart = gameKey = resultsEnter = undefined;
  const { bindCatalog } = await import('../shell/catalog');
  bindCatalog(createCatalog([manifest]), { ...DEFAULT_CONFIG, game: 'fake' });
  const { registerGames } = await import('../shell/game');
  registerGames([fakeGame()]);
  shell = await import('../shell/app-state');
  vote = await import('./dpad-vote');
  flow = await import('../shell/round-flow');
  shell.app.phase = 'lobby';
  addPlayer(1);
});

describe('starting a round', () => {
  it('Enter in the lobby opens the start card; the round does not begin yet', () => {
    vote.onKey('Enter', false);
    expect(shell.app.howTo?.mode).toBe('start');
    expect(shell.app.starting).toBe(false); // the iris ran and ended
    expect(phases()).toEqual([]);
  });

  it('Enter on the card skips it and starts the round: lobby -> playing, with the 700 ms input gate', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    vote.onKey('Enter', false);
    vote.onKey('Enter', false);
    expect(shell.app.phase).toBe('playing');
    expect(shell.app.howTo).toBeNull();
    expect(shell.app.gateUntil).toBe(5700);
    expect(phases()).toEqual(['playing']);
    vi.restoreAllMocks();
  });

  it('the card runs out by itself after 10 s and then starts the round', () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    flow.initRoundFlow();
    vote.onKey('Enter', false);
    vi.advanceTimersByTime(9_800);
    expect(shell.app.phase).toBe('lobby');
    vi.advanceTimersByTime(400);
    expect(shell.app.phase).toBe('playing');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('nobody connected: Enter does nothing (no card, no round)', () => {
    shell.app.players.clear();
    addPlayer(2, false);
    vote.onKey('Enter', false);
    expect(shell.app.howTo).toBeNull();
    expect(shell.app.phase).toBe('lobby');
  });

  it('a held Enter (key repeat) never starts anything', () => {
    vote.onKey('Enter', true);
    expect(shell.app.howTo).toBeNull();
    expect(phases()).toEqual([]);
  });

  it('while the iris moves every key is swallowed: a second Enter cannot start the round behind the card', () => {
    shell.app.starting = true;
    vote.onKey('Enter', false);
    expect(shell.app.howTo).toBeNull();
    expect(shell.app.phase).toBe('lobby');
  });

  it('a game whose lobby takes over (the school) vetoes the start', () => {
    beforeStart = () => true;
    vote.onKey('Enter', false);
    expect(shell.app.howTo).toBeNull();
    expect(shell.app.starting).toBe(false);
  });

  it('a double beginRound while the iris is moving starts once', () => {
    let swaps = 0;
    shell.bindServices({ iris: (swap) => (swaps++, swap()) }); // iris never ends
    flow.beginRound();
    flow.beginRound();
    expect(swaps).toBe(1);
    expect(phases()).toEqual(['playing']);
  });
});

describe('howTo preview and Esc', () => {
  it('H opens the preview in the lobby, and H / Enter / Esc close it without starting', () => {
    for (const k of ['Enter', 'Escape', 'h']) {
      vote.onKey('h', false);
      expect(shell.app.howTo?.mode).toBe('preview');
      vote.onKey(k, false);
      expect(shell.app.howTo).toBeNull();
    }
    expect(shell.app.phase).toBe('lobby');
  });

  it('H outside the lobby opens nothing', () => {
    shell.app.phase = 'results';
    vote.onKey('h', false);
    expect(shell.app.howTo).toBeNull();
  });

  it('Esc in the lobby goes back to the menu; with the card open it only closes the card', () => {
    vote.onKey('h', false);
    vote.onKey('Escape', false);
    expect(shell.app.phase).toBe('lobby');
    vote.onKey('Escape', false);
    expect(shell.app.phase).toBe('menu');
    expect(phases()).toEqual(['menu']);
  });
});

describe('other phases', () => {
  it('in the menu the keys go to the menu, not to the round', () => {
    shell.app.phase = 'menu';
    vote.onKey('ArrowDown', false);
    expect(menuActs).toHaveLength(1);
    expect(shell.app.phase).toBe('menu');
  });

  it('Enter in results asks the game to continue, or plays again when it has no hook', () => {
    shell.app.phase = 'results';
    vote.onKey('Enter', false);
    expect(shell.app.phase).toBe('lobby'); // no `enter` hook: dispatch('again')
    shell.app.phase = 'results';
    let entered = 0;
    resultsEnter = () => entered++;
    return import('../shell/game').then(({ registerGames }) => {
      registerGames([fakeGame()]);
      vote.onKey('Enter', false);
      expect(entered).toBe(1);
      expect(shell.app.phase).toBe('results');
    });
  });

  it('a game that owns a key consumes it before the card or the lobby see it', () => {
    gameKey = (k) => k === 'Enter';
    vote.onKey('Enter', false);
    expect(shell.app.howTo).toBeNull();
  });
});
