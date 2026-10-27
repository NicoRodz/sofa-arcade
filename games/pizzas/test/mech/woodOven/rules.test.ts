// The wood oven's rules (design section 2): B held on Q adds 3 fuel per tick (cap 900) and the fuel falls 1 per tick; W bakes at x1.6 while it has fuel and is frozen without it
// (it neither bakes nor burns); the fuel running out with a pizza inside calls another chef. Real hooks, no spies.
import { describe, expect, it } from 'vitest';
import { WOOD_ROWS } from './map';
import { press, put, rig, run } from '../kneader/rig';

const Q = [2, 7] as const; // the chef stands right of the bellows at (1, 7)
const blow = new Map([[1, press(true, 0, -1, 0)]]);
const fuel = (g: ReturnType<typeof rig>) => Object.values(g.mech!.wood!)[0]!;
const oven = (g: ReturnType<typeof rig>) => g.stations.find((s) => s.wood)!;
const withPizza = () => {
  const g = rig(WOOD_ROWS, 'woodOven');
  oven(g).inputs = [0, 1];
  put(g, 1, ...Q, -1, 0);
  return g;
};

describe('woodOven: the bellows', () => {
  it('B held on Q adds 3 per tick minus the 1 that burns: +2 net', () => {
    const g = withPizza();
    run(g, 100, blow);
    expect(fuel(g)).toBe(200);
  });
  it('the fuel caps at 900', () => {
    const g = withPizza();
    run(g, 600, blow);
    expect(fuel(g)).toBe(900 - 1);
  });
  it('without blowing the fuel falls 1 per tick down to 0', () => {
    const g = withPizza();
    run(g, 100, blow);
    run(g, 50, new Map());
    expect(fuel(g)).toBe(150);
    run(g, 300, new Map());
    expect(fuel(g)).toBe(0);
  });
  it('the chef blowing stands still and cannot dash; a chef holding something can blow too', () => {
    const g = withPizza();
    const p = g.players.get(1)!;
    p.item = 'plate';
    const x = p.x;
    run(g, 30, blow);
    expect(p.x).toBe(x);
    expect(p.dashMs).toBe(0);
    expect(fuel(g)).toBe(60);
  });
});

describe('woodOven: the oven', () => {
  const baked = (g: ReturnType<typeof rig>, ticks: number) => {
    run(g, ticks, new Map());
    return oven(g).progress;
  };
  it('frozen without fuel: it neither bakes nor burns', () => {
    const g = withPizza();
    expect(baked(g, 600)).toBe(0);
    Object.assign(oven(g), { done: true, readyAt: -60_000 });
    run(g, 60 * 30, new Map());
    expect(oven(g).burnt).toBeUndefined();
  });
  it('with fuel it bakes at x1.6 of a normal oven', () => {
    const wood = withPizza();
    setFuel(wood, 600);
    const normal = rig(WOOD_ROWS, 'woodOven');
    const o = normal.stations.find((s) => s.kind === 'pot' && !s.wood)!;
    o.inputs = [0, 1];
    run(normal, 60, new Map());
    const plain = o.progress;
    run(wood, 60, new Map());
    expect(oven(wood).progress / plain).toBeCloseTo(1.6, 3);
  });
  it('fuel out with a pizza inside calls a chef, once (the amber phone)', () => {
    const g = withPizza();
    setFuel(g, 3);
    const seen: unknown[] = [];
    (g.bus as unknown as { on(t: string, f: (e: unknown) => void): void }).on('mech:need', (e) => seen.push(e));
    run(g, 10, new Map());
    expect(seen).toEqual([expect.objectContaining({ kind: 'woodOven' })]);
    run(g, 100, new Map());
    expect(seen).toHaveLength(1);
  });
  it('an empty oven running dry calls nobody', () => {
    const g = rig(WOOD_ROWS, 'woodOven');
    setFuel(g, 3);
    const seen: unknown[] = [];
    (g.bus as unknown as { on(t: string, f: (e: unknown) => void): void }).on('mech:need', (e) => seen.push(e));
    run(g, 10, new Map());
    expect(seen).toHaveLength(0);
  });
});
function setFuel(g: ReturnType<typeof rig>, v: number) {
  g.mech!.wood![g.stations.indexOf(oven(g))] = v;
}
