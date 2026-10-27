// The hooks run in the fixed order of design section 7, modules in registry order, and a round with no flag never enters the loop. Spy modules record every call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MECH_MODULES } from '../../sim/mech/registry';
import { MECH_IDS } from '../../sim/mech/ids';
import { addPlayer, createGame, tick, type Controls } from '../../sim/overcooked';

const RANK: Record<string, number> = {
  beforeMove: 0,
  claimsB: 1,
  friction: 2,
  canEnter: 2,
  onInteract: 3,
  tickStations: 4,
  tickTiles: 5,
  mutation: 6,
  hashExtra: 7,
};
const TICK_HOOKS = Object.keys(RANK);
const run: Controls = { x: 1, y: 0, a: 0, b: false };

function spied(ids: readonly string[]) {
  const log: string[] = [];
  for (const m of MECH_MODULES.filter((x) => ids.includes(x.id)))
    for (const h of ['onLoad', 'init', ...TICK_HOOKS] as const) {
      const rec = m as unknown as Record<string, (...a: unknown[]) => unknown>;
      const real = rec[h]!;
      vi.spyOn(rec, h).mockImplementation((...a: unknown[]) => {
        log.push(`${m.id}.${h}`);
        return real(...a);
      });
    }
  return log;
}
afterEach(() => vi.restoreAllMocks());

describe('mechanic hooks', () => {
  it('onLoad then init, module by module in registry order, at createGame', () => {
    const log = spied(['kneader', 'woodOven']);
    createGame({ mech: { woodOven: true, kneader: true } }); // the order of the options does not matter: the registry's does
    expect(log).toEqual(['kneader.onLoad', 'woodOven.onLoad', 'kneader.init', 'woodOven.init']);
  });
  it('per tick: beforeMove, claimsB, friction / canEnter, onInteract, tickStations, tickTiles, mutation, hashExtra', () => {
    const g = createGame({ mech: { kneader: true, woodOven: true } });
    addPlayer(g, 1, 0);
    const log = spied(['kneader', 'woodOven']);
    const per: string[][] = [];
    for (let t = 0; t < 40; t++) {
      log.length = 0;
      tick(g, new Map([[1, run]]));
      per.push([...log]);
    }
    expect(per.some((l) => l.some((e) => e.endsWith('.canEnter')))).toBe(true); // the chef crossed a tile: canEnter was asked
    for (const calls of per) {
      const hooks = calls.map((c) => c.split('.')[1]!);
      expect(
        hooks.map((h) => RANK[h]),
        calls.join(' '),
      ).toEqual([...hooks.map((h) => RANK[h]!)].sort((a, b) => a - b));
      for (const h of ['beforeMove', 'onInteract', 'tickStations', 'tickTiles', 'mutation', 'hashExtra'])
        expect(
          calls.filter((c) => c.endsWith(`.${h}`)),
          h,
        ).toEqual([`kneader.${h}`, `woodOven.${h}`]); // once each, registry order
      expect(hooks.at(0)).toBe('beforeMove');
      expect(hooks.at(-1)).toBe('hashExtra');
    }
  });
  it('a round with every flag off never calls a hook', () => {
    const log = spied(MECH_IDS);
    const g = createGame({ mech: Object.fromEntries(MECH_IDS.map((id) => [id, false])) });
    addPlayer(g, 1, 0);
    for (let t = 0; t < 20; t++) tick(g, new Map([[1, run]]));
    expect(log).toEqual([]);
    expect(g.mech).toBeUndefined();
  });
  it('only the modules whose flag is on are called', () => {
    const log = spied(MECH_IDS);
    const g = createGame({ mech: { gate: true } });
    addPlayer(g, 1, 0);
    tick(g, new Map([[1, run]]));
    expect(new Set(log.map((c) => c.split('.')[0]))).toEqual(new Set(['gate']));
  });
});
