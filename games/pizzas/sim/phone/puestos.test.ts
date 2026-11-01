import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, fixedMap, parseMap } from './maps';
import { createGame } from './overcooked';
import { PUESTOS, PUESTO_IDS, assignPuestos, featuresOf, puestoProblems, puestoStations, puestosFor } from './puestos';
import { ICON_IDS } from '@pichi/core/icons';

const none = { cheese: false, sink: false };

describe('puesto table', () => {
  it('spawn i gets puesto i: Masa, Corte, Horno, Reparto, Apoyo, ...', () => {
    expect(puestosFor(4, none)).toEqual([['masa'], ['corte'], ['horno'], ['reparto']]);
    expect(puestosFor(6, none).map((p) => p[0])).toEqual(['masa', 'corte', 'horno', 'reparto', 'apoyo', 'corte']);
    expect(puestosFor(8, none).map((p) => p[0])).toEqual(['masa', 'corte', 'horno', 'reparto', 'apoyo', 'corte', 'horno', 'reparto']);
  });
  it('with cheese the sixth chef is Queso; with a sink the fifth is Lavado', () => {
    expect(puestosFor(8, { cheese: true, sink: true }).map((p) => p[0])).toEqual([
      'masa',
      'corte',
      'horno',
      'reparto',
      'lavado',
      'queso',
      'horno',
      'reparto',
    ]);
  });
  it('small teams double up so the whole recipe is covered', () => {
    expect(puestosFor(2, none)).toEqual([
      ['masa', 'horno'],
      ['corte', 'reparto'],
    ]);
    expect(puestosFor(3, none)).toEqual([['masa'], ['corte'], ['horno', 'reparto']]);
    expect(puestosFor(4, { cheese: false, sink: true })[3]).toEqual(['reparto', 'lavado']); // nobody else would wash
  });
  it('a map override replaces the table, indexed by spawn', () => {
    expect(puestosFor(3, none, [['prep'], ['horno', 'reparto']])).toEqual([['prep'], ['horno', 'reparto'], ['horno', 'reparto']]);
  });
  it('every puesto has a name, a known icon and a hint', () => {
    for (const id of PUESTO_IDS) {
      const d = PUESTOS[id];
      expect(d.id).toBe(id);
      expect(ICON_IDS).toContain(d.icon);
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.hint({ cheese: true, sink: true }).length).toBeGreaterThan(5);
    }
  });
  it('assignPuestos hands one entry per chef, with the cycle pool', () => {
    const m = assignPuestos([11, 12, 13], none);
    expect(m.assign.map((a) => [a.id, a.puestos])).toEqual([
      [11, ['masa']],
      [12, ['corte']],
      [13, ['horno', 'reparto']],
    ]);
    expect(m.assign[0]!.pool).toEqual(expect.arrayContaining(['masa', 'corte', 'horno', 'reparto', 'apoyo']));
    expect(m.assign[0]!.pool).not.toContain('queso');
  });
});

describe('puesto stations', () => {
  it("lights the nearest instance of each station of the puesto, on the chef's own side", () => {
    const g = createGame({ rows: fixedMap('3')!.rows }); // river: crates on the left bank, ovens on the right
    const left = g.spawns[0]!,
      right = g.spawns[1]!;
    const kinds = (idx: number[]) =>
      idx.map((i) => `${g.stations[i]!.kind}${g.stations[i]!.crate}@${g.stations[i]!.tx},${g.stations[i]!.ty}`);
    const prep = kinds(puestoStations(g.grid, g.stations, ['prep'], left));
    expect(prep.every((k) => Number(k.split('@')[1]!.split(',')[0]) < 7)).toBe(true);
    expect(prep.length).toBeGreaterThanOrEqual(3); // both crates and a board
    const oven = puestoStations(g.grid, g.stations, ['horno'], right);
    expect(oven).toHaveLength(1);
    expect(g.stations[oven[0]!]!.tx).toBeGreaterThan(7);
  });
  it('Apoyo lights nothing', () => {
    const g = createGame({ rows: fixedMap('1')!.rows });
    expect(puestoStations(g.grid, g.stations, ['apoyo'], g.spawns[0]!)).toEqual([]);
  });
  it('features come from the stations present', () => {
    expect(featuresOf(createGame({ rows: fixedMap('1')!.rows }).stations)).toEqual(none);
  });
});

describe('puesto reachability per map', () => {
  for (const m of FIXED_MAPS) {
    it(`map ${m.id} ${m.name}: every chef reaches the stations of their puesto for every N in ${m.nMin}-${m.nMax}`, () => {
      expect(puestoProblems(m)).toEqual([]);
    });
  }
  it('sabotage: wall in the only oven of La ventanita and the Horno puesto has nowhere to go', () => {
    const m = fixedMap('6')!;
    const rows = m.rows.map((r, y) => (y === 1 ? `${r.slice(0, 10)}#${r.slice(11)}` : r));
    expect(puestoProblems({ ...m, rows }).join()).toMatch(/horno.*no pot reachable/);
  });
  it('sabotage: the default table does not fit a zone map without its override', () => {
    const m = fixedMap('6')!;
    expect(puestoProblems({ ...m, puestos: undefined }).length).toBeGreaterThan(0);
    expect(parseMap(m.rows).length).toBe(9);
  });
});
