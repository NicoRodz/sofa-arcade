// What each relay message does to the phone (dispatch.ts): the join that paints the player, the config that switches the pad to a game, the crown,
// the versus flag of a phase, and the order games / platform: a game that consumes a message keeps the platform from touching it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMsg } from '@pichi/core';
import { attend } from '../attention';
import { createDispatch, type DispatchDeps } from './dispatch';
import type { Session } from './store';

vi.mock('../attention', () => ({ attend: vi.fn() }));

const texts = new Map<string, { textContent: string }>();
const props: Record<string, string> = {};
const session = (over: Partial<Session> = {}) =>
  ({
    root: { dataset: {} as Record<string, string> },
    $: (id: string) => {
      if (!texts.has(id)) texts.set(id, { textContent: '' });
      return texts.get(id);
    },
    catalog: { name: (g: string) => `Juego ${g}` },
    games: [],
    host: { me: 'host' },
    joined: false,
    halted: false,
    game: null,
    myId: 0,
    myName: '',
    captainId: null,
    label: '',
    ...over,
  }) as unknown as Session;

const deps = () => {
  const d = {
    ctl: { apply: vi.fn(), setHint: vi.fn() },
    howto: { render: vi.fn() },
    teams: { apply: vi.fn(), show: vi.fn() },
    cap: { menu: { onMessage: vi.fn() }, render: vi.fn(), watch: { refresh: vi.fn(), setVersusRound: vi.fn() } },
    phaseUi: { show: vi.fn(), buzz: vi.fn() },
    schools: [{ id: 'sc', ui: { announce: vi.fn(), apply: vi.fn() } }],
    creator: { onMessage: vi.fn() },
    pong: vi.fn(),
  };
  return d;
};
const run = (s: Session, d: ReturnType<typeof deps>, m: unknown) => createDispatch(s, d as unknown as DispatchDeps)(m as ServerMsg);

beforeEach(() => {
  texts.clear();
  for (const k of Object.keys(props)) delete props[k];
  vi.mocked(attend).mockClear();
  vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => (props[k] = v) } } });
});

describe('every message', () => {
  it('goes to the cue, the captain menu and the creator before anything else', () => {
    const d = deps();
    const m = { t: 'buzz', kind: 'pick' };
    run(session({ myId: 9 }), d, m);
    expect(attend).toHaveBeenCalledWith(m, 9);
    expect(d.cap.menu.onMessage).toHaveBeenCalledWith(m);
    expect(d.creator.onMessage).toHaveBeenCalledWith(m);
  });
  it('a game that consumes a message keeps the platform from handling it; one that does not lets it through', () => {
    const d = deps();
    const s = session();
    const eat = vi.fn(() => true);
    const pass = vi.fn(() => false);
    s.games = [
      { id: 'a', onMessage: pass },
      { id: 'b', onMessage: eat },
      { id: 'c', onMessage: vi.fn() },
    ] as never;
    run(s, d, { t: 'error', reason: 'x' });
    expect(pass).toHaveBeenCalledWith(expect.anything(), s.host);
    expect(eat).toHaveBeenCalled();
    expect(s.games[2]!.onMessage).not.toHaveBeenCalled();
    expect(s.halted).toBe(false);
    s.games = [{ id: 'a', onMessage: pass }] as never;
    run(s, d, { t: 'error', reason: 'x' });
    expect(s.halted).toBe(true);
  });
});

