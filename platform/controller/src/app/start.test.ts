// startController: the wiring of the phone page. What it owns is the token and name in storage, when it joins (only through the form, or on a reopened page of the same room),
// that it joins once, and the reconnect hooks of a locked phone. The pieces it builds (socket, pad, lobby) have their own tests, so here they are fakes that record what start gives them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM, PING_MS } from '@pichi/core';
import type { ControllerGame } from '../contract';

const log = vi.hoisted(() => ({
  connect: vi.fn(),
  startPad: vi.fn(),
  begin: vi.fn(),
  init: vi.fn(),
  rtt: undefined as number | undefined,
  silent: false,
  ping: vi.fn(),
  hostSeen: undefined as unknown,
  captainSchools: undefined as unknown,
  session: undefined as any,
}));
vi.mock('../creator/creator', () => ({ createCreator: () => ({ begin: log.begin, joinExtra: () => ({}), onMessage: () => {} }) }));
vi.mock('./captain', () => ({
  createCaptain: (_s: unknown, schools: unknown) => {
    log.captainSchools = schools;
    return { render: () => {} };
  },
}));
vi.mock('./connect', () => ({
  createClock: (s: unknown) => ({
    ping: (() => {
      log.session = s;
      return log.ping;
    })(),
    rtt: () => log.rtt,
    silent: () => log.silent,
    pong: () => {},
    stamp: () => {},
  }),
  createConnection: () => log.connect,
}));
vi.mock('./controls', () => ({ createControls: () => ({}) }));
vi.mock('./dispatch', () => ({ createDispatch: () => () => {} }));
vi.mock('./howto', () => ({ createHowTo: () => ({}) }));
vi.mock('./phase', () => ({ createPhaseUi: () => ({ buzz: () => {} }) }));
vi.mock('./pad', () => ({ startPad: log.startPad }));
vi.mock('./teams', () => ({ createTeams: () => ({}) }));

import { startController } from './start';

type Handler = (e?: any) => void;
const nodes = new Map<string, any>();
const node = (id: string) => {
  if (!nodes.has(id)) {
    const handlers: Record<string, Handler> = {};
    nodes.set(id, {
      handlers,
      attrs: {} as Record<string, string>,
      textContent: '',
      value: '',
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      addEventListener(ev: string, fn: Handler) {
        handlers[ev] = fn;
      },
    });
  }
  return nodes.get(id);
};
const root = { dataset: {} as Record<string, string>, querySelector: (sel: string) => node(sel.slice(1)) };
const docHandlers: Record<string, Handler> = {};
const winHandlers: Record<string, Handler> = {};
let store: Record<string, string>;
let win: Record<string, unknown>;
let doc: { hidden: boolean; addEventListener: (e: string, f: Handler) => void };
let sock: { readyState: number; close: ReturnType<typeof vi.fn> };

