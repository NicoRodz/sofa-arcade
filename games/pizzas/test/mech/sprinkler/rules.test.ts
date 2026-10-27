// Rules of 'sprinkler': a burst every 1200 ticks or at once when there is fire within 2; it washes the oil to water, puts the fire out, and the water dries after 300.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { FIRE, OIL, WATER, WATER_TICKS, at, setTile } from '../../../sim/mech/oil/state';
import { SPRAY_EVERY, SPRAY_TICKS, heads } from '../../../sim/mech/sprinkler/module';
import { sprinklerValidate } from '../../../sim/validate/mech/sprinkler';
import { OIL_ROWS } from '../oil/map';

const idle = new Map<number, Controls>();
const make = (mech = { sprinkler: true, oil: true }): Game => {
  const g = createGame({ rows: OIL_ROWS, n: 1, mech, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  return g;
};
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const idx = (x: number, y: number) => y * 16 + x;

describe('mech.sprinkler', () => {
  it('bursts at 1200: the oil around it turns to water, and the water dries 300 ticks after the burst', () => {
    const g = make();
    setTile(g, idx(3, 4), OIL, 0);
    run(g, SPRAY_EVERY - 5);
    expect(at(g, idx(3, 4))).toBe(OIL);
    run(g, 10);
    expect(at(g, idx(3, 4))).toBe(WATER);
    expect(heads(g)[0]!.on).toBeGreaterThan(0);
    run(g, SPRAY_TICKS + WATER_TICKS + 5);
    expect(at(g, idx(3, 4))).toBe(0);
  });
  it('fire within 2 tiles triggers it at once and is put out', () => {
    const g = make();
    setTile(g, idx(5, 5), FIRE, 360);
    run(g, 3);
    expect(heads(g)[0]!.on).toBeGreaterThan(0);
    setTile(g, idx(4, 6), FIRE, 360);
    run(g, 2);
    expect(at(g, idx(4, 6))).toBe(WATER);
    expect(at(g, idx(5, 5))).toBe(FIRE); // outside the 3x3: it only reaches one tile around
  });
  it('alone (no oil flag) it still washes, ages the water and does not crash', () => {
    const g = createGame({
      rows: OIL_ROWS.map((r) => r.replace('a', '.').replace('g', '.')),
      n: 1,
      mech: { sprinkler: true },
      countdownMs: 0,
    });
    addPlayer(g, 1, 0, 0);
    run(g, SPRAY_EVERY + 5);
    expect(at(g, idx(3, 4))).toBe(WATER);
    run(g, SPRAY_TICKS + WATER_TICKS + 5);
    expect(at(g, idx(3, 4))).toBe(0);
  });
  it('the validator keeps the sprinkler 2 tiles from a wood oven', () => {
    expect(sprinklerValidate(OIL_ROWS, 2)).toEqual([]);
    const rows = OIL_ROWS.map((r, y) => (y === 6 ? '#..W...........#' : r));
    expect(sprinklerValidate(rows, 2).join()).toMatch(/within reach of the wood oven/);
  });
});
