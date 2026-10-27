// Rules of 'beltReverse': every 1800 ticks every belt turns round (chef push and loose items read the tile), the warning is the last 180, the validator wants belts.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { BELT_PERIOD, BELT_WARN } from '../../../sim/mech/beltReverse/module';
import { beltPhone } from '../../../sim/mech/beltReverse/phone';
import { surfaceAt } from '../../../sim/surfaces/physics';
import { beltReverseValidate } from '../../../sim/validate/mech/beltReverse';
import { BELT_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (): Game => {
  const g = createGame({ rows: BELT_ROWS, n: 2, mech: { beltReverse: true }, surfaces: true, countdownMs: 0 });
  addPlayer(g, 1, 0, 0);
  addPlayer(g, 2, 1, 1);
  return g;
};
const put = (g: Game, id: number, x: number, y: number) => Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });
const run = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) tick(g, idle);
};
const dx = (g: Game, x: number, y: number) => {
  const s = surfaceAt(g, x + 0.5, y + 0.5);
  return s?.kind === 'belt' ? s.dx : 0;
};

describe('mech.beltReverse', () => {
  it('every belt turns round at tick 1800 and again at 3600', () => {
    const g = make();
    expect([dx(g, 5, 3), dx(g, 5, 4)]).toEqual([1, -1]);
    run(g, BELT_PERIOD - 1);
    expect([dx(g, 5, 3), dx(g, 5, 4)]).toEqual([1, -1]);
    run(g, 1);
    expect([dx(g, 5, 3), dx(g, 5, 4)]).toEqual([-1, 1]);
    expect(g.mech!.belt!.reversed).toBe(true);
    run(g, BELT_PERIOD);
    expect([dx(g, 5, 3), dx(g, 5, 4)]).toEqual([1, -1]);
  });
  it('a chef who stands still on a belt drifts one way, and the other way after the flip', () => {
    const g = make();
    put(g, 1, 5, 3);
    put(g, 2, 1, 7);
    const x0 = g.players.get(1)!.x;
    run(g, 20);
    const east = g.players.get(1)!.x - x0;
    expect(east).toBeGreaterThan(0.2);
    g.mech!.belt!.next = 1; // the next tick flips
    put(g, 1, 5, 3);
    run(g, 21);
    expect(g.players.get(1)!.x - (5.5 + 0)).toBeLessThan(0);
  });
  it('the flip does not break the round for the same inputs: same hash on a second run', () => {
    const a = make(),
      b = make();
    run(a, BELT_PERIOD + 10);
    run(b, BELT_PERIOD + 10);
    expect(a.mech!.hash).toBe(b.mech!.hash);
    run(b, 1);
    expect(a.mech!.hash).not.toBe(b.mech!.hash);
  });
  it('a round that turns the flag on gets the surface state it needs even if the lobby did not', () => {
    const g = createGame({ rows: BELT_ROWS, mech: { beltReverse: true } });
    expect(g.surf).not.toBeNull();
  });
  it('the phone of whoever stands on a belt turns violet in the 180 ticks before the flip', () => {
    const g = make();
    put(g, 1, 5, 3);
    put(g, 2, 1, 7);
    run(g, BELT_PERIOD - BELT_WARN - 5);
    put(g, 1, 5, 3);
    expect(beltPhone(g, g.players.get(1)!)).toBeNull();
    run(g, 10);
    put(g, 1, 5, 3);
    expect(beltPhone(g, g.players.get(1)!)).toMatchObject({ tone: 'violet', sfx: 'chime' });
    expect(beltPhone(g, g.players.get(2)!)).toBeNull();
  });
});

describe('beltReverseValidate', () => {
  it('the test map is fine; no belt, a belt out of reach, a belt into water are not', () => {
    expect(beltReverseValidate(BELT_ROWS, 2)).toEqual([]);
    expect(beltReverseValidate([], 2)).toEqual([]);
    expect(beltReverseValidate(BELT_ROWS.map((r) => r.replace(/[→←]/g, '.')), 2).join()).toMatch(/no belt/);
    expect(beltReverseValidate(BELT_ROWS.map((r, y) => (y === 3 ? '#.→→→→→→→→→→→~#' + '.' : r)), 2).join()).toMatch(/into water/);
    const walled = ['################', '#S##############', '#.##############', '################', '####→→→→→→→→####', ...Array<string>(4).fill('################')];
    expect(beltReverseValidate(walled, 2).join()).toMatch(/out of reach/);
  });
});
