// Rules of 'ovenHeat': 1000 at the start, -300 when an oven is loaded or its dish taken, +4 a tick, speed 400 + temp * 6 / 10 permil, -500 on the Ola de frío; the validator asks for two ovens from 5 chefs.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { mechModule } from '../../../sim/mech/registry';
import { heatPhone } from '../../../sim/mech/ovenHeat/phone';
import { ovenHeatValidate } from '../../../sim/validate/mech/ovenHeat';
import { HEAT_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (extra: { mech?: { ovenHeat?: boolean; woodOven?: boolean }; rows?: readonly string[] } = {}): Game => {
  const g = createGame({ rows: extra.rows ?? HEAT_ROWS, n: 2, mech: extra.mech ?? { ovenHeat: true }, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  addPlayer(g, 2, 1, 1);
  return g;
};
const ovens = (g: Game) => g.stations.flatMap((s, i) => (s.kind === 'pot' ? [i] : []));
const run = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) tick(g, idle);
};
const rate = (g: Game, i: number) => mechModule('ovenHeat').ovenRate(g, g.stations[i]!);

describe('mech.ovenHeat', () => {
  it('both ovens start at 1000 and bake at the normal speed', () => {
    const g = make();
    const [a] = ovens(g) as [number];
    expect(Object.values(g.mech!.heat!)).toEqual([1000, 1000, 1000]);
    expect(rate(g, a)).toBe(1000);
  });
  it('loading an oven takes 300 and it recovers 4 a tick; taking the dish out takes 300 again', () => {
    const g = make();
    const [a, b] = ovens(g) as [number, number];
    g.stations[a]!.inputs.push(0);
    run(g, 1);
    expect(g.mech!.heat![a]).toBe(704);
    expect(g.mech!.heat![b]).toBe(1000);
    run(g, 10);
    expect(g.mech!.heat![a]).toBe(744);
    Object.assign(g.stations[a]!, { done: true, inputs: [0, 1] });
    run(g, 1);
    const t = g.mech!.heat![a]!;
    Object.assign(g.stations[a]!, { done: false, inputs: [] }); // somebody took the dish
    run(g, 1);
    expect(g.mech!.heat![a]).toBe(t - 300 + 4);
  });
  it('the baking speed is 400 + temp * 6 / 10 permil, never under 400', () => {
    const g = make();
    const [a] = ovens(g) as [number];
    for (const [t, want] of [
      [1000, 1000],
      [500, 700],
      [0, 400],
      [333, 599],
    ] as const) {
      g.mech!.heat![a] = t;
      expect(rate(g, a)).toBe(want);
    }
  });
  it('a cold oven really bakes slower: progress after 60 ticks at 0 is 0.4 of the one at 1000', () => {
    const prog = (temp: number) => {
      const g = make();
      const [a] = ovens(g) as [number];
      g.stations[a]!.inputs = [0, 1];
      g.mech!.heat![a] = temp;
      for (let i = 0; i < 60; i++) {
        g.mech!.heat![a] = temp; // hold the temperature to measure the pace alone
        tick(g, idle);
      }
      return g.stations[a]!.progress;
    };
    expect(prog(0) / prog(1000)).toBeCloseTo(0.4, 2);
  });
  it('the temperature stays inside 0..1000', () => {
    const g = make();
    const [a] = ovens(g) as [number];
    g.mech!.heat![a] = 100;
    g.stations[a]!.inputs.push(0);
    run(g, 1);
    expect(g.mech!.heat![a]).toBe(0); // 100 - 300 + 4 clamps at 0
    run(g, 300);
    expect(g.mech!.heat![a]).toBe(1000);
  });
  it('the Ola de frío takes 500 off every oven once, when it starts', () => {
    const g = make();
    const [a, b] = ovens(g) as [number, number];
    (g as { mid: unknown }).mid = { frost: true };
    mechModule('ovenHeat').tickStations(g, 16);
    expect(g.mech!.heat).toMatchObject({ [a]: 504, [b]: 504 });
    mechModule('ovenHeat').tickStations(g, 16);
    expect(g.mech!.heat![a]).toBe(508);
  });
  it('the W oven of woodOven is left alone', () => {
    const rows = HEAT_ROWS.map((r, y) => (y === 4 ? r.replace('.O.', '.W.') : r));
    const g = make({ rows, mech: { ovenHeat: true, woodOven: true } });
    const w = g.stations.findIndex((s) => s.wood);
    expect(w).toBeGreaterThan(-1);
    expect(g.mech!.heat![w]).toBeUndefined();
    expect(rate(g, w)).toBe(1000);
  });
  it('the phone: amber "Horno frío" beside an oven under 400, nothing when it is warm', () => {
    const g = make();
    const [a] = ovens(g) as [number];
    const s = g.stations[a]!;
    Object.assign(g.players.get(1)!, { x: s.tx + 0.5, y: s.ty + 1.0 });
    expect(heatPhone(g, g.players.get(1)!)).toBeNull();
    g.mech!.heat![a] = 300;
    expect(heatPhone(g, g.players.get(1)!)).toMatchObject({ tone: 'amber', label: 'Horno frío' });
  });
  it('same run, same hash; a cooler oven changes it', () => {
    const [x, y] = [make(), make()];
    for (const g of [x, y]) {
      g.stations[ovens(g)[0]!]!.inputs.push(0);
      run(g, 30);
    }
    expect(x.mech!.hash).toBe(y.mech!.hash);
    y.mech!.heat![ovens(y)[0]!] = 10;
    run(y, 1);
    run(x, 1);
    expect(x.mech!.hash).not.toBe(y.mech!.hash);
  });
});

describe('ovenHeatValidate', () => {
  it('needs an oven; from 5 chefs it needs two', () => {
    expect(ovenHeatValidate(HEAT_ROWS, 2)).toEqual([]);
    expect(ovenHeatValidate(HEAT_ROWS, 8)).toEqual([]);
    expect(ovenHeatValidate([], 2)).toEqual([]);
    expect(
      ovenHeatValidate(
        HEAT_ROWS.map((r) => r.replaceAll('O', '.')),
        2,
      ).join(),
    ).toMatch(/no oven/);
    const one = HEAT_ROWS.map((r) => r.replace('O', '.').replace('O', '.'));
    expect(ovenHeatValidate(one, 4)).toEqual([]);
    expect(ovenHeatValidate(one, 5).join()).toMatch(/second O/);
  });
});