const boot = (games: readonly ControllerGame[] = []) => startController({ root: root as never, games, catalog: {} as never });
const submit = () => node('join').handlers.submit!({ preventDefault: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
  nodes.clear();
  store = {};
  log.connect.mockClear();
  log.startPad.mockClear();
  log.begin.mockClear();
  log.ping.mockClear();
  log.rtt = undefined;
  log.silent = false;
  win = {};
  doc = {
    hidden: false,
    addEventListener: (e, f) => {
      docHandlers[e] = f;
    },
  };
  vi.stubGlobal('window', {
    ...win,
    addEventListener: (e: string, f: Handler) => {
      winHandlers[e] = f;
    },
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { search: '', host: 'tv.local' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  });
  sock = { readyState: 1, close: vi.fn() };
  vi.stubGlobal('WebSocket', { OPEN: 1 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('identity in storage', () => {
  it('a first visit mints a token and keeps it; the next visit reuses the same one', () => {
    boot();
    const first = store['pg.token'];
    expect(first).toMatch(/^[a-z0-9]{8,}$/);
    boot();
    expect(store['pg.token']).toBe(first);
  });
  it('the saved name is put into the form', () => {
    store['pg.name'] = 'Ana';
    boot();
    expect(node('name').attrs.value).toBe('Ana');
  });
  it('the pad is exposed to headless drivers as window.__pad', () => {
    boot();
    expect((window as unknown as { __pad: { go: boolean } }).__pad).toMatchObject({ x: 0, y: 0, go: false });
  });
});

describe('when it joins', () => {
  it('a fresh page waits for the form: no socket, no pad', () => {
    boot();
    expect(log.connect).not.toHaveBeenCalled();
    expect(log.startPad).not.toHaveBeenCalled();
    expect(root.dataset.view).toBeUndefined();
  });
  it('the form saves the trimmed name, starts the character creator, stores the room and joins once', () => {
    boot();
    node('name').value = '  Beto  ';
    submit();
    expect(store['pg.name']).toBe('Beto');
    expect(store['pg.room']).toBe(DEFAULT_ROOM);
    expect(log.begin).toHaveBeenCalledTimes(1);
    expect(log.startPad).toHaveBeenCalledTimes(1);
    expect(log.connect).toHaveBeenCalledTimes(1);
    expect(root.dataset.view).toBe('menu');
  });
  it('an empty name joins as Player', () => {
    boot();
    node('name').value = '   ';
    submit();
    expect(store['pg.name']).toBe('Player');
  });
  it('submitting twice does not start the pad or the socket a second time', () => {
    boot();
    node('name').value = 'Ana';
    submit();
    submit();
    expect(log.startPad).toHaveBeenCalledTimes(1);
    expect(log.connect).toHaveBeenCalledTimes(1);
  });
  it('a reopened page of the same room rejoins by itself with the stored name', () => {
    store['pg.name'] = 'Ana';
    store['pg.room'] = DEFAULT_ROOM;
    boot();
    expect(log.connect).toHaveBeenCalledTimes(1);
    expect(log.startPad).toHaveBeenCalledTimes(1);
  });
  it('a stored name for another room does not rejoin (the player picks again)', () => {
    store['pg.name'] = 'Ana';
    store['pg.room'] = 'OTRA';
    boot();
    expect(log.connect).not.toHaveBeenCalled();
  });
  it('a stored room without a name does not rejoin', () => {
    store['pg.room'] = DEFAULT_ROOM;
    boot();
    expect(log.connect).not.toHaveBeenCalled();
  });
  it('?room= wins over the default and is what gets stored', () => {
    vi.stubGlobal('location', { search: '?room=ABCD', host: 'tv.local' });
    boot();
    node('name').value = 'Ana';
    submit();
    expect(store['pg.room']).toBe('ABCD');
  });
});

describe('after joining', () => {
  const joined = () => {
    store['pg.name'] = 'Ana';
    store['pg.room'] = DEFAULT_ROOM;
    boot();
    log.connect.mockClear();
  };
  it('pings on the clock interval', () => {
    joined();
    vi.advanceTimersByTime(PING_MS * 3);
    expect(log.ping).toHaveBeenCalledTimes(3);
  });
  it('the hud shows the label and the round trip each second, only while joined and measured', () => {
    joined();
    log.session.label = 'Ana';
    log.rtt = 42.7;
    vi.advanceTimersByTime(1000);
    expect(node('hud').textContent).toBe(''); // not joined yet
    log.session.joined = true;
    log.rtt = undefined;
    vi.advanceTimersByTime(1000);
    expect(node('hud').textContent).toBe(''); // joined but no pong yet
    log.rtt = 42.7;
    vi.advanceTimersByTime(1000);
    expect(node('hud').textContent).toBe('Ana | 43 ms');
  });
  it('a visible page whose open socket went quiet (a locked phone) is dropped before reconnecting', () => {
    joined();
    log.session.ws = sock;
    log.silent = true;
    docHandlers.visibilitychange!();
    expect(sock.close).toHaveBeenCalledTimes(1);
    expect(log.connect).toHaveBeenCalledTimes(1);
  });
  it('an open socket that is still talking is left alone', () => {
    joined();
    log.session.ws = sock;
    docHandlers.visibilitychange!();
    expect(sock.close).not.toHaveBeenCalled();
  });
  it('a socket that is not open is not closed again (it is already on its way out)', () => {
    joined();
    sock.readyState = 3;
    log.session.ws = sock;
    log.silent = true;
    docHandlers.visibilitychange!();
    expect(sock.close).not.toHaveBeenCalled();
  });
  it('coming back to a visible page reconnects; a hidden page does nothing', () => {
    joined();
    doc.hidden = true;
    docHandlers.visibilitychange!();
    expect(log.connect).not.toHaveBeenCalled();
    doc.hidden = false;
    docHandlers.visibilitychange!();
    expect(log.connect).toHaveBeenCalledTimes(1);
  });
  it('pageshow (back-forward cache) reconnects', () => {
    joined();
    winHandlers.pageshow!();
    expect(log.connect).toHaveBeenCalledTimes(1);
  });
});

describe('games', () => {
  it('a game with a school gets the token, a sender and the Captain test; its ui goes to the Captain', () => {
    const ui = { id: 'ui' };
    let seen: { token: string; isCaptain: () => boolean } | undefined;
    const g = {
      id: 'g1',
      school: (o: typeof seen) => {
        seen = o;
        return ui;
      },
      init: log.init,
    } as unknown as ControllerGame;
    boot([g, { id: 'g2' } as unknown as ControllerGame]);
    expect(seen!.token).toBe(store['pg.token']);
    expect(seen!.isCaptain()).toBe(false); // not joined: nobody wears the crown
    expect(log.captainSchools).toEqual([ui]);
    expect(log.init).toHaveBeenCalledTimes(1);
  });
});
