import { describe, expect, it } from 'vitest';
import {
  COOK_MS, CUT_MS, ORDER_EVERY_MS, ORDER_TTL_MS, PENALTY, REWARD, TICK_MS, addPlayer, createGame, tick,
  type Controls, type Game, type Station,
} from './overcooked';
import { ROUND_MS } from './protocol';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
const crate = (g: Game, type: number) => g.stations.find((s) => s.kind === 'crate' && s.crate === type)!;

function setup() {
  const g = createGame();
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
}
// Puts a player on the floor tile next to a station, facing it.
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const floor = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
  const [dx, dy] = floor.find(([dx, dy]) => (s.tx + dx >= 1 && s.tx + dx <= 9 && s.ty + dy >= 1 && s.ty + dy <= 5))!;
  p.x = s.tx + dx + 0.5;
  p.y = s.ty + dy + 0.5;
  p.fx = -dx;
  p.fy = -dy;
}
const press = (g: Game, id: number, n = 1) => tick(g, new Map([[id, { ...idle, a: n }]]));
const run = (g: Game, ms: number, controls: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, controls);
};
const hold = (id: number) => new Map([[id, { ...idle, b: true }]]);

function cutAndCook(g: Game) {
  const board = station(g, 'board');
  const pot = station(g, 'pot');
  for (const type of [0, 1]) {
    face(g, 1, crate(g, type));
    press(g, 1);
    face(g, 1, board);
    press(g, 1);
    run(g, CUT_MS + 100, hold(1));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
  }
  return pot;
}

