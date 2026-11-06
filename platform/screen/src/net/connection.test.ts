// The screen's side of the relay: the player table the messages keep, who may drive the menus, and the reconnect loop.
// A phone that drops and comes back must be the same player (`back`), and a stranger's D-pad must never move the menus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, type GameManifest } from '@pichi/core/contract';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import type { ScreenGame } from '../shell/game';

const sent: { t: string; [k: string]: unknown }[] = [];
const keys: string[] = [];
const menu: string[] = [];
vi.mock('./socket', () => {
  let ws: unknown;
  return {
    sendMsg: (m: { t: string }) => sent.push(m),
    socket: () => ws,
    setSocket: (s: unknown) => {
      ws = s;
    },
  };
});
vi.mock('../vote/dpad-vote', () => ({ onKey: (k: string) => keys.push(k) }));
vi.mock('../lobby/menu-bridge', () => ({
  onMenuAct: () => menu.push('act'),
  scheduleMenu: (now: boolean) => menu.push(`schedule:${now}`),
}));
vi.stubGlobal('location', { search: '', host: 'tv.local:3200' });

const manifest: GameManifest = { ...pizzasManifest, id: 'fake', name: 'fake' };
const log: string[] = [];
const fakeGame = (): ScreenGame => ({
  manifest,
  lobby: { pickReset: () => ({}), render: () => {} },
  startMatch: () => ({ gameId: 'fake', modeId: 'coop', mapId: 'm', difficulty: 'normal', teams: null, modeOptions: {} }),
  frame: () => {},
  activate: () => {},
  results: { render: () => {}, scoreOf: () => 0 },
  players: {
    joined: (p) => log.push(`joined:${p.info.id}`),
    updated: (p, back) => log.push(`updated:${p.info.id}:${back}`),
    left: (p) => log.push(`left:${p.info.id}`),
    removed: (p) => log.push(`removed:${p.info.id}`),
    input: (p) => log.push(`input:${p.info.id}`),
  },
  message: (m) => log.push(`message:${(m as { t: string }).t}`),
});

const info = (id: number, connected = true) => ({ id, name: `p${id}`, color: '#fff', connected }) as never;

let conn: typeof import('./connection');
let shell: typeof import('../shell/app-state');
let latency: typeof import('./latency');

beforeEach(async () => {
  vi.resetModules();
  sent.length = keys.length = menu.length = log.length = 0;
  const { bindCatalog } = await import('../shell/catalog');
  bindCatalog(createCatalog([manifest]), { ...DEFAULT_CONFIG, game: 'fake' });
  const { registerGames } = await import('../shell/game');
  registerGames([fakeGame()]);
  shell = await import('../shell/app-state');
  latency = await import('./latency');
  conn = await import('./connection');
});
afterEach(() => vi.useRealTimers());

describe('player table', () => {
  it('a full state drops the players the relay no longer lists and keeps the rest', () => {
    conn.onMessage({ t: 'state', players: [info(1), info(2)] } as never);
    conn.onMessage({ t: 'state', players: [info(2)] } as never);
    expect([...shell.app.players.keys()]).toEqual([2]);
    expect(log).toContain('removed:1');
  });

  it('a phone that returns after dropping reaches the game as `back`, not as a new player', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    conn.onMessage({ t: 'player_left', playerId: 1 } as never);
    expect(shell.app.players.get(1)!.info.connected).toBe(false);
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    expect(log.filter((l) => l.startsWith('joined'))).toEqual(['joined:1']);
    expect(log.at(-1)).toBe('updated:1:true');
  });

  it('a first join is not `back`', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    expect(log).toEqual(['joined:1', 'updated:1:false']);
  });

  it('player_left zeroes the stick and a held button so a dropped phone cannot keep walking', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    conn.onMessage({ t: 'input', playerId: 1, x: 1, y: -1, btn: 2, presses: [0, 0], ts: 0 } as never);
    expect(shell.app.players.get(1)!.ctl).toEqual({ x: 1, y: -1, b: true });
    conn.onMessage({ t: 'player_left', playerId: 1 } as never);
    expect(shell.app.players.get(1)!.ctl).toEqual({ x: 0, y: 0, b: false });
    expect(log).toContain('left:1');
  });

  it('player_left for an unknown id is ignored', () => {
    conn.onMessage({ t: 'player_left', playerId: 99 } as never);
    expect(log).toEqual([]);
  });

  it('player_removed deletes the player and tells the games', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    conn.onMessage({ t: 'player_removed', playerId: 1 } as never);
    expect(shell.app.players.size).toBe(0);
    expect(log).toContain('removed:1');
  });

  it('appearance updates look and customizing flag without touching connection state', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    conn.onMessage({ t: 'appearance', playerId: 1, ap: { hat: 3 }, customizing: true } as never);
    const p = shell.app.players.get(1)!;
    expect(p.info).toMatchObject({ ap: { hat: 3 }, customizing: true, connected: true });
  });
});

