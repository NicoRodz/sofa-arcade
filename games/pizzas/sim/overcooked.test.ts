import { describe, expect, it } from 'vitest';
import { createGame, recipeBase } from './overcooked';
import { params } from '@pichi/core/difficulty';
import { idle, station, crate, P, setup, face, press, run, hold, cutAndCook } from './overcooked.kit';

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
    p.x = 5.5;
    p.y = 2.5;
    p.fx = 1;
    p.fy = 0;
    press(g, 1);
    expect(p.item).toBeNull();
  });

  it('moves with the stick, faces the last non-null vector and stops at walls', () => {
    const g = setup();
    const p = g.players.get(1)!;
    p.x = 5.5;
    p.y = 3.5;
    run(g, 500, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeGreaterThan(7);
    run(g, 200, new Map([[1, { ...idle, y: -1 }]]));
    run(g, 300, new Map()); // no input for this player: coasts for ~tau_stop (R1) and then stands still
    const y = p.y;
    run(g, 100, new Map());
    expect(p.y).toBe(y);
    expect([p.fx, p.fy]).toEqual([0, -1]);
    run(g, 3000, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeLessThan(15); // the counter column stops it
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
    run(g, P.cutMs * 2); // B up
    expect(board.item).toBe('raw0');
    expect(board.progress).toBe(0);
    run(g, P.cutMs / 2, hold(1));
    expect(board.item).toBe('raw0');
    expect(board.progress).toBeGreaterThan(0.45);
    run(g, P.cutMs, new Map()); // released: no progress
    expect(board.progress).toBeLessThan(0.55);
    run(g, P.cutMs / 2 + 100, hold(1));
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
    run(g, P.cookMs - 500);
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
    run(g, P.cookMs * 2);
    expect(pot.inputs).toEqual([0]);
    expect(pot.done).toBe(false);
  });

  it('the dish needs a plate', () => {
    const g = setup();
    const pot = cutAndCook(g);
    run(g, P.cookMs + 100);
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
    run(g, P.cookMs + 100);
    face(g, 1, station(g, 'plates'));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
    expect(g.orders.length).toBe(1);
    const order = g.orders[0]!;
    face(g, 1, station(g, 'window'));
    press(g, 1);
    const base = recipeBase('marinara', P.tune);
    const tip = Math.round((base * P.tune.tipPct * (order.expiresAt - g.time)) / P.orderTtlMs); // first delivery: streak multiplier x1
    expect(tip).toBeGreaterThan(0);
    expect(g.score).toBe(base + tip);
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
    g.orders.push({ id: 99, expiresAt: g.time + 1000, warned: false, recipe: 'marinara' });
    p.item = 'plate';
    press(g, 1);
    expect(p.item).toBe('plate');
    expect(g.score).toBe(0);
  });

  it('an expired order subtracts the difficulty penalty', () => {
    const g = setup();
    g.score = 30;
    run(g, P.orderTtlMs - 500);
    expect(g.score).toBe(30);
    run(g, 1000);
    expect(g.score).toBe(30 + P.penalty);
    expect(g.orders.length).toBe(1); // spawned at 0 and 40 s; the first expired
  });

  it('the score never drops below zero, and easy has no penalty', () => {
    const g = setup();
    run(g, P.orderTtlMs + 1000);
    expect(g.score).toBe(0);
    const e = setup('easy');
    e.score = 30;
    run(e, params('easy', 2).orderTtlMs + 1000);
    expect(e.score).toBe(30);
  });

  it('starts with the difficulty initial orders and then spawns on a schedule', () => {
    const g = setup();
    expect(g.orders.length).toBe(1);
    run(g, 1);
    expect(g.orders.length).toBe(1);
    run(g, P.orderEveryMs);
    expect(g.orders.length).toBe(2);
    expect(createGame({ difficulty: 'hard', n: 4 }).orders.length).toBe(2); // initial orders follow the team size, not the difficulty
  });

  it('the order queue is capped at the difficulty maximum', () => {
    const g = setup('easy');
    run(g, params('easy', 2).orderEveryMs * 5);
    expect(g.orders.length).toBeLessThanOrEqual(3);
    expect(createGame({ difficulty: 'normal', n: 6 }).params.maxOrders).toBe(5);
  });
});
