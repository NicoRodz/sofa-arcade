// Rules of 'gate': the plate holds the door, a closed door is a wall from outside and never from inside, the timer door runs 480 / 360 and waits for an occupied doorway.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { GATE_CLOSED_TICKS, GATE_OPEN_TICKS } from '../../../sim/mech/gate/state';
import { gatePhone } from '../../../sim/mech/gate/phone';
import { GATE_ROWS, GATE_TIMER_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (rows: readonly string[], n = 2): Game => {
  const g = createGame({ rows, n, mech: { gate: true }, countdownMs: 0 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
const put = (g: Game, id: number, x: number, y: number) => Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
// Z is at (8, 2), the doors at (4, 4) and (12, 4); the cellar is below.

describe('mech.gate plate mode', () => {
  it('starts shut; a chef on Z opens it, and it shuts again when he leaves', () => {
    const g = make(GATE_ROWS);
    put(g, 1, 1, 3);
    put(g, 2, 2, 3);
    run(g, 3);
    expect(g.mech!.gate!.open).toBe(false);
    put(g, 1, 8, 2);
    run(g, 2);
    expect(g.mech!.gate!.open).toBe(true);
    put(g, 1, 1, 3);
    run(g, 2);
    expect(g.mech!.gate!.open).toBe(false);
  });
  it('a closed D stops a chef coming from outside; open, he walks through', () => {
    const g = make(GATE_ROWS);
    put(g, 1, 4, 3);
    put(g, 2, 14, 3);
    const down = new Map<number, Controls>([[1, { x: 0, y: 1, a: 0, b: false }]]);
    run(g, 60, down);
    expect(g.players.get(1)!.y).toBeLessThan(4);
    put(g, 2, 8, 2); // the porter takes the plate
    run(g, 60, new Map([...down, [2, idle.get(2) ?? { x: 0, y: 0, a: 0, b: false }]]));
    expect(g.players.get(1)!.y).toBeGreaterThan(5);
  });
  it('the door does not shut on an occupied doorway, and the chef inside can always leave (panic bar)', () => {
    const g = make(GATE_ROWS);
    put(g, 2, 8, 2);
    put(g, 1, 4, 3);
    run(g, 2);
    put(g, 1, 4, 4); // in the doorway
    put(g, 2, 1, 3); // the porter walks off
    run(g, 30);
    expect(g.mech!.gate!.open).toBe(true);
    const down = new Map<number, Controls>([[1, { x: 0, y: 1, a: 0, b: false }]]);
    run(g, 60, down);
    expect(g.players.get(1)!.y).toBeGreaterThan(5);
    run(g, 5);
    expect(g.mech!.gate!.open).toBe(false);
    const up = new Map<number, Controls>([[1, { x: 0, y: -1, a: 0, b: false }]]);
    run(g, 60, up);
    expect(g.players.get(1)!.y).toBeGreaterThan(4.9); // from below the shut door is a wall again
  });
  it('a dropped chef (ghost) on the plate does not hold the door', () => {
    const g = make(GATE_ROWS);
    put(g, 2, 8, 2);
    g.players.get(2)!.ghost = true;
    run(g, 3);
    expect(g.mech!.gate!.open).toBe(false);
  });
  it('the same inputs give the same hash, and the hash follows the door', () => {
    const a = make(GATE_ROWS),
      b = make(GATE_ROWS);
    for (const g of [a, b]) {
      put(g, 1, 8, 2);
      run(g, 5);
    }
    const h = a.mech!.hash;
    expect(b.mech!.hash).toBe(h);
    put(a, 1, 1, 3);
    run(a, 2);
    expect(a.mech!.hash).not.toBe(h);
  });
});

describe('mech.gate timer mode (a D and no Z)', () => {
  it('open 480 ticks, closed 360, again', () => {
    const g = make(GATE_TIMER_ROWS);
    const seen: boolean[] = [];
    for (let t = 0; t < 2 * (GATE_OPEN_TICKS + GATE_CLOSED_TICKS); t++) {
      run(g, 1);
      seen.push(g.mech!.gate!.open);
    }
    const first = seen.indexOf(false);
    expect(first).toBe(GATE_OPEN_TICKS - 1);
    expect(seen.indexOf(true, first)).toBe(GATE_OPEN_TICKS + GATE_CLOSED_TICKS - 1);
    expect(seen.filter((o) => !o)).toHaveLength(2 * GATE_CLOSED_TICKS);
  });
  it('it waits for the doorway to empty before shutting', () => {
    const g = make(GATE_TIMER_ROWS);
    put(g, 1, 4, 4);
    run(g, GATE_OPEN_TICKS + 100);
    expect(g.mech!.gate!.open).toBe(true);
    put(g, 1, 4, 3);
    run(g, 3);
    expect(g.mech!.gate!.open).toBe(false);
  });
});

describe('mech.gate phone', () => {
  it('the porter on Z is blue; in a doorway about to shut (timer) it is red with a tick-tock; elsewhere nothing', () => {
    const g = make(GATE_ROWS);
    put(g, 1, 8, 2);
    put(g, 2, 2, 3);
    run(g, 2);
    expect(gatePhone(g, g.players.get(1)!)).toMatchObject({ tone: 'blue' });
    expect(gatePhone(g, g.players.get(2)!)).toBeNull();
    const t = make(GATE_TIMER_ROWS);
    put(t, 1, 4, 4);
    run(t, GATE_OPEN_TICKS - 30);
    expect(gatePhone(t, t.players.get(1)!)).toMatchObject({ tone: 'red', sfx: 'tick-tock' });
  });
});
