// The phone's attention for the mechanics: a note appears once, buzzes when it CHANGES, and a quiet round never buzzes.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls } from '../../sim/overcooked';
import { createMechPhone } from '../../sim/mech/phone';
import { GATE_ROWS } from './gate/map';

const idle = new Map<number, Controls>();
describe('createMechPhone', () => {
  it('a round with no mechanics never buzzes', () => {
    const g = createGame({ n: 1, countdownMs: 0 });
    addPlayer(g, 1, 0, 0);
    expect(createMechPhone().sync(g)).toEqual([]);
    expect(createMechPhone().sync(null)).toEqual([]);
  });
  it('the porter on the plate buzzes once, and again only after the note went away and came back', () => {
    const g = createGame({ rows: GATE_ROWS, n: 2, mech: { gate: true }, countdownMs: 0 });
    addPlayer(g, 1, 0, 0);
    addPlayer(g, 2, 1, 1);
    const phone = createMechPhone();
    const put = (x: number, y: number) => Object.assign(g.players.get(1)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });
    put(1, 3);
    tick(g, idle);
    expect(phone.sync(g)).toEqual([]);
    put(8, 2); // the plate Z
    tick(g, idle);
    expect(phone.sync(g)).toEqual([1]);
    tick(g, idle);
    expect(phone.sync(g)).toEqual([]);
    put(1, 3);
    tick(g, idle);
    expect(phone.sync(g)).toEqual([]);
    put(8, 2);
    tick(g, idle);
    expect(phone.sync(g)).toEqual([1]);
  });
});
