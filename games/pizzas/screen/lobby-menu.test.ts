// The Pizzas lobby form: what each state of the lobby shows, and how a touch is judged against it.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type LobbyConfig, type MenuActBody } from '@pichi/core';
import { GAMES } from '@pichi/core/games';
import { SERIES_MAPS } from '../sim/maps';
import { FOCUS_ROW, buildLobbyMenu, decideMenuAct, type PizzasLobbyState } from './lobby-menu';

const def = GAMES.find((g) => g.id === 'pizzas')!;
const TEAMS = [
  { id: 0, name: 'Picantes', color: '#A8330A', icon: '▲', playerIds: [1, 2] },
  { id: 1, name: 'Frescos', color: '#14338A', icon: '●', playerIds: [3, 4] },
];
const coop = (over: Partial<PizzasLobbyState> = {}): PizzasLobbyState => ({
  config: { ...DEFAULT_CONFIG, map: '1' } as LobbyConfig,
  def,
  connected: 3,
  n: 3,
  startProblem: '',
  mapNotice: '',
  teamNotice: '',
  ...over,
});
const versus = (over: Partial<PizzasLobbyState> = {}): PizzasLobbyState => ({
  ...coop(),
  config: {
    ...DEFAULT_CONFIG,
    modeId: 'versus',
    teams: TEAMS,
    map: 'vs-auto',
    modeOptions: { sabotage: 'soft', hiddenScore: false, handicap: true },
  } as LobbyConfig,
  connected: 4,
  n: 4,
  ...over,
});
const rowOf = (st: PizzasLobbyState, id: string) => buildLobbyMenu(st).rows.find((r) => r.id === id);
const act = (a: Partial<MenuActBody> & Pick<MenuActBody, 'act'>): MenuActBody => ({ rev: 1, ...a });

describe('buildLobbyMenu', () => {
  it('sabotage and the team rows exist only in versus; the mutating kitchen only in coop', () => {
    const c = buildLobbyMenu(coop()).rows.map((r) => r.id);
    const v = buildLobbyMenu(versus()).rows.map((r) => r.id);
    expect(c).toEqual(['difficulty', 'mode', 'events', 'mutate', 'map']);
    expect(v).toEqual(['difficulty', 'mode', 'sabotage', 'events', 'map', 'teams', 'opt-hiddenScore', 'opt-handicap']);
    expect(rowOf(versus(), 'sabotage')?.value).toBe('soft');
  });
  it('blocked maps keep their reason and are not enabled; warned ones stay enabled with their reason', () => {
    const grid = rowOf(coop({ n: 2, connected: 2 }), 'map')!;
    const items = grid.groups!.flatMap((g) => g.items);
    const blocked = items.filter((i) => !i.enabled);
    expect(blocked.length).toBeGreaterThan(0);
    for (const b of blocked) expect(b.reason, b.id).toMatch(/jugadores/);
    expect(grid.groups!.map((g) => g.id)).toEqual(['classic', 'series']);
    expect(grid.groups![1]!.items.map((i) => i.id).sort()).toEqual(SERIES_MAPS.map((m) => m.id).sort());
    expect(grid.value).toBe('1');
  });
  it('the versus grid has one group and the generated / random picks as extras', () => {
    const grid = rowOf(versus(), 'map')!;
    expect(grid.groups).toHaveLength(1);
    expect(grid.options!.map((o) => o.id)).toEqual(['vs-auto', 'vs-random']);
  });
  it('versus is offered only when the group allows it, with the reason', () => {
    const mode = rowOf(coop({ connected: 1, n: 1 }), 'mode')!;
    const vs = mode.options!.find((o) => o.id === 'versus')!;
    expect(vs.enabled).toBe(false);
    expect(vs.reason).toBeTruthy();
    expect(mode.options!.find((o) => o.id === 'coop')!.enabled).toBe(true);
  });
  it('the start button is off with the lobby reason, and the summary says what will happen', () => {
    const off = buildLobbyMenu(coop({ startProblem: 'Esperando jugadores' })).primary;
    expect(off).toMatchObject({ id: 'start', enabled: false, reason: 'Esperando jugadores' });
    const on = buildLobbyMenu(versus()).primary;
    expect(on.enabled).toBe(true);
    expect(on.summary.join(' | ')).toMatch(/Versus.*Sabotaje Suave.*\| 4 jugadores \(2 vs 2\)/);
  });
  it('every row id has a focus row on the page', () => {
    for (const r of [...buildLobbyMenu(versus()).rows, { id: 'start' }].filter((r) => !r.id.startsWith('opt-')))
      expect(FOCUS_ROW[r.id], r.id).toBeTruthy();
  });
  it('fits the wire limits the parser will enforce', () => {
    const json = JSON.stringify(buildLobbyMenu(versus()));
    expect(json.length).toBeLessThan(8000);
  });
});