describe('input', () => {
  const join = () => conn.onMessage({ t: 'player_joined', player: info(1) } as never);
  const input = (presses: number[], btn = 0) => conn.onMessage({ t: 'input', playerId: 1, x: 0, y: 0, btn, presses, ts: 5 } as never);

  it('input from an unknown player is dropped (a stale packet after player_removed)', () => {
    input([1, 0]);
    expect(shell.app.players.size).toBe(0);
    expect(log).toEqual([]);
  });

  it('the first packet is a baseline; later increments of the press counter become pending presses', () => {
    join();
    input([4, 0]);
    expect(shell.app.players.get(1)!.pendA).toBe(0);
    input([6, 1]);
    const p = shell.app.players.get(1)!;
    expect([p.pendA, p.pendB]).toEqual([2, 1]);
  });

  it('button 2 of the bitmask is the held action; button 1 alone is not', () => {
    join();
    input([0, 0], 1);
    expect(shell.app.players.get(1)!.ctl.b).toBe(false);
    input([0, 0], 2);
    expect(shell.app.players.get(1)!.ctl.b).toBe(true);
  });

  it('counts packets for the debug panel and forwards each one to the games', () => {
    join();
    input([0, 0]);
    input([0, 0]);
    expect(latency.latency.totalPkts).toBe(2);
    expect(log.filter((l) => l === 'input:1')).toHaveLength(2);
  });
});

describe('captain and D-pad', () => {
  beforeEach(() => {
    conn.onMessage({ t: 'state', players: [info(1), info(2)] } as never);
    conn.onMessage({ t: 'captain', playerId: 1 } as never);
  });

  it('a new Captain is stored and forces the menu form to redraw', () => {
    expect(shell.app.captainId).toBe(1);
    expect(menu).toContain('schedule:true');
  });

  it('the Captain D-pad becomes the keyboard key it replaces', () => {
    conn.onMessage({ t: 'nav', from: 1, key: 'down' } as never);
    expect(keys).toEqual(['ArrowDown']);
  });

  it('a phone that is not the Captain cannot move the menus', () => {
    conn.onMessage({ t: 'nav', from: 2, key: 'down' } as never);
    expect(keys).toEqual([]);
  });

  it('the Mac keyboard keeps the last word: a remote key right after a keypress is ignored, and works again after the quiet window', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    shell.app.lastKeyAt = 9_900;
    conn.onMessage({ t: 'nav', from: 1, key: 'down' } as never);
    expect(keys).toEqual([]);
    shell.app.lastKeyAt = 9_000;
    conn.onMessage({ t: 'nav', from: 1, key: 'down' } as never);
    expect(keys).toEqual(['ArrowDown']);
    vi.restoreAllMocks();
  });
});

describe('clock and RTT', () => {
  it('rtt stores the phone clock offset and records the sample', () => {
    conn.onMessage({ t: 'player_joined', player: info(1) } as never);
    conn.onMessage({ t: 'rtt', playerId: 1, rtt: 42, off: -17 } as never);
    const p = shell.app.players.get(1)!;
    expect(p.off).toBe(-17);
    expect(p.rtt).toEqual([42]);
  });

  it('pong measures the screen RTT from the perf timestamp the ping carried', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    conn.onMessage({ t: 'pong', id: 940, t0: 0, ts: 0 } as never);
    expect(latency.latency.screenRtt).toBe(60);
    vi.restoreAllMocks();
  });
});

describe('unknown messages', () => {
  it('go to the games, which own setTeam, assist, puesto...', () => {
    conn.onMessage({ t: 'setTeam', playerId: 1, team: 0 } as never);
    expect(log).toEqual(['message:setTeam']);
  });
});

describe('connect / reconnect', () => {
  class FakeWs {
    static all: FakeWs[] = [];
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onclose?: () => void;
    onmessage?: (e: { data: string }) => void;
    outbox: string[] = [];
    constructor(public url: string) {
      FakeWs.all.push(this);
    }
    send(s: string) {
      this.outbox.push(s);
    }
  }
  beforeEach(() => {
    FakeWs.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
  });
  afterEach(() => vi.unstubAllGlobals().stubGlobal('location', { search: '', host: 'tv.local:3200' }));

  it('joins the relay as the screen of its own room', () => {
    conn.connect();
    const u = new URL(FakeWs.all[0]!.url.replace('ws://', 'http://'));
    expect([u.host, u.pathname, u.searchParams.get('role'), u.searchParams.get('room')]).toEqual([
      'tv.local:3200',
      '/ws',
      'screen',
      shell.app.room,
    ]);
  });

  it('on open it re-announces the lobby config and the phase, so a relay restart does not lose the room', () => {
    shell.app.phase = 'playing';
    conn.connect();
    FakeWs.all[0]!.onopen!();
    expect(sent.map((m) => m.t)).toEqual(['config', 'phase']);
    expect(sent[1]).toMatchObject({ phase: 'playing' });
  });

  it('reconnects 500 ms after the socket closes, and keeps retrying', () => {
    conn.connect();
    FakeWs.all[0]!.onclose!();
    vi.advanceTimersByTime(499);
    expect(FakeWs.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWs.all).toHaveLength(2);
    FakeWs.all[1]!.onclose!();
    vi.advanceTimersByTime(500);
    expect(FakeWs.all).toHaveLength(3);
  });

  it('parses socket frames into onMessage', () => {
    conn.connect();
    FakeWs.all[0]!.onmessage!({ data: JSON.stringify({ t: 'player_joined', player: info(7) }) });
    expect(shell.app.players.has(7)).toBe(true);
  });

  it('pings only while the socket is open', () => {
    conn.startConnection();
    const ws = FakeWs.all[0]!;
    ws.readyState = 0;
    vi.advanceTimersByTime(1000);
    expect(ws.outbox).toEqual([]);
    ws.readyState = 1;
    vi.advanceTimersByTime(1000);
    expect(JSON.parse(ws.outbox[0]!)).toMatchObject({ t: 'ping' });
  });
});
