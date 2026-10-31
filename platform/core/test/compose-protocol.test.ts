import { describe, expect, it } from 'vitest';
import { createClientParser } from '@pichi/core';
import { composeProtocol, createCatalog, defaultConfig, type GameManifest, type GameProtocol } from '@pichi/core/contract';

const fakeA: GameProtocol = {
  game: 'a',
  defaultMap: 'ma',
  isMap: (v) => v === 'ma' || v === 'mb',
  isPuesto: (v) => v === 'pa',
  signalKinds: ['sa'],
  puestoCount: 1,
};
const fakeB: GameProtocol = { game: 'b', isMap: (v) => v === 'mz', isPuesto: (v) => v === 'pb', signalKinds: ['sb', 'sc'], puestoCount: 3 };
const manifest = (id: string): GameManifest => ({
  id,
  name: id,
  blurb: id,
  minPlayers: 1,
  maxPlayers: 4,
  controls: { stick: { label: 'm', icon: 'move' }, btn1: { label: 'a', icon: 'grab' }, btn2: { label: 'b', icon: 'chop' } },
  howTo: { steps: [] },
});

describe('composeProtocol', () => {
  it('is the union of the games and refuses what no game declares', () => {
    const ext = composeProtocol([fakeA, fakeB]);
    expect(['ma', 'mb', 'mz'].every(ext.isMap)).toBe(true);
    expect(['pa', 'pb'].every(ext.isPuesto)).toBe(true);
    expect(['sa', 'sb', 'sc'].every(ext.isSignalKind)).toBe(true);
    expect([ext.isMap('mx'), ext.isPuesto('px'), ext.isSignalKind('sx'), ext.isMap('')]).toEqual([false, false, false, false]);
    expect(ext.puestoCount).toBe(3);
    expect([ext.defaultMap('a'), ext.defaultMap('b'), ext.defaultMap('zz')]).toEqual(['ma', undefined, undefined]);
  });
  it('throws on a duplicated game and an empty list accepts nothing', () => {
    expect(() => composeProtocol([fakeA, { ...fakeB, game: 'a' }])).toThrow(/duplicated game protocol: a/);
    const none = composeProtocol([]);
    expect([none.isMap('ma'), none.isPuesto('pa'), none.isSignalKind('sa'), none.puestoCount]).toEqual([false, false, false, 0]);
  });
  it('drives the client parser: map, puesto and signal kinds of fake games, with no real game anywhere', () => {
    const ext = composeProtocol([fakeA, fakeB]);
    const catalog = createCatalog([manifest('a'), manifest('b')]);
    const parse = createClientParser(ext, catalog);
    const cfg = { t: 'config', ...defaultConfig(catalog, ext) };
    expect(parse(JSON.stringify(cfg))).toMatchObject({ t: 'config', game: 'a', map: 'ma' });
    expect(parse(JSON.stringify({ ...cfg, map: 'auto' }))).toBeNull(); // a real game's map is unknown here
    expect(parse(JSON.stringify({ ...cfg, game: 'pizzas' }))).toBeNull();
    expect(parse(JSON.stringify({ t: 'puesto', puestos: ['pb'] }))).toEqual({ t: 'puesto', puestos: ['pb'] });
    expect(parse(JSON.stringify({ t: 'puesto', puestos: ['masa'] }))).toBeNull();
    const input = { t: 'input', seq: 1, x: 0, y: 0, btn: 0, presses: [0, 0], ts: 1 };
    expect(parse(JSON.stringify({ ...input, sig: { kind: 'sc', seq: 2 } }))).toMatchObject({ sig: { kind: 'sc', seq: 2 } });
    expect(parse(JSON.stringify({ ...input, sig: { kind: 'arrowL', seq: 2 } }))).not.toHaveProperty('sig');
  });
});
