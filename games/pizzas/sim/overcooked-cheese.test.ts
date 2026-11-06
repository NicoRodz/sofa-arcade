import { describe, expect, it } from 'vitest';
import { COLS, ROWS, addPlayer, createGame, isSolid, spawnOrder, type Game } from './overcooked';
import { fixedMap } from './maps';
import { idle, station, face, press, run, hold } from './overcooked.kit';

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
