// The Pizzas lobby's coherence rules on the real shell state: what a mode change, a team move or a player joining or leaving does to the config the phones see.
// Only the socket is a fake: `sent` holds what syncLobby's own patches put on the wire.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@pichi/core';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { app, bindServices } from '@pichi/screen-kit/shell';
import { VERSUS_MAPS, versusMap } from '../../sim/versus/maps';
import { defaultVersusChoice, versusMapStatus, VERSUS_AUTO } from '../../sim/versus/lobby';
import { pz } from '../state';
import { setMode, syncLobby, versusGenerated } from './sync';

vi.hoisted(() => vi.stubGlobal('location', { search: '', host: 'x' })); // the shell reads ?room= when it loads
afterAll(() => vi.unstubAllGlobals());

const sent: { t: string; [k: string]: unknown }[] = [];
vi.mock('phaser', () => ({ default: {} })); // the shell barrel imports the Phaser host; this file never creates a Game
vi.mock('@pichi/screen-kit/net', () => ({ sendMsg: (m: { t: string }) => sent.push(m) }));

const ui: string[] = [];
let renders = 0;
const seat = (n: number, over: Partial<PublicPlayer> = {}) => {
  app.players.clear();
  for (let i = 0; i < n; i++)
    app.players.set(i + 1, { info: { id: i + 1, slot: i, name: `P${i + 1}`, connected: true, ...over } } as never);
};
const cfg = () => app.config;
const versusLobby = (n = 4) => {
  seat(n);
  setMode('versus');
  sent.length = 0;
};

beforeEach(() => {
  sent.length = 0;
  ui.length = 0;
  renders = 0;
  bindServices({ ui: (id) => void ui.push(id), render: () => void renders++ });
  app.phase = 'lobby';
  app.config = { ...DEFAULT_CONFIG, seed: 7 } as never;
  seat(4);
  Object.assign(pz, {
    teamNotice: '',
    teamsTouched: false,
    mapTouched: false,
    sabotageTouched: false,
    mapNotice: '',
    series: { x: 1 } as never,
  });
  pz.played.clear();
});

describe('syncLobby: coop', () => {
  it('until the host picks, the map follows the number of players and the phones are told', () => {
    seat(2);
    app.config = { ...app.config, map: '4' as never };
    expect(syncLobby(2)).toBe(false);
    const m = cfg().map;
    expect(sent).toEqual([expect.objectContaining({ t: 'config', map: m })]);
    sent.length = 0;
    syncLobby(2);
    expect(sent).toEqual([]); // already the proposal: nothing on the wire
  });
  it('a versus map left over in coop is replaced', () => {
    seat(2);
    pz.mapTouched = true;
    app.config = { ...app.config, map: VERSUS_AUTO as never };
    syncLobby(2);
    expect(cfg().map).not.toBe(VERSUS_AUTO);
  });
  it('a hand-picked map that became blocked is swapped for a recommended one, and the notice says which and why', () => {
    seat(8);
    pz.mapTouched = true;
    app.config = { ...app.config, map: '1' as never };
    syncLobby(8);
    expect(cfg().map).not.toBe('1');
    expect(pz.mapNotice).toMatch(/no sirve con 8 jugadores: se cambió a /);
    expect(sent).toHaveLength(1);
  });
  it('singular: "1 jugador"', () => {
    seat(1);
    pz.mapTouched = true;
    app.config = { ...app.config, map: '3' as never }; // 2+ players
    syncLobby(1);
    expect(pz.mapNotice).toMatch(/no sirve con 1 jugador: se cambió/);
  });
  it('a hand-picked map that still fits is kept, and the old notice is cleared only for auto/random', () => {
    seat(3);
    pz.mapTouched = true;
    pz.mapNotice = 'stale';
    app.config = { ...app.config, map: '1' as never };
    syncLobby(3);
    expect(cfg().map).toBe('1');
    expect(pz.mapNotice).toBe('stale');
    app.config = { ...app.config, map: 'auto' as never };
    syncLobby(3);
    expect(pz.mapNotice).toBe('');
    expect(sent).toEqual([]);
  });
});

