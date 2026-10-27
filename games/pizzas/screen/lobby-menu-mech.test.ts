// The Captain's rows for the generated map's mechanics: when they exist, what they say and how a touch on them is judged.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseMenuSnapshot, type LobbyConfig, type MenuActBody } from '@pichi/core';
import { GAMES } from '@pichi/core/games';
import { GEN_MECHS } from '../sim/gen/place';
import { MECHS_OPTION, MECH_PICK_OPTION, mechsOf, pickedMechs, withMech } from '../sim/gen/lobby-opts';
import { resolveMap } from '../sim/generate';
import { buildLobbyMenu, decideMenuAct, type PizzasLobbyState } from './lobby-menu';

const def = GAMES.find((g) => g.id === 'pizzas')!;
const st = (config: Partial<LobbyConfig> = {}): PizzasLobbyState => ({
  config: { ...DEFAULT_CONFIG, map: 'random', seed: 77, ...config } as LobbyConfig,
  def,
  connected: 3,
  n: 3,
  startProblem: '',
  mapNotice: '',
  teamNotice: '',
});
const ids = (s: PizzasLobbyState) => buildLobbyMenu(s).rows.map((r) => r.id);
const act = (a: Partial<MenuActBody> & Pick<MenuActBody, 'act'>): MenuActBody => ({ rev: 1, ...a });

describe('mechanics rows of the generated map', () => {
  it('appear only with the generated coop map: seed, the switch and one tick per mechanic', () => {
    expect(ids(st())).toEqual(['difficulty', 'mode', 'events', 'mutate', 'map', 'seed', 'mechs', ...GEN_MECHS.map((m) => `gm-${m}`)]);
    expect(ids(st({ map: '1' }))).not.toContain('mechs');
    expect(ids(st({ modeId: 'versus', map: 'vs-random' }))).not.toContain('seed');
  });
  it('the seed is visible and "Otra" is a press that reseeds', () => {
    const row = buildLobbyMenu(st()).rows.find((r) => r.id === 'seed')!;
    expect(row.label).toBe('Semilla 77');
    expect(decideMenuAct(st(), act({ act: 'press', row: 'seed', value: 'again' }), 1)).toMatchObject({ ok: true, effect: { kind: 'reseed' } });
  });
  it('mechanics default to Sí; No hides the ticks and says so', () => {
    expect(buildLobbyMenu(st()).rows.find((r) => r.id === 'mechs')!.value).toBe(true);
    const off = st({ modeOptions: { [MECHS_OPTION]: false } });
    expect(ids(off)).toEqual(['difficulty', 'mode', 'events', 'mutate', 'map', 'seed', 'mechs']);
    expect(buildLobbyMenu(off).rows.find((r) => r.id === 'mechs')).toMatchObject({ value: false, hint: 'Mapa clásico, sin mecánicas' });
  });
  it('touches become effects; the ticks live in one bitmask', () => {
    expect(decideMenuAct(st(), act({ act: 'set', row: 'mechs', value: false }), 1)).toMatchObject({ ok: true, effect: { kind: 'mechs', value: false } });
    expect(decideMenuAct(st(), act({ act: 'set', row: 'gm-oil', value: true }), 1)).toMatchObject({
      ok: true,
      effect: { kind: 'mech', id: 'oil', value: true },
    });
    let o: Record<string, number> = {};
    o = { [MECH_PICK_OPTION]: withMech(o, 'oil', true) };
    o = { [MECH_PICK_OPTION]: withMech(o, 'bridge', true) };
    expect(pickedMechs(o)).toEqual(GEN_MECHS.filter((m) => m === 'oil' || m === 'bridge'));
    expect(pickedMechs({ [MECH_PICK_OPTION]: withMech(o, 'oil', false) })).toEqual(['bridge']);
    expect(Object.keys(o)).toHaveLength(1); // modeOptions holds at most 8 entries
  });
  it('the snapshot stays inside the relay limits and the labels are short', () => {
    const s = st({ modeOptions: { [MECH_PICK_OPTION]: 3 } });
    const body = buildLobbyMenu(s);
    expect(parseMenuSnapshot({ ...body, rev: 1 })).not.toBeNull();
    for (const r of body.rows.filter((x) => x.id.startsWith('gm-'))) expect(r.label.length).toBeLessThanOrEqual(16);
    expect(body.rows.filter((r) => r.value === true && r.id.startsWith('gm-'))).toHaveLength(2);
  });
  it('mechsOf: Sí unless turned off', () => {
    expect(mechsOf(undefined)).toBe(true);
    expect(mechsOf({ [MECHS_OPTION]: false })).toBe(false);
  });
});

describe('resolveMap random with mechanics', () => {
  const rand = Math.random;
  it('Sí: the ticked mechanics come out on the map', () => {
    const m = resolveMap('random', 5, 'normal', 3, rand, { mechs: true, mechanics: ['oil'], mutate: false });
    expect(m.mechanics).toContain('oil');
    expect(m.id).toBe('random');
  });
  it('Sí with none ticked: the generator chooses by difficulty', () => {
    const m = resolveMap('random', 5, 'hard', 3, rand, { mechs: true });
    expect(m.mechanics!.length).toBeGreaterThan(0);
  });
  it('No (or no options): the classic generated map with no mechanics', () => {
    for (const g of [undefined, { mechs: false }]) {
      const m = resolveMap('random', 5, 'normal', 3, rand, g);
      expect(m.mechanics).toBeUndefined();
      expect(m.mutation).toBeUndefined();
    }
  });
});
