// The phone's dispatcher with a game it has never heard of ('fake'): the setup line must come from the game's own setupLabel (a lobby of a game the phone has no
// ControllerGame for shows the catalog's name), and a game whose onMessage returns true must cut the platform's own handling. A dispatcher that names a game, or
// ignores setupLabel or the return of onMessage, fails here. The DOM is a fake of the few elements the dispatcher touches.
import { describe, expect, it, vi } from 'vitest';
import type { ServerMsg } from '@pichi/core';
import { createCatalog, type GameManifest } from '@pichi/core/contract';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import type { ControllerGame } from './contract';
import { createDispatch, type DispatchDeps } from './app/dispatch';
import type { Session } from './app/store';

vi.mock('./attention', () => ({ attend: () => {} }));
vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {} } } });

const manifest = (id: string): GameManifest => ({ ...pizzasManifest, id, name: `Name of ${id}` });
const catalog = createCatalog([manifest('fake'), manifest('other')]);

const setup = (games: ControllerGame[]) => {
  const els = new Map<string, { textContent: string }>();
  const s = {
    games,
    catalog,
    host: {},
    root: { dataset: {} as Record<string, string> },
    $: (id: string) => {
      if (!els.has(id)) els.set(id, { textContent: '' });
      return els.get(id);
    },
    game: null as string | null,
    myId: 7,
    captainId: null,
    joined: false,
    myName: '',
    label: '',
    halted: false,
  } as unknown as Session;
  const calls: string[] = [];
  const d = {
    ctl: { apply: () => calls.push('controls'), setHint: () => {} },
    howto: { render: () => calls.push('howto'), onPhase: () => {} },
    teams: { apply: () => calls.push('teams'), show: () => {} },
    cap: { menu: { onMessage: () => {} }, render: () => calls.push('captain'), watch: { refresh: () => {}, setVersusRound: () => {} } },
    phaseUi: { show: (_m: unknown, g?: ControllerGame) => calls.push(`phase:${g?.id ?? 'none'}`), buzz: () => calls.push('buzz') },
    schools: [],
    creator: { onMessage: () => {} },
    pong: () => {},
  } as unknown as DispatchDeps;
  return { s, calls, dispatch: createDispatch(s, d), text: (id: string) => els.get(id)?.textContent };
};
const config = (game: string) =>
  ({
    t: 'config',
    game,
    difficulty: 'normal',
    map: 'm',
    seed: 5,
    modeId: 'coop',
    teams: null,
    teamsLocked: false,
    modeOptions: {},
    controls: {},
    howTo: {},
  }) as unknown as ServerMsg;

describe('the controller dispatcher', () => {
  it("shows the setup line of the game's own setupLabel", () => {
    const fake: ControllerGame = { id: 'fake', setupLabel: (c) => `fake line, seed ${c.seed}` };
    const t = setup([fake]);
    t.dispatch(config('fake'));
    expect(t.text('setup')).toBe('fake line, seed 5');
    expect(t.text('game')).toBe('Name of fake');
    expect(t.calls).toEqual(['controls', 'howto', 'teams']);
  });
  it("a game with no ControllerGame shows the catalog's name", () => {
    const t = setup([{ id: 'fake', setupLabel: () => 'x' }]);
    t.dispatch(config('other'));
    expect(t.text('setup')).toBe('Name of other');
  });
  it('a message the game consumes never reaches the platform', () => {
    const onMessage = vi.fn((m: ServerMsg) => m.t === 'captain');
    const t = setup([{ id: 'fake', setupLabel: () => '', onMessage }]);
    t.dispatch({ t: 'captain', playerId: 7 } as ServerMsg);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(t.calls).toEqual([]); // consumed: no captain render
    expect(t.s.captainId).toBe(null);
    t.dispatch({ t: 'buzz', playerId: 7, kind: 'slip' } as ServerMsg);
    expect(t.calls).toEqual(['buzz']); // not consumed: the platform handles it
  });
  it('hands the phase to the game of the last config', () => {
    const t = setup([
      { id: 'fake', setupLabel: () => 'a' },
      { id: 'other', setupLabel: () => 'b' },
    ]);
    t.dispatch({ t: 'phase', phase: 'lobby' } as ServerMsg);
    t.dispatch(config('other'));
    t.dispatch({ t: 'phase', phase: 'lobby' } as ServerMsg);
    expect(t.calls.filter((c) => c.startsWith('phase'))).toEqual(['phase:none', 'phase:other']);
  });
});
