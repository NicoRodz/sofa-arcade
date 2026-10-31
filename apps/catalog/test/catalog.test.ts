import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@pichi/core';
import { CATALOG, DEFAULT_CONFIG, GAMES, PROTOCOL, parseClientMessage } from '@pichi/catalog';

// Copied by hand from master (platform/core/src/protocol.ts DEFAULT_CONFIG before D1): the cable's starting lobby must not drift.
const MASTER_DEFAULT_CONFIG = {
  game: 'pizzas',
  difficulty: 'normal',
  map: 'auto',
  seed: 1,
  modeId: 'coop',
  teams: null,
  teamsLocked: false,
  modeOptions: {},
};
const cfg = (over: object) => JSON.stringify({ t: 'config', ...DEFAULT_CONFIG, ...over });
const input = { t: 'input', seq: 1, x: 0, y: 0, btn: 0, presses: [0, 0], ts: 1 };

describe('apps/catalog', () => {
  it('keeps the protocol at v6 and the default lobby of master', () => {
    expect(PROTOCOL_VERSION).toBe(6);
    expect(DEFAULT_CONFIG).toStrictEqual(MASTER_DEFAULT_CONFIG);
    expect(CATALOG.ids).toEqual(['pizzas', 'obstaculos']);
    expect(CATALOG.problems()).toEqual([]);
    expect(GAMES.map((g) => g.id)).toEqual(CATALOG.ids);
  });
  it('accepts and rejects the map of each game', () => {
    for (const map of ['auto', 'V1', 'vs-auto', 'vs-random']) expect(parseClientMessage(cfg({ map }))).toMatchObject({ t: 'config', map });
    for (const map of ['nope', '', 7, null, ['auto']]) expect(parseClientMessage(cfg({ map }))).toBeNull();
    expect(PROTOCOL.isMap('auto') && PROTOCOL.isMap('vs-auto') && !PROTOCOL.isMap('zz')).toBe(true);
  });
  it('accepts and rejects the puestos of Pizzas', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'puesto', puestos: ['masa', 'horno'] }))).toEqual({
      t: 'puesto',
      puestos: ['masa', 'horno'],
    });
    for (const puestos of [['zz'], [], 'masa', ['masa', 'masa', 'masa', 'masa', 'masa']])
      expect(parseClientMessage(JSON.stringify({ t: 'puesto', puestos }))).toBeNull();
    const pool = Array(10).fill('masa');
    const phase = (p: unknown) =>
      JSON.stringify({
        t: 'phase',
        phase: 'playing',
        puestos: { cheese: true, sink: false, assign: [{ id: 1, puestos: ['masa'], pool: p }] },
      });
    expect(parseClientMessage(phase(pool))).not.toBeNull(); // the pool may hold every puesto id (10)...
    expect(parseClientMessage(phase([...pool, 'masa']))).toBeNull(); // ...and no more
  });
  it('accepts and rejects the signal kinds of Obstaculos', () => {
    for (const kind of ['arrowL', 'arrowR', 'arrowU', 'arrowD', 'wait', 'go'])
      expect(parseClientMessage(JSON.stringify({ ...input, sig: { kind, seq: 1 } }))).toMatchObject({ sig: { kind, seq: 1 } });
    for (const kind of ['masa', 'jump', 7])
      expect(parseClientMessage(JSON.stringify({ ...input, sig: { kind, seq: 1 } }))).not.toHaveProperty('sig'); // dropped, never the whole input
  });
  it('knows its games and modes', () => {
    expect(parseClientMessage(cfg({ game: 'obstaculos', modeId: 'versus' }))).toBeNull(); // obstaculos has no versus
    expect(parseClientMessage(cfg({ game: 'pizzas', modeId: 'versus' }))).not.toBeNull();
    expect(parseClientMessage(cfg({ game: 'arena' }))).toBeNull(); // announced only
    expect(CATALOG.comingSoon.map((s) => s.id)).toEqual(['arena']);
  });
});
