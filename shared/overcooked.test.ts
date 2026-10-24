import { describe, expect, it } from 'vitest';
import { COLS, ROWS, TICK_MS, addPlayer, createGame, isSolid, tick, type Controls, type Game, type Station } from './overcooked';
import { DIRS, fixedMap, isFloor } from './maps';
import { params, type Difficulty } from './difficulty';
import { ROUND_MS } from './protocol';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
const crate = (g: Game, type: number) => g.stations.find((s) => s.kind === 'crate' && s.crate === type)!;

const P = params('normal', 2);
function setup(difficulty: Difficulty = 'normal') {
  const g = createGame({ difficulty });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
}
// Puts a player on the floor tile next to a station, facing it.
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
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
    run(g, P.cutMs + 100, hold(1));
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
    p.x = 5.5; p.y = 2.5; p.fx = 1; p.fy = 0;
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
    const tip = Math.round((P.tipMax * (order.expiresAt - g.time)) / P.orderTtlMs);
    expect(tip).toBeGreaterThan(0);
    expect(g.score).toBe(P.reward + tip);
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

  it('an expired order subtracts the difficulty penalty', () => {
    const g = setup();
    g.score = 30;
    run(g, P.orderTtlMs - 500);
    expect(g.score).toBe(30);
    run(g, 1000);
    expect(g.score).toBe(30 + P.penalty);
    expect(g.orders.length).toBe(3); // spawned at 0, 22, 44 and 66 s; the first expired
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
    expect(setup('hard').orders.length).toBe(2);
  });

  it('the order queue is capped at the difficulty maximum', () => {
    const g = setup('easy');
    run(g, params('easy', 2).orderEveryMs * 5);
    expect(g.orders.length).toBeLessThanOrEqual(3);
    expect(createGame({ difficulty: 'normal', n: 6 }).params.maxOrders).toBe(6);
  });
});

describe('maps', () => {
  const river = () => createGame({ rows: fixedMap('3')!.rows });

  it('players spawn on the map S tiles, alternating sides on the river map', () => {
    const g = river();
    [1, 2, 3, 4].forEach((id) => addPlayer(g, id, id - 1));
    expect([...g.players.values()].map((p) => [p.x, p.y])).toEqual([[3.5, 4.5], [11.5, 4.5], [3.5, 6.5], [11.5, 6.5]]);
  });

  it('extra players (slots 4..7) land on distinct free floor tiles', () => {
    const g = river();
    for (let i = 0; i < 8; i++) addPlayer(g, i + 1, i);
    const tiles = new Set([...g.players.values()].map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`));
    expect(tiles.size).toBe(8);
    for (const p of g.players.values()) expect(isSolid(g, Math.floor(p.x), Math.floor(p.y))).toBe(false);
  });

  it('water blocks walking: the left side cannot reach the right', () => {
    const g = river();
    addPlayer(g, 1, 0);
    const p = g.players.get(1)!;
    p.x = 5.5; p.y = 3.5;
    run(g, 3000, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeLessThan(7);
  });

  it('an item crosses the river through a passing counter', () => {
    const g = river();
    addPlayer(g, 1, 0); // left
    addPlayer(g, 2, 1); // right
    const counter = g.stations.find((s) => s.kind === 'counter' && s.tx === 7 && s.ty === 4)!;
    const left = g.players.get(1)!, right = g.players.get(2)!;
    left.x = 6.5; left.y = 4.5; left.fx = 1; left.fy = 0; left.item = 'cut0';
    right.x = 8.5; right.y = 4.5; right.fx = -1; right.fy = 0;
    press(g, 1);
    expect(counter.item).toBe('cut0');
    press(g, 2);
    expect(right.item).toBe('cut0');
    expect(counter.item).toBeNull();
  });

  it('a 16x9 map renders its stations from the grid', () => {
    const g = createGame({ rows: fixedMap('5')!.rows });
    expect(g.stations.filter((s) => s.kind === 'board').length).toBe(1);
    expect(g.stations.filter((s) => s.kind === 'pot').length).toBe(2);
    expect(COLS * ROWS).toBe(144);
  });
});

describe('difficulty applies to the stations', () => {
  const chop = (d: Difficulty, ms: number) => {
    const g = setup(d);
    const board = station(g, 'board');
    face(g, 1, crate(g, 0));
    press(g, 1);
    face(g, 1, board);
    press(g, 1);
    run(g, ms, hold(1));
    return board.item;
  };
  it('cutting time: easy 1.5 s, hard 2.5 s', () => {
    expect(chop('easy', 1600)).toBe('cut0');
    expect(chop('hard', 1600)).toBe('raw0');
    expect(chop('hard', 2600)).toBe('cut0');
  });
  it('cooking time follows the difficulty', () => {
    const g = setup('easy');
    const pot = cutAndCook(g);
    run(g, params('easy', 2).cookMs + 100);
    expect(pot.done).toBe(true);
    const h = setup('hard');
    const hp = cutAndCook(h);
    run(h, params('easy', 2).cookMs + 100);
    expect(hp.done).toBe(false);
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
