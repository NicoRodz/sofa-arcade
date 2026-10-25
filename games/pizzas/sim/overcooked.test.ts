import { describe, expect, it } from 'vitest';
import {
  COLS,
  ROWS,
  TICK_MS,
  addPlayer,
  createGame,
  isSolid,
  recipeBase,
  spawnOrder,
  tick,
  type Controls,
  type Game,
  type Station,
} from './overcooked';
import { DIRS, fixedMap, isFloor } from './maps';
import { params, type Difficulty } from '@pichi/core/difficulty';
import { ROUND_MS } from '@pichi/core';

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

describe('maps', () => {
  const river = () => createGame({ rows: fixedMap('3')!.rows });

  it('players spawn on the map S tiles, alternating sides on the river map', () => {
    const g = river();
    [1, 2, 3, 4].forEach((id) => addPlayer(g, id, id - 1));
    expect([...g.players.values()].map((p) => [p.x, p.y])).toEqual([
      [3.5, 4.5],
      [11.5, 4.5],
      [3.5, 6.5],
      [11.5, 6.5],
    ]);
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
    p.x = 5.5;
    p.y = 3.5;
    run(g, 3000, new Map([[1, { ...idle, x: 1 }]]));
    expect(p.x).toBeLessThan(7);
  });

  it('an item crosses the river through a passing counter', () => {
    const g = river();
    addPlayer(g, 1, 0); // left
    addPlayer(g, 2, 1); // right
    const counter = g.stations.find((s) => s.kind === 'counter' && s.tx === 7 && s.ty === 4)!;
    const left = g.players.get(1)!,
      right = g.players.get(2)!;
    left.x = 6.5;
    left.y = 4.5;
    left.fx = 1;
    left.fy = 0;
    left.item = 'cut0';
    right.x = 8.5;
    right.y = 4.5;
    right.fx = -1;
    right.fy = 0;
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

describe('cheese and Margarita', () => {
  const trattoria = (n = 4, seed = 1) => {
    const g = createGame({ rows: fixedMap('9')!.rows, n, seed });
    addPlayer(g, 1, 0);
    return g;
  };
  const cheeseCrate = (g: Game) => g.stations.find((s) => s.kind === 'crate' && s.crate === 2)!;

  it('the cheese crate hands raw cheese; grated on a board (hold B) it becomes cut cheese', () => {
    const g = trattoria();
    face(g, 1, cheeseCrate(g));
    press(g, 1);
    expect(g.players.get(1)!.item).toBe('raw2');
    face(g, 1, station(g, 'board'));
    press(g, 1);
    expect(station(g, 'board').item).toBe('raw2');
    run(g, g.params.cutMs + 100, hold(1));
    expect(station(g, 'board').item).toBe('cut2');
  });

  it('dough + tomato cook as a Marinara; cheese added while it cooks makes it a Margarita (dishQ) without restarting the timer', () => {
    const g = trattoria();
    const pot = station(g, 'pot');
    pot.inputs = [0, 1];
    run(g, 3000);
    const progress = pot.progress;
    expect(progress).toBeGreaterThan(0.3);
    g.players.get(1)!.item = 'cut2';
    face(g, 1, pot);
    press(g, 1);
    expect(pot.inputs).toEqual([0, 1, 2]);
    expect(pot.progress).toBeGreaterThanOrEqual(progress); // not reset: cheese joins mid-cook
    run(g, g.params.cookMs + 100);
    expect(pot.done).toBe(true);
    g.players.get(1)!.item = 'plate';
    press(g, 1);
    expect(g.players.get(1)!.item).toBe('dishQ');
    expect(pot.inputs).toEqual([]);
  });

  it('cheese first does not start cooking; the oven waits for dough and tomato; cheese is refused once the pizza is done', () => {
    const g = trattoria();
    const pot = station(g, 'pot');
    const p = g.players.get(1)!;
    p.item = 'cut2';
    face(g, 1, pot);
    press(g, 1);
    run(g, 2000);
    expect(pot.progress).toBe(0);
    p.item = 'cut0';
    press(g, 1);
    p.item = 'cut1';
    press(g, 1);
    run(g, g.params.cookMs + 100);
    expect(pot.done).toBe(true);
    p.item = 'cut2';
    pot.inputs = [0, 1];
    press(g, 1);
    expect(p.item).toBe('cut2'); // refused
  });

  it('a Margarita satisfies the first order whatever it asked; a Marinara cannot satisfy a Margarita order', () => {
    const g = trattoria();
    run(g, 10);
    g.orders = [
      { id: 50, expiresAt: g.time + 60_000, warned: false, recipe: 'margarita' },
      { id: 51, expiresAt: g.time + 60_000, warned: false, recipe: 'marinara' },
    ];
    const p = g.players.get(1)!;
    face(g, 1, station(g, 'window'));
    p.item = 'dish';
    press(g, 1);
    expect(g.orders.map((o) => o.id)).toEqual([50]); // the Marinara went to the Marinara order
    p.item = 'dish';
    press(g, 1);
    expect(p.item).toBeNull(); // only a Margarita order is left: the wrong plate is refused (R16: it goes back dirty, pays nothing)
    expect(g.delivered).toBe(1);
    expect(g.rejected).toBe(1);
    p.item = 'dishQ';
    press(g, 1);
    expect(g.orders).toEqual([]);
    expect(g.delivered).toBe(2);
  });

  it('a Margarita also serves a Marinara-only queue', () => {
    const g = trattoria();
    run(g, 10);
    g.orders = [{ id: 60, expiresAt: g.time + 60_000, warned: false, recipe: 'marinara' }];
    g.players.get(1)!.item = 'dishQ';
    face(g, 1, station(g, 'window'));
    press(g, 1);
    expect(g.delivered).toBe(1);
  });

  it('orders on a map with cheese follow the % of Margarita for N and are deterministic for a seed; maps without cheese only ask Marinara', () => {
    const count = (seed: number, n: number, rows: readonly string[]) => {
      const g = createGame({ rows, n, seed, difficulty: 'normal' });
      let q = 0,
        total = 0;
      for (let i = 0; i < 4000; i++) {
        g.orders = [];
        spawnOrder(g);
        total++;
        if (g.orders[0]!.recipe === 'margarita') q++;
      }
      return q / total;
    };
    expect(count(3, 2, fixedMap('9')!.rows)).toBeCloseTo(0.3, 1);
    expect(count(3, 8, fixedMap('9')!.rows)).toBeCloseTo(0.6, 1);
    expect(count(3, 8, fixedMap('1')!.rows)).toBe(0);
    const a = createGame({ rows: fixedMap('9')!.rows, n: 4, seed: 9 }),
      b = createGame({ rows: fixedMap('9')!.rows, n: 4, seed: 9 });
    run(a, 120_000);
    run(b, 120_000);
    expect(a.orders.map((o) => o.recipe)).toEqual(b.orders.map((o) => o.recipe));
  });

  it('events: potStart fires when dough and tomato are both in, not for cheese alone', () => {
    const g = trattoria();
    const seen: string[] = [];
    g.bus.on('potStart', () => seen.push('start'));
    const pot = station(g, 'pot'),
      p = g.players.get(1)!;
    face(g, 1, pot);
    for (const it of ['cut2', 'cut0'] as const) {
      p.item = it;
      press(g, 1);
    }
    expect(seen).toEqual([]);
    p.item = 'cut1';
    press(g, 1);
    expect(seen).toEqual(['start']);
  });
});

describe('plates and washing', () => {
  // El lavadero (10) has a return (U) and a sink (L): plates are finite
  const lavadero = (n = 5) => {
    const g = createGame({ rows: fixedMap('10')!.rows, n, countdownMs: 0 });
    addPlayer(g, 1, 0);
    return g;
  };
  const ret = (g: Game) => station(g, 'dirty');
  const sink = (g: Game) => station(g, 'sink');
  const piles = (g: Game) => g.stations.filter((s) => s.kind === 'plates');
  const deliverOne = (g: Game) => {
    g.orders = [{ id: 70, expiresAt: g.time + 60_000, warned: false, recipe: 'marinara' }];
    g.players.get(1)!.item = 'dish';
    face(g, 1, station(g, 'window'));
    press(g, 1);
  };

  it('with a return and a sink the plates in circulation are finite: the stock follows N and runs out', () => {
    for (const [n, plates] of [
      [4, 4],
      [5, 5],
      [6, 5],
    ] as const) {
      const g = lavadero(n);
      expect(piles(g).reduce((a, s) => a + s.count, 0)).toBe(plates);
    }
    const g = lavadero(4);
    const p = g.players.get(1)!;
    const pile = piles(g).find((s) => s.count > 0)!;
    const stock = pile.count;
    for (let i = 0; i < stock; i++) {
      face(g, 1, pile);
      press(g, 1);
      expect(p.item).toBe('plate');
      p.item = null;
    }
    expect(pile.count).toBe(0);
    face(g, 1, pile);
    press(g, 1);
    expect(p.item).toBeNull(); // empty pile
  });

  it('maps without a sink keep an endless pile', () => {
    const g = setup();
    expect(g.finitePlates).toBe(false);
    const p = g.players.get(1)!;
    for (let i = 0; i < 20; i++) {
      face(g, 1, station(g, 'plates'));
      press(g, 1);
      expect(p.item).toBe('plate');
      p.item = null;
    }
  });

  it('a delivery sends the plate back dirty 6 s later, at the return, with an event', () => {
    const g = lavadero();
    const seen: number[] = [];
    g.bus.on('dirtyNew', (e) => seen.push(e.station));
    run(g, 10);
    deliverOne(g);
    expect(g.delivered).toBe(1);
    run(g, 5900);
    expect(ret(g).count).toBe(0);
    run(g, 200);
    expect(ret(g).count).toBe(1);
    expect(seen).toEqual([g.stations.indexOf(ret(g))]);
  });

  it('dirty plate: take it at the return, drop it in the sink, hold B 1.5 s per plate, take the clean plate', () => {
    const g = lavadero();
    const p = g.players.get(1)!;
    const washed: number[] = [];
    g.bus.on('washDone', (e) => washed.push(e.station));
    const log: string[] = [];
    g.bus.on('washStart', () => log.push('start'));
    g.bus.on('washStop', () => log.push('stop'));
    ret(g).count = 2;
    face(g, 1, ret(g));
    press(g, 1);
    expect(p.item).toBe('dirty');
    expect(ret(g).count).toBe(1);
    face(g, 1, sink(g));
    press(g, 1);
    expect(p.item).toBeNull();
    expect(sink(g).count).toBe(1);
    run(g, 1400, hold(1));
    expect(sink(g).clean).toBe(0);
    run(g, 200, hold(1));
    expect(sink(g).count).toBe(0);
    expect(sink(g).clean).toBe(1);
    expect(washed).toEqual([g.stations.indexOf(sink(g))]);
    run(g, 100); // B up
    expect(log).toEqual(['start', 'stop']);
    press(g, 1);
    expect(p.item).toBe('plate');
    expect(sink(g).clean).toBe(0);
  });

  it('washing does nothing without dirty plates; B alone elsewhere does not wash', () => {
    const g = lavadero();
    face(g, 1, sink(g));
    run(g, 3000, hold(1));
    expect(g.players.get(1)!.cutting).toBe(false);
    expect(sink(g).clean).toBe(0);
  });

  it('a clean plate can go back on the pile or into the sink', () => {
    const g = lavadero();
    const p = g.players.get(1)!;
    const pile = piles(g)[0]!;
    const before = pile.count;
    p.item = 'plate';
    face(g, 1, pile);
    press(g, 1);
    expect(pile.count).toBe(before + 1);
    p.item = 'plate';
    face(g, 1, sink(g));
    press(g, 1);
    expect(sink(g).clean).toBe(1);
  });

  it('the trash refuses plates (they would be lost for good) but takes a pizza and the plate under it comes back dirty', () => {
    const g = lavadero();
    const p = g.players.get(1)!;
    const bin = station(g, 'trash');
    p.item = 'plate';
    face(g, 1, bin);
    press(g, 1);
    expect(p.item).toBe('plate');
    p.item = 'dirty';
    press(g, 1);
    expect(p.item).toBe('dirty');
    p.item = 'dish';
    press(g, 1);
    expect(p.item).toBeNull();
    run(g, 6100);
    expect(ret(g).count).toBe(1);
  });

  it('every delivery sends a plate back to the return', () => {
    const g = createGame({ rows: fixedMap('12')!.rows, n: 5 });
    addPlayer(g, 1, 0);
    expect(g.stations.filter((s) => s.kind === 'dirty')).toHaveLength(1);
    run(g, 10);
    deliverOne(g);
    deliverOne(g);
    run(g, 6100);
    expect(ret(g).count).toBe(g.delivered);
  });
});

describe('trash and shared stations', () => {
  it('the trash discards whatever is in hand', () => {
    const g = createGame({ rows: fixedMap('6')!.rows });
    addPlayer(g, 1, 0);
    const p = g.players.get(1)!;
    p.item = 'raw1';
    face(g, 1, station(g, 'trash'));
    press(g, 1);
    expect(p.item).toBeNull();
  });

  it('Espejo: the oven in the central column takes ingredients from both sides, and each side picks up from it', () => {
    const g = createGame({ rows: fixedMap('8')!.rows });
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1); // left and right of the mirror
    const oven = g.stations.find((s) => s.kind === 'pot' && s.tx === 7 && s.ty === 2)!;
    const left = g.players.get(1)!,
      right = g.players.get(2)!;
    left.x = 6.5;
    left.y = 2.5;
    left.fx = 1;
    left.fy = 0;
    left.item = 'cut0';
    right.x = 8.5;
    right.y = 2.5;
    right.fx = -1;
    right.fy = 0;
    right.item = 'cut1';
    press(g, 1);
    press(g, 2);
    expect(oven.inputs.sort()).toEqual([0, 1]);
    run(g, P.cookMs + 100);
    expect(oven.done).toBe(true);
    left.item = 'plate';
    press(g, 1);
    expect(left.item).toBe('dish'); // the left side takes it out even though the right side loaded it
  });
  // chefs used to walk through each other; since R4 they are solid circles (see feel.test.ts)
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
