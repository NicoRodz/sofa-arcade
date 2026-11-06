import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, type Game } from './overcooked';
import { fixedMap } from './maps';
import { params, type Difficulty } from '@pichi/core/difficulty';
import { ROUND_MS } from '@pichi/core';
import { station, crate, P, setup, face, press, run, hold, cutAndCook } from './overcooked.kit';

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
