// What the hooks can do through the loop: state.mech exists only with a flag and carries a hash, canEnter walls a move, friction slows the velocity, claimsB pins the chef and
// stops the dash, ovenRate scales or freezes the baking (and the burn clock), onFire sees every fire. The stubs do none of this; spies stand in for the tandas.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MECH_MODULES, mechModule } from '../../sim/mech/registry';
import { mechHash } from '../../sim/mech/loop';
import { addPlayer, createGame, tick, type Controls } from '../../sim/overcooked';
import { douse } from '../../sim/burn';
import { withLetter } from './rows';

const right: Controls = { x: 1, y: 0, a: 0, b: false };
const ids = new Map([[1, right]]);
afterEach(() => vi.restoreAllMocks());

describe('game.mech', () => {
  it('exists only with a flag; flags.mech lists every id', () => {
    expect('mech' in createGame({})).toBe(false);
    expect('mech' in createGame({ mech: {} })).toBe(false);
    const g = createGame({ mech: { heavyTray: true } }); // a flag whose module keeps no state of its own (T2 is still a stub)
    expect(g.flags!.mech.heavyTray).toBe(true);
    expect(Object.values(g.flags!.mech).filter(Boolean)).toHaveLength(1);
    expect(g.mech).toEqual({ hash: 0 });
  });
  it('the hash follows what the modules report, and is refreshed every tick', () => {
    const g = createGame({ mech: { gate: true } });
    addPlayer(g, 1, 0);
    let v = 7;
    vi.spyOn(mechModule('gate'), 'hashExtra').mockImplementation(() => [v, 3]);
    tick(g, new Map());
    const h1 = g.mech!.hash;
    expect(h1).toBe(mechHash(g));
    v = 8;
    tick(g, new Map());
    expect(g.mech!.hash).not.toBe(h1);
  });
});

describe('movement hooks', () => {
  const x0 = (g: ReturnType<typeof createGame>) => g.players.get(1)!.x;
  it('canEnter false turns a change of tile into a wall', () => {
    const free = createGame({ mech: { gate: true } });
    addPlayer(free, 1, 0);
    for (let t = 0; t < 40; t++) tick(free, ids);
    const g = createGame({ mech: { gate: true } });
    addPlayer(g, 1, 0);
    const start = x0(g);
    vi.spyOn(mechModule('gate'), 'canEnter').mockReturnValue(false);
    for (let t = 0; t < 40; t++) tick(g, ids);
    expect(x0(free)).toBeGreaterThan(Math.floor(start) + 1);
    expect(x0(g)).toBeLessThan(Math.floor(start) + 1);
  });
  it('friction stretches the velocity time constant', () => {
    const a = createGame({ mech: { oil: true } });
    const b = createGame({ mech: { oil: true } });
    addPlayer(a, 1, 0);
    addPlayer(b, 1, 0);
    vi.spyOn(mechModule('oil'), 'friction').mockReturnValue(5000);
    for (let t = 0; t < 10; t++) {
      tick(a, ids);
      tick(b, ids);
    }
    vi.restoreAllMocks();
    const c = createGame({ mech: { oil: true } });
    addPlayer(c, 1, 0);
    for (let t = 0; t < 10; t++) tick(c, ids);
    expect(a.players.get(1)!.vx).toBeLessThan(c.players.get(1)!.vx);
  });
  it('claimsB with B held pins the chef; a B tap with it does not dash', () => {
    const g = createGame({ mech: { kneader: true } });
    addPlayer(g, 1, 0);
    vi.spyOn(mechModule('kneader'), 'claimsB').mockReturnValue(true);
    const p = g.players.get(1)!;
    const x = p.x;
    for (let t = 0; t < 30; t++) tick(g, new Map([[1, { x: 1, y: 0, a: 0, b: true }]]));
    expect(p.x).toBe(x);
    expect(p.dashMs).toBe(0);
  });
});

describe('ovens and fire', () => {
  const potGame = (rate?: number) => {
    const rows = withLetter('W');
    const g = createGame({ mech: { woodOven: true }, rows, burn: true, fire: true, difficulty: 'normal' });
    vi.spyOn(mechModule('woodOven'), 'ovenRate').mockReturnValue(rate ?? 1000); // the real W is frozen without fuel (T1e): these tests pin the sim's hook, so the rate is set here
    const s = g.stations.find((x) => x.wood)!;
    s.inputs = [0, 1];
    return { g, s };
  };
  it('W is an oven of the sim (kind pot, wood) and cooks at the normal pace by default', () => {
    const { g, s } = potGame();
    expect(s.kind).toBe('pot');
    for (let t = 0; t < 60; t++) tick(g, new Map());
    const base = s.progress;
    expect(base).toBeGreaterThan(0);
    const plain = createGame({ rows: withLetter('W'), mech: { woodOven: true } });
    const p = plain.stations.find((x) => x.wood)!;
    p.inputs = [0, 1];
    for (let t = 0; t < 60; t++) tick(plain, new Map());
    expect(p.progress).toBe(base);
  });
  it('ovenRate scales the baking (x1.6) and 0 freezes it', () => {
    const after60 = (rate?: number) => {
      vi.restoreAllMocks(); // the modules are shared objects: one spy at a time
      const { g, s } = potGame(rate);
      for (let t = 0; t < 60; t++) tick(g, new Map());
      return s.progress;
    };
    const base = after60();
    expect(after60(1600) / base).toBeCloseTo(1.6, 3);
    expect(after60(0)).toBe(0);
  });
  it('a frozen oven does not burn its ready pizza either', () => {
    const { g, s } = potGame(0);
    Object.assign(s, { done: true, readyAt: 0 });
    for (let t = 0; t < 60 * 30; t++) tick(g, new Map());
    expect(s.burnt).toBeUndefined();
  });
  it('onFire hears the start, the spread and the end of a fire', () => {
    const { g, s } = potGame();
    const seen: string[] = [];
    vi.spyOn(mechModule('woodOven'), 'onFire').mockImplementation((_g, st, phase) => void seen.push(`${phase}@${st.tx},${st.ty}`));
    Object.assign(s, { done: true, burnt: true, readyAt: -60_000 });
    for (let t = 0; t < 5; t++) tick(g, new Map());
    expect(seen[0]).toBe(`start@${s.tx},${s.ty}`);
    douse(g, 1, s, 1e9);
    expect(seen.at(-1)).toBe(`out@${s.tx},${s.ty}`);
  });
  it('every module is a no-op stub in T0', () => {
    expect(MECH_MODULES.every((m) => m.ovenRate({} as never, {} as never) === 1000)).toBe(true);
  });
});