describe('decideMenuAct', () => {
  it('a valid set becomes its effect, with the row (the ring follows)', () => {
    expect(decideMenuAct(coop(), act({ act: 'set', row: 'difficulty', value: 'hard' }), 5)).toEqual({
      ok: true,
      effect: { kind: 'difficulty', value: 'hard' },
      row: 'difficulty',
    });
    expect(decideMenuAct(coop(), act({ act: 'set', row: 'events', value: false }), 5)).toEqual({
      ok: true,
      effect: { kind: 'events', value: false },
      row: 'events',
    });
    expect(decideMenuAct(coop(), act({ act: 'set', row: 'map', value: '2' }), 5)).toMatchObject({
      ok: true,
      effect: { kind: 'map', value: '2' },
    });
    expect(decideMenuAct(versus(), act({ act: 'set', row: 'opt-handicap', value: false }), 5)).toMatchObject({
      effect: { kind: 'option', id: 'handicap', value: false },
    });
    expect(decideMenuAct(versus(), act({ act: 'press', row: 'teams', value: 'shuffle' }), 5)).toMatchObject({
      ok: true,
      effect: { kind: 'shuffle' },
    });
  });
  it('a set with an old revision still goes through (it is absolute and idempotent)', () => {
    expect(decideMenuAct(coop(), act({ act: 'set', row: 'difficulty', value: 'easy', rev: 1 }), 99).ok).toBe(true);
  });
  it('a disabled option is refused with its reason', () => {
    const st = coop({ n: 2, connected: 2 });
    const blocked = rowOf(st, 'map')!
      .groups!.flatMap((g) => g.items)
      .find((i) => !i.enabled)!;
    expect(decideMenuAct(st, act({ act: 'set', row: 'map', value: blocked.id }), 1)).toEqual({
      ok: false,
      code: 'disabled',
      msg: blocked.reason,
    });
    expect(decideMenuAct(coop({ connected: 1, n: 1 }), act({ act: 'set', row: 'mode', value: 'versus' }), 1)).toMatchObject({
      ok: false,
      code: 'disabled',
    });
  });
  it('an unknown row, a row that is not on this mode, an unknown value and a wrong kind are refused', () => {
    for (const a of [
      act({ act: 'set', row: 'nope', value: 'x' }),
      act({ act: 'set', row: 'sabotage', value: 'chaos' }), // coop has no sabotage
      act({ act: 'set', row: 'difficulty', value: 'impossible' }),
      act({ act: 'set', row: 'difficulty', value: true }),
      act({ act: 'set', row: 'events', value: 'si' }),
      act({ act: 'press', row: 'difficulty', value: 'easy' }),
      act({ act: 'press', row: 'teams', value: 'shuffle' }), // coop has no teams row
      act({ act: 'focus', row: 'nope' }),
    ])
      expect(decideMenuAct(coop(), a, 1), JSON.stringify(a)).toMatchObject({ ok: false, code: 'disabled' });
  });
  it('shuffle is refused while the teams are locked', () => {
    const st = versus();
    st.config = { ...st.config, teamsLocked: true };
    expect(decideMenuAct(st, act({ act: 'press', row: 'teams', value: 'shuffle' }), 1)).toMatchObject({
      ok: false,
      code: 'disabled',
      msg: 'Los equipos están bloqueados',
    });
  });
  it('start needs the current revision: an old one is stale, and a lobby that cannot start says why', () => {
    expect(decideMenuAct(coop(), act({ act: 'start', rev: 4 }), 5)).toMatchObject({ ok: false, code: 'stale' });
    expect(decideMenuAct(coop(), act({ act: 'start', rev: 5 }), 5)).toEqual({ ok: true, effect: { kind: 'start' }, row: 'start' });
    expect(decideMenuAct(coop({ startProblem: 'Esperando jugadores' }), act({ act: 'start', rev: 5 }), 5)).toEqual({
      ok: false,
      code: 'disabled',
      msg: 'Esperando jugadores',
    });
  });
  it('focus moves the ring; on the map with a group id it also opens that page on the TV', () => {
    expect(decideMenuAct(coop(), act({ act: 'focus', row: 'map' }), 1)).toEqual({ ok: true, effect: { kind: 'focus' }, row: 'map' });
    expect(decideMenuAct(coop(), act({ act: 'focus', row: 'map', value: 'series' }), 1)).toEqual({
      ok: true,
      effect: { kind: 'group', value: 'series' },
      row: 'map',
    });
    expect(decideMenuAct(coop(), act({ act: 'focus', row: 'map', value: 'zzz' }), 1)).toMatchObject({ effect: { kind: 'focus' } });
  });
});
