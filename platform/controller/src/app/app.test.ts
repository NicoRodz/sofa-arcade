// What the phone's old main.ts did that no layout test sees: the rejoin after a dropped socket (and the refusal that stops it), the phase handling (round score, the labels
// the round gave go with it, the pad released, the buzz falling back to a flash where there is no vibration) and the half-dead socket after a screen lock. Fake DOM, fake socket.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PING_MS, type ServerMsg } from '@pichi/core';
import type { ControllerGame } from '../contract';
import { createClock, createConnection } from './connect';
import { createDispatch, type DispatchDeps } from './dispatch';
import { createPhaseUi } from './phase';
import { NO_HINT, type Session } from './store';

vi.mock('./notes', () => ({ showNote: vi.fn() }));
vi.mock('../attention', () => ({ attend: () => {} }));

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send = (d: string) => this.sent.push(d);
  close = () => {
    this.readyState = 3;
    this.onclose?.();
  };
}

const texts = new Map<string, { textContent: string }>();
const classes = new Set<string>();
const root = {
  dataset: {} as Record<string, string>,
  classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
  querySelectorAll: () => [],
};
const session = (over: Partial<Session> = {}) =>
  ({
    root,
    $: (id: string) => {
      if (!texts.has(id)) texts.set(id, { textContent: '' });
      return texts.get(id);
    },
    games: [],
    host: {},
    pad: { x: 1, y: -1, btn: 3, presses: [0, 0], seq: 0, sig: { kind: 'go', seq: 0 }, go: true },
    ws: null,
    joined: false,
    halted: false,
    phase: 'menu',
    game: null,
    myId: 4,
    myName: 'Ana',
    captainId: null,
    room: 'r',
    token: 'tok',
    name: 'Ana',
    label: '',
    signalsOn: false,
    hint: { a: 'Vela', b: null },
    ...over,
  }) as unknown as Session;

beforeEach(() => {
  FakeSocket.all = [];
  texts.clear();
  classes.clear();
  root.dataset = {};
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { host: 'h:1' });
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.useRealTimers());

describe('the socket', () => {
  const setup = (s: Session) => {
    const render = vi.fn();
    const connect = createConnection(s, { dispatch: () => {}, clock: createClock(s), cap: { render } as never, joinExtra: () => ({}) });
    return { connect, render };
  };
  it('joins on open with the stored token, and rejoins half a second after a drop', () => {
    const s = session();
    const { connect, render } = setup(s);
    connect();
    const first = FakeSocket.all[0]!;
    first.readyState = 1;
    first.onopen?.();
    expect(JSON.parse(first.sent[0]!)).toMatchObject({ t: 'join', name: 'Ana', token: 'tok' });
    s.joined = true;
    first.close();
    expect(s.joined).toBe(false);
    expect(render).toHaveBeenCalled();
    expect(texts.get('hud')?.textContent).toBe('reconnecting...');
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(2);
  });
  it('a refused phone (halted) does not retry', () => {
    const s = session();
    const { connect } = setup(s);
    connect();
    s.halted = true;
    FakeSocket.all[0]!.close();
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(1);
  });
  it('the `error` message halts and shows its reason', () => {
    const s = session();
    const d = {
      ctl: {},
      howto: {},
      teams: {},
      cap: { menu: { onMessage: () => {} } },
      phaseUi: {},
      schools: [],
      creator: { onMessage: () => {} },
      pong: () => {},
    };
    createDispatch(s, d as unknown as DispatchDeps)({ t: 'error', reason: 'room full' } as ServerMsg);
    expect(s.halted).toBe(true);
    expect(texts.get('hud')?.textContent).toBe('room full');
  });
  it('after a lock the socket is stale once the server has been quiet for 3 pings', () => {
    const clock = createClock(session());
    clock.stamp();
    vi.advanceTimersByTime(3 * PING_MS - 1);
    expect(clock.silent()).toBe(false);
    vi.advanceTimersByTime(2);
    expect(clock.silent()).toBe(true);
    clock.pong({ t: 'pong', id: 99, ts: 0 } as never); // a pong, even an unknown one, proves the socket is alive
    expect(clock.silent()).toBe(false);
  });
});

describe('the phase', () => {
  const mk = (s: Session) => {
    const ctl = { setHint: vi.fn(), apply: vi.fn() };
    const watch = vi.fn();
    const sc = { show: vi.fn(), apply: vi.fn(), announce: vi.fn(), refreshCaptain: vi.fn() };
    const howto = { onPhase: vi.fn(), render: vi.fn() };
    const ui = createPhaseUi(s, {
      ctl,
      howto,
      cap: { watch: { show: watch } } as never,
      schools: [{ id: 'g1', ui: sc }],
    });
    return { ui, ctl, watch, sc, howto };
  };
  it('a round keeps the pad and the labels; leaving it releases the pad and drops the labels', () => {
    const s = session({ game: 'g1' });
    const t = mk(s);
    t.ui.show({ phase: 'playing' } as never, undefined);
    expect(s.pad).toMatchObject({ x: 1, btn: 3, go: true });
    expect(t.ctl.setHint).not.toHaveBeenCalled();
    t.ui.show({ phase: 'lobby' } as never, undefined);
    expect(t.ctl.setHint).toHaveBeenCalledWith(NO_HINT);
    expect(s.pad).toMatchObject({ x: 0, y: 0, btn: 0, go: false });
    expect(t.watch).toHaveBeenLastCalledWith(false, 'lobby');
  });
  it('the campaign pad shows only in a campaign round', () => {
    const s = session();
    const t = mk(s);
    t.ui.show({ phase: 'playing', match: { modeOptions: { campaign: true } } } as never, undefined);
    expect(s.signalsOn).toBe(true);
    expect(root.dataset.signals).toBe('on');
    t.ui.show({ phase: 'playing', match: { modeOptions: {} } } as never, undefined);
    expect(root.dataset.signals).toBe('off');
  });
  it('results: the score of this phone (else the first), then the game gets the phase; the school only shows for its game', () => {
    const s = session({ game: 'g1', myId: 4 });
    const t = mk(s);
    const game: ControllerGame = { id: 'g1', setupLabel: () => '', onPhase: vi.fn() };
    t.ui.show(
      {
        phase: 'results',
        scores: [
          { id: 2, score: 7 },
          { id: 4, score: 9 },
        ],
      } as never,
      game,
    );
    expect(texts.get('rank')?.textContent).toBe('9');
    expect(texts.get('myscore')?.textContent).toBe('puntos de equipo');
    t.ui.show({ phase: 'results', scores: [{ id: 2, score: 7 }] } as never, game);
    expect(texts.get('rank')?.textContent).toBe('7');
    expect(game.onPhase).toHaveBeenCalledTimes(2);
    t.ui.show({ phase: 'school' } as never, game);
    expect(t.sc.show).toHaveBeenLastCalledWith(true);
    s.game = 'other';
    t.ui.show({ phase: 'school' } as never, undefined);
    expect(t.sc.show).toHaveBeenLastCalledWith(false);
  });
  it('the buzz vibrates where it can and flashes where it cannot; never outside a round', () => {
    const s = session({ phase: 'lobby' });
    const t = mk(s);
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    t.ui.buzz('slip');
    expect(vibrate).not.toHaveBeenCalled();
    s.phase = 'playing';
    t.ui.buzz('slip');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(classes.has('flash')).toBe(false);
    vi.stubGlobal('navigator', {}); // iOS Safari: no vibration API
    t.ui.buzz('slip');
    expect(classes.has('flash')).toBe(true);
    vi.advanceTimersByTime(120);
    expect(classes.has('flash')).toBe(false);
  });
});
