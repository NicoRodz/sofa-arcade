// The Pizzas lobby's coherence rules on the real shell state: what a mode change, a team move or a player joining or leaving does to the config the phones see.
// Only the socket is a fake: `sent` holds what syncLobby's own patches put on the wire.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@pichi/core';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { app, bindServices } from '@pichi/screen-kit/shell';
import { versusMap } from '../../sim/versus/maps';
import { VERSUS_AUTO } from '../../sim/versus/lobby';
import { pz } from '../state';
import { moveToTeam, setEvents, setMode, setMutate, setSabotage, shuffleTeams, startProblem } from './sync';

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

describe('setMode', () => {
  it('versus with 4 players builds two teams, the versus defaults and a versus map, and resets what the host had touched', () => {
    pz.teamsTouched = pz.mapTouched = pz.sabotageTouched = true;
    pz.mapNotice = 'old';
    setMode('versus');
    expect(cfg().modeId).toBe('versus');
    expect(cfg().teams).toHaveLength(2);
    expect(
      cfg()
        .teams!.flatMap((t) => t.playerIds)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
    expect(cfg().teamsLocked).toBe(false);
    expect(cfg().map === VERSUS_AUTO || versusMap(cfg().map as never) !== undefined).toBe(true);
    expect(Object.keys(cfg().modeOptions).length).toBeGreaterThan(0);
    expect([pz.teamsTouched, pz.mapTouched, pz.sabotageTouched, pz.mapNotice, pz.series, pz.teamNotice]).toEqual([
      false,
      false,
      false,
      '',
      null,
      '',
    ]);
    expect(renders).toBe(1);
  });
  it('versus with too few players is refused with the reason, and nothing else changes', () => {
    seat(2);
    setMode('versus');
    expect(cfg().modeId).toBe('coop');
    expect(pz.teamNotice).toMatch(/Versus|jugadores/);
    expect(renders).toBe(1);
    expect(pz.series).not.toBeNull();
  });
  it('back to coop clears teams and options and proposes a coop map for the players here', () => {
    versusLobby();
    setMode('coop');
    expect(cfg()).toMatchObject({ modeId: 'coop', teams: null, modeOptions: {} });
    expect(Number.isNaN(Number(cfg().map))).toBe(false);
  });
  it('outside the lobby, or to the mode already set, it does nothing', () => {
    app.phase = 'playing';
    setMode('versus');
    expect(cfg().modeId).toBe('coop');
    app.phase = 'lobby';
    setMode('coop');
    expect(renders).toBe(0);
    expect(pz.series).not.toBeNull();
  });
});

describe('moveToTeam / shuffleTeams', () => {
  it('moves a connected player to the other team and stops auto-balancing', () => {
    versusLobby();
    const from = cfg().teams!.find((t) => t.playerIds.includes(1))!;
    const to = cfg().teams!.find((t) => t !== from)!;
    moveToTeam(1, to.id);
    expect(cfg().teams!.find((t) => t.id === to.id)!.playerIds).toContain(1);
    expect(pz.teamsTouched).toBe(true);
    expect(pz.teamNotice).toBe('');
  });
  it("locked teams refuse the move with the lobby's reason", () => {
    versusLobby();
    app.config = { ...app.config, teamsLocked: true };
    const before = cfg().teams;
    moveToTeam(1, cfg().teams!.find((t) => !t.playerIds.includes(1))!.id);
    expect(cfg().teams).toBe(before);
    expect(pz.teamNotice).not.toBe('');
    expect(renders).toBeGreaterThan(0);
  });
  it('ignores a player that is not connected, coop, and a phase that is not the lobby', () => {
    versusLobby();
    const before = cfg().teams;
    moveToTeam(99, 0);
    app.phase = 'playing';
    moveToTeam(1, 1);
    app.phase = 'lobby';
    expect(cfg().teams).toBe(before);
    setMode('coop');
    moveToTeam(1, 1);
    expect(cfg().teams).toBeNull();
    expect(pz.teamsTouched).toBe(false);
  });
  it('shuffling keeps the same players, re-opens auto-balance and tells the phones', () => {
    versusLobby();
    pz.teamsTouched = true;
    shuffleTeams();
    expect(pz.teamsTouched).toBe(false);
    expect(
      cfg()
        .teams!.flatMap((t) => t.playerIds)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
  });
  it('shuffling locked teams only says so; with no teams (coop) it does nothing', () => {
    shuffleTeams();
    expect(renders).toBe(0);
    versusLobby();
    app.config = { ...app.config, teamsLocked: true };
    const before = cfg().teams;
    shuffleTeams();
    expect(pz.teamNotice).toBe('Los equipos están bloqueados');
    expect(cfg().teams).toBe(before);
  });
});

describe('the option setters', () => {
  it('sabotage: versus only; sets the level, marks it hand-picked, plays the move sound; the same value again is nothing', () => {
    setSabotage('chaos');
    expect(pz.sabotageTouched).toBe(false);
    expect(cfg().modeOptions.sabotage).toBeUndefined();
    versusLobby();
    setSabotage('chaos');
    expect(cfg().modeOptions.sabotage).toBe('chaos');
    expect(pz.sabotageTouched).toBe(true);
    expect(ui).toHaveLength(1);
    setSabotage('chaos');
    expect(ui).toHaveLength(1);
  });
  it('events: both modes, lobby only', () => {
    setEvents(false);
    expect(cfg().modeOptions.events).toBe(false);
    setEvents(true);
    expect(cfg().modeOptions.events).toBe(true);
    expect(ui).toHaveLength(2);
    app.phase = 'results';
    setEvents(false);
    expect(cfg().modeOptions.events).toBe(true);
  });
  it('the mutating kitchen: coop only', () => {
    setMutate(true);
    expect(cfg().modeOptions.mutate).toBe(true);
    versusLobby();
    setMutate(false);
    expect(cfg().modeOptions.mutate).toBeUndefined();
    app.phase = 'playing';
    setMode('coop');
    expect(cfg().modeId).toBe('versus');
  });
});

describe('startProblem', () => {
  it('nobody connected: waiting for players', () => {
    seat(0);
    expect(startProblem()).toBe('Esperando jugadores');
  });
  it('coop with players: ready', () => {
    seat(2);
    expect(startProblem()).toBe('');
  });
  it('versus with a legal split: ready; an unbalanced 5 vs 3 split has no map and says why', () => {
    versusLobby(4);
    expect(startProblem()).toBe('');
    seat(8);
    app.config = {
      ...app.config,
      teams: [
        { id: 0, name: 'A', color: '#000', icon: '▲', playerIds: [1, 2, 3, 4, 5] },
        { id: 1, name: 'B', color: '#111', icon: '●', playerIds: [6, 7, 8] },
      ],
    };
    expect(startProblem()).not.toBe('');
  });
});
