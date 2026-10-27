// The validator of 'gate' on the test map and on the ways of breaking it.
import { describe, expect, it } from 'vitest';
import { gateValidate } from '../../../sim/validate/mech/gate';
import { GATE_ROWS, GATE_TIMER_ROWS } from './map';

const sub = (rows: readonly string[], y: number, from: string, to: string) => rows.map((r, i) => (i === y ? r.replace(from, to) : r));

describe('gateValidate', () => {
  it('the test map is fine for 2, 4 and 8 chefs; a map with no gate is not its business', () => {
    for (const n of [2, 4, 8]) expect(gateValidate(GATE_ROWS, n)).toEqual([]);
    expect(gateValidate([], 2)).toEqual([]);
    expect(gateValidate(GATE_ROWS.map((r) => r.replace('Z', '.').replaceAll('D', '#')), 2)).toEqual([]);
  });
  it('a plate behind the doors cannot be reached', () => {
    const rows = sub(sub(GATE_ROWS, 2, 'Z', '.'), 6, '.O.', 'ZO.');
    expect(gateValidate(rows, 2).join()).toMatch(/plate Z at \(1, 6\) cannot be reached/);
  });
  it('a plate with no door does nothing', () => {
    expect(gateValidate(GATE_ROWS.map((r) => r.replaceAll('D', '#')), 2).join()).toMatch(/without a door/);
  });
  it('with 2 chefs the porter needs a job beside the plate; a lone chef cannot hold it and work behind the door', () => {
    const away = sub(sub(GATE_ROWS, 2, 'Z', '.'), 3, '#..', '#Z.');
    expect(gateValidate(away, 2).join()).toMatch(/porter has no job/);
    expect(gateValidate(away, 4).join()).not.toMatch(/porter/);
    expect(gateValidate(GATE_ROWS, 1).join()).toMatch(/lone chef/);
  });
  it('timer mode: playable only if the kitchen stands on its own with the doors shut', () => {
    expect(gateValidate(GATE_TIMER_ROWS, 2)).toEqual([]);
    const cellar = GATE_ROWS.map((r) => r.replace('Z', '.'));
    expect(gateValidate(cellar, 2).join()).toMatch(/nobody reaches a O/);
    const noOven = GATE_TIMER_ROWS.map((r, y) => (y === 1 ? r.replace('E#', '.#') : r));
    expect(gateValidate(noOven, 2).join()).toMatch(/nobody reaches a E/);
  });
});