describe('grab and drop', () => {
  it('grabs from a crate, drops on a counter and picks it up again', () => {
    const g = setup();
    const p = g.players.get(1)!;
    face(g, 1, crate(g, 0));
    press(g, 1);
    expect(p.item).toBe('raw0');
    const counter = station(g, 'counter');
    face(g, 1, counter);
    press(g, 1);
    expect(p.item).toBeNull();
    expect(counter.item).toBe('raw0');
    press(g, 1);
    expect(p.item).toBe('raw0');
    expect(counter.item).toBeNull();
  });

  it('a player holds at most one item', () => {
    const g = setup();
    const p = g.players.get(1)!;
    face(g, 1, crate(g, 0));
    press(g, 1);
    face(g, 1, crate(g, 1));
    press(g, 1);
    expect(p.item).toBe('raw0');
    face(g, 1, station(g, 'plates'));
    press(g, 1);
    expect(p.item).toBe('raw0');
  });

  it('a second press in the same tick finds the hands full', () => {
    const g = setup();
    face(g, 1, crate(g, 0));
    press(g, 1, 2);
    expect(g.players.get(1)!.item).toBe('raw0');
  });

  it('A does nothing when no station is in the facing direction', () => {
    const g = setup();
    const p = g.players.get(1)!;
    p.x = 5.5; p.y = 3.5; p.fx = 1; p.fy = 0;
    press(g, 1);
    expect(p.item).toBeNull();
  });

  it('moves with the stick, faces the last non-null vector and stops at walls', () => {
    const g = setup();
    const p = g.players.get(1)!;
    p.x = 5.5; p.y = 3.5;
    run(g, 500, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeGreaterThan(7);
    run(g, 200, new Map([[1, { ...idle, y: -1 }]]));
    run(g, 100, new Map()); // no input for this player: stands still
    const y = p.y;
    run(g, 100, new Map());
    expect(p.y).toBe(y);
    expect([p.fx, p.fy]).toEqual([0, -1]);
    run(g, 3000, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeLessThan(10);
  });
});

describe('cutting', () => {
  it('only progresses while B is held and pauses on release', () => {
    const g = setup();
    const board = station(g, 'board');
    face(g, 1, crate(g, 0));
    press(g, 1);
    face(g, 1, board);
    press(g, 1);
    expect(board.item).toBe('raw0');
    run(g, CUT_MS * 2); // B up
    expect(board.item).toBe('raw0');
    expect(board.progress).toBe(0);
    run(g, CUT_MS / 2, hold(1));
    expect(board.item).toBe('raw0');
    expect(board.progress).toBeGreaterThan(0.45);
    run(g, CUT_MS, new Map()); // released: no progress
    expect(board.progress).toBeLessThan(0.55);
    run(g, CUT_MS / 2 + 100, hold(1));
    expect(board.item).toBe('cut0');
  });

  it('a cutting player cannot walk away', () => {
    const g = setup();
    face(g, 1, crate(g, 0));
    press(g, 1);
    face(g, 1, station(g, 'board'));
    press(g, 1);
    const p = g.players.get(1)!;
    const y = p.y;
    run(g, 300, new Map([[1, { x: 0, y: 1, a: 0, b: true }]]));
    expect(p.y).toBe(y);
    expect(p.cutting).toBe(true);
  });

  it('boards refuse already cut or non-ingredient items', () => {
    const g = setup();
    const board = station(g, 'board');
    const p = g.players.get(1)!;
    face(g, 1, station(g, 'plates'));
    press(g, 1);
    face(g, 1, board);
    press(g, 1);
    expect(board.item).toBeNull();
    expect(p.item).toBe('plate');
  });
});

describe('pot', () => {
  it('starts cooking with both cut ingredients and finishes only after the timer', () => {
    const g = setup();
    const pot = cutAndCook(g);
    expect(pot.inputs.sort()).toEqual([0, 1]);
    expect(pot.done).toBe(false);
    run(g, COOK_MS - 500);
    expect(pot.done).toBe(false);
    run(g, 700);
    expect(pot.done).toBe(true);
  });

  it('refuses raw ingredients and does not cook with one input', () => {
    const g = setup();
    const pot = station(g, 'pot');
    const p = g.players.get(1)!;
    face(g, 1, crate(g, 0));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
    expect(pot.inputs).toEqual([]);
    expect(p.item).toBe('raw0');
    p.item = 'cut0';
    press(g, 1);
    run(g, COOK_MS * 2);
    expect(pot.inputs).toEqual([0]);
    expect(pot.done).toBe(false);
  });

  it('the dish needs a plate', () => {
    const g = setup();
    const pot = cutAndCook(g);
    run(g, COOK_MS + 100);
    const p = g.players.get(1)!;
    press(g, 1);
    expect(p.item).toBeNull();
    expect(pot.done).toBe(true);
    face(g, 1, station(g, 'plates'));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
    expect(p.item).toBe('dish');
    expect(pot.done).toBe(false);
    expect(pot.inputs).toEqual([]);
  });
});

describe('orders and score', () => {
  it('full recipe delivered adds points and consumes the order', () => {
    const g = setup();
    const pot = cutAndCook(g);
    run(g, COOK_MS + 100);
    face(g, 1, station(g, 'plates'));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
    expect(g.orders.length).toBe(1);
    face(g, 1, station(g, 'window'));
    press(g, 1);
    expect(g.score).toBe(REWARD);
    expect(g.delivered).toBe(1);
    expect(g.orders.length).toBe(0);
    expect(g.players.get(1)!.item).toBeNull();
  });

  it('the window rejects a dish when there is no order, and non-dishes', () => {
    const g = setup();
    const p = g.players.get(1)!;
    run(g, 100);
    g.orders = [];
    p.item = 'dish';
    face(g, 1, station(g, 'window'));
    press(g, 1);
    expect(p.item).toBe('dish');
    expect(g.score).toBe(0);
    g.orders.push({ id: 99, expiresAt: g.time + 1000 });
    p.item = 'plate';
    press(g, 1);
    expect(p.item).toBe('plate');
    expect(g.score).toBe(0);
  });

  it('an expired order subtracts points', () => {
    const g = setup();
    run(g, ORDER_TTL_MS - 500);
    expect(g.score).toBe(0);
    run(g, 1000);
    expect(g.score).toBe(PENALTY);
    expect(g.orders.length).toBe(2); // spawned at 0, 25 and 50 s; the first expired
  });

  it('spawns orders on a schedule capped at the queue size', () => {
    const g = setup();
    expect(g.orders.length).toBe(0);
    run(g, 1);
    expect(g.orders.length).toBe(1);
    run(g, ORDER_EVERY_MS);
    expect(g.orders.length).toBe(2);
  });
});

describe('round', () => {
  it('ends after ROUND_MS and ignores further ticks', () => {
    const g = setup();
    run(g, ROUND_MS + 100);
    expect(g.over).toBe(true);
    const t = g.time;
    press(g, 1);
    expect(g.time).toBe(t);
  });
});
