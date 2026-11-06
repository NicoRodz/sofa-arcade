// Starting a Pizzas round from the lobby config: which map and kitchen the round gets, who is seated where, what the phones are told (puestos, frozen teams) and what the lobby keeps.
// Only the scene (Phaser), the scene switch and the socket are fakes; the shell state, the sim and the map picking are the real ones.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@pichi/core';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { app, bindServices } from '@pichi/screen-kit/shell';
import { fixedMap } from '../../sim/maps';
import { pz, puestoOf } from '../state';
import { setMode } from '../lobby/sync';
import { startMatch } from './round';

vi.hoisted(() => vi.stubGlobal('location', { search: '', host: 'x' }));
afterAll(() => vi.unstubAllGlobals());

const sent: { t: string; [k: string]: unknown }[] = [];
const started: unknown[][] = [];
const scenes: string[] = [];
vi.mock('phaser', () => ({ default: {} }));
vi.mock('@pichi/screen-kit/net', () => ({ sendMsg: (m: { t: string }) => sent.push(m) }));
vi.mock('@pichi/screen-kit/shell', async (orig) => ({ ...(await orig<typeof import('@pichi/screen-kit/shell')>()), showScene: (id: string) => scenes.push(id) }));
vi.mock('./loop', () => ({ scene: () => ({ startRound: (...a: unknown[]) => started.push(a) }) }));

const seat = (n: number, over: (i: number) => Partial<PublicPlayer> = () => ({})) => {
  app.players.clear();
  for (let i = 0; i < n; i++)
    app.players.set(i + 1, {
      info: { id: i + 1, slot: i, name: `P${i + 1}`, connected: true, ...over(i) },
      pendA: 3,
      pendB: 2,
    } as never);
};
const coop = (map: string, n = 3, difficulty: 'easy' | 'normal' | 'hard' = 'normal') => {
  seat(n);
  app.config = { ...DEFAULT_CONFIG, seed: 42, map: map as never, difficulty, modeId: 'coop', teams: null, modeOptions: {} } as never;
};

beforeEach(() => {
  sent.length = 0;
  started.length = 0;
  scenes.length = 0;
  bindServices({ ui: () => {}, render: () => {} });
  app.phase = 'lobby';
  pz.played.clear();
  Object.assign(pz, { roundNo: 0, autoLast: undefined, overAt: 5, puestoMsg: undefined, puestoStamp: 0, lockBeforeStart: false, lead: { dummy: 1 } as never });
  puestoOf.clear();
});

describe('a coop round', () => {
  it('shows the Pizzas scene first, builds the picked map for the connected chefs and starts the scene on it', () => {
    coop('1', 3);
    expect(startMatch()).toBeUndefined(); // the phones get no versus data
    expect(scenes).toEqual(['pizzas']);
    const m = fixedMap('1' as never)!;
    expect(started).toHaveLength(1);
    expect(started[0]![0]).toBe(pz.game);
    expect(started[0]!.slice(1)).toEqual([m.id, 42]);
    expect([...pz.game.players.keys()]).toEqual([1, 2, 3]);
    expect(pz.played.has(m.id)).toBe(true);
    expect(pz.overAt).toBeNull();
    expect(pz.roundView).toEqual({ teams: null, hiddenScore: false });
  });
  it('remembers the family of a fixed map so Aleatorio does not repeat it; a generated map leaves it alone', () => {
    coop('1', 3);
    startMatch();
    const fam = pz.autoLast;
    expect(fam).toBeDefined();
    coop('random', 3);
    startMatch();
    expect(pz.autoLast).toBe(fam);
  });
  it('Aleatorio draws a map for this many players and adds it to the played bag', () => {
    coop('auto', 4);
    startMatch();
    expect(pz.played.size).toBe(1);
    expect([...pz.played][0]).toBe(String((started[0] as unknown[])[1]));
  });
  it('clears the presses nobody consumed, so the last round does not leak into the first tick', () => {
    coop('1', 3);
    startMatch();
    for (const p of app.players.values()) expect([p.pendA, p.pendB]).toEqual([0, 0]);
  });
  it('2 or more connected chefs get puestos, each stamped; the lobby remembers the deal for the phones', () => {
    coop('1', 3);
    startMatch();
    expect([...puestoOf.keys()].sort()).toEqual([1, 2, 3]);
    const stamps = [...puestoOf.values()].map((v) => v.stamp);
    expect(new Set(stamps).size).toBe(3);
    expect(pz.puestoMsg?.assign.map((a) => a.id).sort()).toEqual([1, 2, 3]);
  });
  it('a lone chef gets no puestos and the old deal is dropped', () => {
    coop('1', 1);
    puestoOf.set(9, { ids: [], stamp: 1 } as never);
    pz.puestoMsg = { assign: [] } as never;
    startMatch();
    expect(puestoOf.size).toBe(0);
    expect(pz.puestoMsg).toBeUndefined();
  });
  it('a disconnected chef is seated after the connected ones and gets no puesto', () => {
    seat(3, (i) => ({ connected: i !== 0 })); // player 1 (slot 0) is gone
    app.config = { ...DEFAULT_CONFIG, seed: 42, map: '1' as never, modeId: 'coop', teams: null, modeOptions: {} } as never;
    startMatch();
    expect([...pz.game.players.keys()]).toEqual([2, 3, 1]);
    expect([...puestoOf.keys()].sort()).toEqual([2, 3]);
  });
  it('the round number moves the events seed, so a rematch of the same lobby is not the same round', () => {
    coop('1', 3);
    startMatch();
    expect(pz.roundNo).toBe(1);
    startMatch();
    expect(pz.roundNo).toBe(2);
  });
  it('the config is not touched and nothing is sent: a coop round does not freeze the lobby', () => {
    coop('1', 3);
    const before = app.config;
    startMatch();
    expect(app.config).toBe(before);
    expect(sent).toEqual([]);
  });
});

describe('a versus round', () => {
  const versus = () => {
    seat(4);
    app.config = { ...DEFAULT_CONFIG, seed: 42 } as never;
    setMode('versus');
    sent.length = 0;
  };
  it('freezes the teams, tells the phones, deals puestos inside each kitchen and returns the match with the teams', () => {
    versus();
    pz.lockBeforeStart = true;
    const match = startMatch()!;
    expect(match).toMatchObject({ gameId: 'pizzas', modeId: 'versus' });
    expect(match.teams).toHaveLength(2);
    expect(app.config.teamsLocked).toBe(true);
    expect(pz.lockBeforeStart).toBe(false); // what the host had set: unlocked
    expect(sent).toEqual([expect.objectContaining({ t: 'config', teamsLocked: true })]);
    expect([...puestoOf.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(pz.roundView.teams).toHaveLength(2);
    expect(started).toHaveLength(1);
    expect(started[0]![3]).toBe(pz.roundView);
    expect(pz.overAt).toBeNull();
  });
  it('hidden score is a lobby option and rides in the round view', () => {
    versus();
    app.config = { ...app.config, modeOptions: { ...app.config.modeOptions, hiddenScore: true } };
    startMatch();
    expect(pz.roundView.hiddenScore).toBe(true);
  });
  it('plays the map once and clears the stale presses', () => {
    versus();
    startMatch();
    expect(pz.played.size).toBe(1);
    for (const p of app.players.values()) expect([p.pendA, p.pendB]).toEqual([0, 0]);
  });
  it('versus mode with no teams yet falls back to the coop round', () => {
    versus();
    app.config = { ...app.config, teams: null };
    expect(startMatch()).toBeUndefined();
    expect(pz.roundView.teams).toBeNull();
  });
});