describe('the platform messages', () => {
  it('joined: marks the phone joined, takes the colour and name, tells the schools and redraws', () => {
    const d = deps();
    const s = session();
    run(s, d, { t: 'joined', player: { id: 5, name: 'Ana', color: '#abc', slot: 2 } });
    expect(s).toMatchObject({ joined: true, myId: 5, myName: 'Ana' });
    expect(props['--c']).toBe('#abc');
    expect(d.schools[0]!.ui.announce).toHaveBeenCalledTimes(1);
    expect(texts.get('hud')!.textContent).toBe('Ana #3');
    expect(d.cap.render).toHaveBeenCalled();
  });
  it('config: switches to the game, names it and hands controls, how-to and teams to their owners', () => {
    const d = deps();
    const s = session();
    s.games = [{ id: 'arena', setupLabel: () => 'Arena: 3 rondas' }] as never;
    const m = { t: 'config', game: 'arena', controls: { a: 1 }, howTo: { h: 1 }, teams: [{ id: 0 }], teamsLocked: true };
    run(s, d, m);
    expect(s.game).toBe('arena');
    expect(s.root.dataset.game).toBe('arena');
    expect(texts.get('game')!.textContent).toBe('Juego arena');
    expect(d.ctl.apply).toHaveBeenCalledWith({ a: 1 });
    expect(d.howto.render).toHaveBeenCalledWith('arena', 'Juego arena', { h: 1 });
    expect(d.teams.apply).toHaveBeenCalledWith([{ id: 0 }], true);
    expect(texts.get('setup')!.textContent).toBe('Arena: 3 rondas');
  });
  it('config of a game the phone has no controller for falls back to the catalog name', () => {
    const d = deps();
    run(session(), d, { t: 'config', game: 'nuevo', controls: null, howTo: null, teams: null, teamsLocked: false });
    expect(texts.get('setup')!.textContent).toBe('Juego nuevo');
  });
  it('school goes to every school, you to the teams strip and the watch view', () => {
    const d = deps();
    const s = session();
    run(s, d, { t: 'school', step: 1 });
    expect(d.schools[0]!.ui.apply).toHaveBeenCalledWith({ t: 'school', step: 1 });
    run(s, d, { t: 'you', teamId: 1 });
    expect(d.teams.show).toHaveBeenCalledWith({ t: 'you', teamId: 1 });
    expect(d.cap.watch.refresh).toHaveBeenCalled();
  });
  it('phase: tells the watch view whether the round is versus, then shows it for the current game', () => {
    const d = deps();
    const game = { id: 'pizzas' };
    const s = session({ game: 'pizzas' });
    s.games = [game] as never;
    run(s, d, { t: 'phase', phase: 'playing', match: { modeId: 'versus' } });
    expect(d.cap.watch.setVersusRound).toHaveBeenLastCalledWith(true);
    expect(d.phaseUi.show).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'playing' }), game);
    run(s, d, { t: 'phase', phase: 'playing', match: { modeId: 'coop' } });
    expect(d.cap.watch.setVersusRound).toHaveBeenLastCalledWith(false);
    run(s, d, { t: 'phase', phase: 'lobby' });
    expect(d.cap.watch.setVersusRound).toHaveBeenLastCalledWith(false);
  });
  it('captain: remembers who holds the crown and redraws', () => {
    const d = deps();
    const s = session();
    run(s, d, { t: 'captain', playerId: 4 });
    expect(s.captainId).toBe(4);
    expect(d.cap.render).toHaveBeenCalled();
  });
  it('buzz, hint and pong each go to their owner; the hint without its type tag', () => {
    const d = deps();
    const s = session();
    run(s, d, { t: 'buzz', kind: 'slip' });
    expect(d.phaseUi.buzz).toHaveBeenCalledWith('slip');
    run(s, d, { t: 'hint', a: 'Vela', b: null });
    expect(d.ctl.setHint).toHaveBeenCalledWith({ a: 'Vela', b: null });
    run(s, d, { t: 'pong', id: 1, ts: 2 });
    expect(d.pong).toHaveBeenCalledWith({ t: 'pong', id: 1, ts: 2 });
  });
  it('an unknown message changes nothing', () => {
    const d = deps();
    const s = session();
    run(s, d, { t: 'whatever' });
    expect(s).toMatchObject({ joined: false, halted: false, game: null, captainId: null });
    expect(d.cap.render).not.toHaveBeenCalled();
  });
});
