// The shell's side of the Captain's menu: when a snapshot goes out (only on a change, debounced, to a new Captain even without one), and how a touch is judged
// (who sent it, the lobby open, the game's verdict, a stale `start`).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuBody } from '@pichi/core';
import { obstaculosManifest } from '@pichi/game-obstaculos/manifest';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';

const sent: any[] = [];
vi.mock('../net/socket', () => ({ sendMsg: (m: unknown) => sent.push(m), socket: () => undefined, setSocket: () => {} }));
vi.stubGlobal('location', { search: '', host: 'x' });

let app: typeof import('../shell/app-state').app;
let bridge: typeof import('./menu-bridge');
let body: MenuBody | null;
let verdict: { ok: true } | { ok: false; code: 'stale' | 'disabled'; msg: string };
const acts: unknown[] = [];

const mk = (value: string): MenuBody => ({
  screen: 'lobby',
  rows: [{ id: 'difficulty', label: 'Dificultad', kind: 'choice', value, options: [{ id: 'easy', label: 'Fácil', enabled: true }] }],
  primary: { id: 'start', label: '¡A cocinar!', enabled: true, summary: ['x'] },
});
const touch = (over: object = {}) => ({
  t: 'menuAct' as const,
  from: 7,
  rev: 1,
  act: 'set' as const,
  row: 'difficulty',
  value: 'easy',
  ...over,
});

beforeAll(async () => {
  const gameMod = await import('../shell/game');
  const stub = (manifest: unknown, lobby: object = {}) => ({ manifest, lobby }) as never;
  gameMod.registerGames([
    stub(pizzasManifest, {
      menu: () => body,
      menuAct: (a: unknown, rev: number) => {
        acts.push([a, rev]);
        return verdict;
      },
    }),
    stub(obstaculosManifest),
  ]);
  app = (await import('../shell/app-state')).app;
  bridge = await import('./menu-bridge');
});
beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  acts.length = 0;
  bridge.resetMenuBridge();
  app.phase = 'lobby';
  app.captainId = 7;
  app.config = { ...app.config, game: 'pizzas' };
  app.starting = false;
  app.howTo = null;
  body = mk('normal');
  verdict = { ok: true };
});
afterEach(() => vi.useRealTimers());

const flush = () => vi.advanceTimersByTime(bridge.MENU_DEBOUNCE_MS + 1);
const menus = () => sent.filter((m) => m.t === 'menu');

describe('publishing the form', () => {
  it('sends one snapshot per burst of changes (debounced) and none when the content did not change', () => {
    bridge.scheduleMenu();
    bridge.scheduleMenu();
    bridge.scheduleMenu();
    expect(menus()).toHaveLength(0);
    flush();
    expect(menus()).toHaveLength(1);
    expect(menus()[0]).toMatchObject({ t: 'menu', rev: 1, screen: 'lobby' });
    bridge.scheduleMenu();
    flush();
    expect(menus()).toHaveLength(1); // same content: nothing new
    body = mk('hard');
    bridge.scheduleMenu();
    flush();
    expect(menus().map((m) => m.rev)).toEqual([1, 2]);
  });
  it('a forced send (a new Captain) repeats the content with the same revision', () => {
    bridge.scheduleMenu();
    flush();
    bridge.scheduleMenu(true);
    flush();
    expect(menus().map((m) => m.rev)).toEqual([1, 1]);
  });
  it('sends nothing outside the lobby, without a Captain, or for a game with no form', () => {
    app.phase = 'playing';
    bridge.scheduleMenu();
    flush();
    app.phase = 'lobby';
    app.captainId = null;
    bridge.scheduleMenu();
    flush();
    app.captainId = 7;
    body = null;
    bridge.scheduleMenu();
    flush();
    expect(menus()).toHaveLength(0);
  });
});

describe('judging a touch', () => {
  it("passes the Captain's touch to the game with the current revision", () => {
    bridge.onMenuAct(touch());
    expect(acts).toEqual([[expect.objectContaining({ act: 'set', value: 'easy' }), 1]]);
    expect(sent.filter((m) => m.t === 'menuErr')).toEqual([]);
  });
  it('ignores a touch that does not come from the Captain', () => {
    bridge.onMenuAct(touch({ from: 8 }));
    app.captainId = null;
    bridge.onMenuAct(touch());
    expect(acts).toEqual([]);
    expect(sent).toEqual([]);
  });
  it('flushes a pending change before judging, so a start with the old revision is stale', () => {
    bridge.scheduleMenu();
    flush(); // rev 1 is out
    body = mk('hard'); // the keyboard changed something less than 50 ms ago: not published yet
    bridge.onMenuAct(touch({ act: 'start', rev: 1 }));
    expect(acts).toEqual([[expect.objectContaining({ act: 'start' }), 2]]); // the game saw rev 2: it can answer stale
  });
  it('relays a refusal as menuErr and re-sends the form as it is', () => {
    verdict = { ok: false, code: 'stale', msg: 'Cambió la configuración' };
    bridge.onMenuAct(touch({ act: 'start' }));
    expect(sent.filter((m) => m.t === 'menuErr')).toEqual([{ t: 'menuErr', rev: 1, code: 'stale', msg: 'Cambió la configuración' }]);
    expect(menus().length).toBeGreaterThanOrEqual(1);
    expect(sent.at(-1)).toMatchObject({ t: 'menu', rev: 1 });
  });
  it('refuses while the lobby is not open (another phase, the how-to card, the iris), without asking the game', () => {
    app.phase = 'playing';
    bridge.onMenuAct(touch());
    app.phase = 'lobby';
    app.starting = true;
    bridge.onMenuAct(touch());
    expect(acts).toEqual([]);
    expect(sent.filter((m) => m.t === 'menuErr')).toHaveLength(2);
  });
});

describe('captain banner', () => {
  it('pure state: shown with a form, hidden when the Captain acts and re-armed when the form goes (no document in node: it must not throw)', async () => {
    const b = await import('./captain-banner');
    expect(() => {
      b.bannerForm(true);
      b.bannerActed();
      b.bannerForm(false);
    }).not.toThrow();
  });
});