describe('syncLobby: versus', () => {
  it('versus that stopped being possible falls back to coop, says so and tells the phones', () => {
    versusLobby(4);
    seat(2);
    expect(syncLobby(2)).toBe(false);
    expect(cfg()).toMatchObject({ modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {} });
    expect(pz.teamNotice).toMatch(/: se volvió a Cooperativo$/);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => m.t === 'config')).toBe(true);
  });
  it('the teams follow who is connected', () => {
    versusLobby(4);
    seat(6);
    expect(syncLobby(6)).toBe(true);
    expect(
      cfg()
        .teams!.flatMap((t) => t.playerIds)
        .sort(),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sent.some((m) => m.t === 'config')).toBe(true);
  });
  it('untouched map: the proposal for the team sizes; no message when already the proposal', () => {
    versusLobby(4);
    syncLobby(4);
    sent.length = 0;
    app.config = { ...app.config, map: VERSUS_AUTO as never };
    syncLobby(4);
    const d = defaultVersusChoice(
      cfg().teams!.map((t) => t.playerIds.length),
      pz.played,
    );
    expect(cfg().map).toBe(d);
    sent.length = 0;
    syncLobby(4);
    expect(sent).toEqual([]);
  });
  it('a coop map in versus is replaced by a versus choice', () => {
    versusLobby(4);
    pz.mapTouched = true;
    app.config = { ...app.config, map: '1' as never };
    syncLobby(4);
    expect(versusMap(cfg().map as never) !== undefined || cfg().map === VERSUS_AUTO).toBe(true);
  });
  it('a hand-picked versus map that no longer suits the split is swapped, with the notice', () => {
    versusLobby(4);
    const small = VERSUS_MAPS.find((m) => versusMapStatus(m, [2, 2]).state !== 'blocked' && versusMapStatus(m, [4, 4]).state === 'blocked');
    expect(small, 'a versus map for 2 contra 2 that cannot hold 4 contra 4').toBeDefined();
    const picked = small!.id as never;
    pz.mapTouched = true;
    seat(8);
    app.config = {
      ...app.config,
      map: picked,
      teams: [
        { id: 0, name: 'A', color: '#000', icon: '▲', playerIds: [1, 2, 3, 4] },
        { id: 1, name: 'B', color: '#111', icon: '●', playerIds: [5, 6, 7, 8] },
      ],
    };
    pz.teamsTouched = true; // keep the 4 contra 4 split
    syncLobby(8);
    expect(cfg().map).not.toBe(picked);
    expect(pz.mapNotice).toMatch(/no sirve para 4 contra 4: se cambió a /);
    expect(sent.at(-1)).toMatchObject({ t: 'config', map: cfg().map });
  });
  it('a hand-picked unknown versus choice (auto) clears a stale notice', () => {
    versusLobby(4);
    pz.mapTouched = true;
    pz.mapNotice = 'stale';
    app.config = { ...app.config, map: VERSUS_AUTO as never };
    syncLobby(4);
    expect(pz.mapNotice).toBe('');
  });
});

describe('versusGenerated', () => {
  it('the same seed, difficulty and size reuses the generated map; any change of them makes a new one', () => {
    const a = versusGenerated(11, 'normal', [2, 2]);
    expect(versusGenerated(11, 'normal', [2, 2])).toBe(a);
    expect(versusGenerated(11, 'normal', [1, 2, 1])).toBe(a); // key is the biggest team: same key
    expect(versusGenerated(12, 'normal', [2, 2])).not.toBe(a);
    const b = versusGenerated(12, 'normal', [2, 2]);
    expect(versusGenerated(12, 'hard', [2, 2])).not.toBe(b);
    expect(a.rows.length).toBeGreaterThan(0);
  });
});
