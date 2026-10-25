// Kitchens that mutate: the diff of tiles, the validator before and after, relocation, and the guarantee that the flag off (or a map without a mutation) changes nothing.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core/rng';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from './index';
import { fixedMap, isFloor, parseMap } from './maps';
import { applyMutation } from './mutate/apply';
import { mutationProblems } from './mutate/check';
import { MUTATE_AT_MS, MUTATE_OPTION, MUTATIONS, mutateOf, mutationFor, rowsAfter, type Mutation } from './mutate/plan';
import { surfaceTiles } from './validate';

const IDLE = new Map<number, Controls>();
const make = (map: string, opts: { mutate?: boolean; seed?: number } = {}): Game => {
  const m = fixedMap(map)!;
  const g = createGame({ mapId: m.id, rows: m.rows, spawns: m.spawns, n: 2, seed: opts.seed ?? 5, mutate: opts.mutate });
  addPlayer(g, 1, 0, 0);
  addPlayer(g, 2, 1, 1);
  return g;
};
const run = (g: Game, untilMs: number) => {
  while (g.time < untilMs && !g.over) tick(g, IDLE, TICK_MS);
};
const synthetic = (tiles: Mutation['tiles']): Mutation => ({ id: 'x', title: 'X', blurb: 'x', tiles });

describe('the three mutations as data', () => {
  it('one per map 1, 2 and 4, each different, only floor tiles', () => {
    expect(Object.keys(MUTATIONS)).toEqual(['1', '2', '4']);
    expect(new Set(Object.values(MUTATIONS).map((m) => m.id)).size).toBe(3);
    expect(mutationFor('3')).toBeNull();
    expect(mutationFor(undefined)).toBeNull();
  });
  it('rowsAfter changes exactly the listed tiles', () => {
    const m = fixedMap('1')!;
    const after = rowsAfter(m.rows, MUTATIONS['1']!);
    const diff = m.rows.flatMap((r, y) => [...r].filter((c, x) => c !== after[y]![x]).map(() => y));
    expect(diff).toHaveLength(MUTATIONS['1']!.tiles.length);
    expect(after[5]).toBe('C..iiiiiiiiii..C');
  });
  it('the lobby option: Sí on Normal and Difícil, No on Fácil, the host overrides', () => {
    expect([mutateOf({}, 'easy'), mutateOf(undefined, 'normal'), mutateOf({}, 'hard')]).toEqual([false, true, true]);
    expect(mutateOf({ [MUTATE_OPTION]: true }, 'easy')).toBe(true);
    expect(mutateOf({ [MUTATE_OPTION]: false }, 'hard')).toBe(false);
  });
});

describe('the validator checks the map before and after', () => {
  for (const id of Object.keys(MUTATIONS))
    it(`map ${id}: solvable before and after`, () => {
      expect(mutationProblems(fixedMap(id)!, MUTATIONS[id]!)).toEqual([]);
    });
  it('catches a belt that feeds a wall (after), a spawn tile, a station, a wall and a tile outside', () => {
    const m = fixedMap('1')!;
    expect(mutationProblems(m, synthetic([{ x: 1, y: 1, to: '↑' }])).join()).toMatch(/after: belt at \(1, 1\) feeds wall/);
    expect(mutationProblems(m, synthetic([{ x: 4, y: 4, to: 'i' }])).join()).toMatch(/spawn tile/);
    expect(mutationProblems(m, synthetic([{ x: 2, y: 0, to: 'i' }])).join()).toMatch(/only floor can change/);
    expect(mutationProblems(m, synthetic([{ x: 3, y: 3, to: '#' }])).join()).toMatch(/becomes a wall/);
    expect(mutationProblems(m, synthetic([{ x: 99, y: 3, to: 'i' }])).join()).toMatch(/outside the map/);
    expect(
      mutationProblems(
        m,
        synthetic([
          { x: 3, y: 3, to: 'i' },
          { x: 3, y: 3, to: '.' },
        ]),
      ).join(),
    ).toMatch(/twice/);
  });
  it('catches a mutation that leaves the recipe unfinishable (the only oven row walled in by counters)', () => {
    const m = fixedMap('3')!; // the river map: a counter bridge is the only route; turning every free floor tile of one bank into a counter strands it
    const tiles = parseMap(m.rows).flatMap((row, y) => row.flatMap((t, x) => (t.kind === 'floor' && !t.spawn ? [{ x, y, to: 'C' }] : [])));
    expect(mutationProblems(m, synthetic(tiles)).join()).toMatch(/after:/);
  });
});

describe('the round', () => {
  it('flag off: nothing runs, the grid never changes; a map without a mutation and versus stay null', () => {
    const g = make('1');
    expect(g.mut).toBeNull();
    const before = JSON.stringify(g.grid);
    run(g, MUTATE_AT_MS + 1000);
    expect(JSON.stringify(g.grid)).toBe(before);
    expect(g.surf).toBeNull();
    expect(make('3', { mutate: true }).mut).toBeNull();
  });
  it('warns 3 s before, changes the tiles in one tick at 1:30, only once', () => {
    const g = make('1', { mutate: true });
    const log: string[] = [];
    g.bus.on('mutate:warn', (e) => log.push(`warn ${Math.round(g.time)} ${e.inMs}`));
    g.bus.on('mutate:apply', (e) => log.push(`apply ${Math.round(g.time)} ${e.tiles.length} ${e.moved}`));
    run(g, 86_000);
    expect(log).toEqual([]);
    expect(surfaceTiles(g.grid).ice).toHaveLength(0);
    run(g, MUTATE_AT_MS - 100);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^warn 870\d\d (29\d\d|3000)$/);
    expect(surfaceTiles(g.grid).ice).toHaveLength(0);
    run(g, MUTATE_AT_MS + 500);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatch(/^apply 90\d\d\d 20 0$/);
    expect(surfaceTiles(g.grid).ice).toHaveLength(20);
    expect(g.surf).not.toBeNull();
  });
  it('the belt mutations really carry a loose item (map 4: towards the window)', () => {
    const g = make('4', { mutate: true });
    run(g, MUTATE_AT_MS + 100);
    expect(surfaceTiles(g.grid).belts).toHaveLength(4);
    g.floor.push({ id: 900, kind: 'trash', tx: 8, ty: 4 } as never);
    g.floor.push({ id: 901, kind: 'item', tx: 8, ty: 4 } as never);
    run(g, g.time + 2000);
    expect(g.floor.find((f) => f.id === 901)!.tx).toBe(6); // the belt moves it west one tile per 1/1.2 s (two in 2 s); rubbish stays
    expect(g.floor.find((f) => f.id === 900)!.tx).toBe(8);
  });
  it('mutate on or off: the orders (RNG streams) are identical, before and after the change', () => {
    const a = make('2'),
      b = make('2', { mutate: true });
    run(a, 100_000);
    run(b, 100_000);
    expect(b.teams[0]!.orders.map((o) => o.id)).toEqual(a.teams[0]!.orders.map((o) => o.id));
    expect(b.teams[0]!.rng()).toBe(a.teams[0]!.rng());
    expect(b.vip.rng()).toBe(a.vip.rng());
  });
  it('a round is the same every time', () => {
    const snap = () => {
      const g = make('2', { mutate: true, seed: 11 });
      run(g, 95_000);
      return JSON.stringify([g.grid, [...g.players.values()].map((p) => [p.x, p.y])]);
    };
    expect(snap()).toBe(snap());
  });
  it('the countdown does not count: the clock is the match time', () => {
    const g = createGame({ mapId: '1', rows: fixedMap('1')!.rows, n: 2, mutate: true, countdownMs: COUNTDOWN_MS });
    addPlayer(g, 1, 0, 0);
    for (let i = 0; i < Math.ceil(COUNTDOWN_MS / TICK_MS) + 5; i++) tick(g, IDLE, TICK_MS);
    expect(g.mut!.phase).toBe('wait');
  });
});

describe('relocation', () => {
  it('a chef and a loose item on a tile that becomes a counter move to the nearest floor, the same way every time', () => {
    const go = () => {
      const g = make('1');
      const p = g.players.get(1)!;
      p.x = 7.5;
      p.y = 3.5;
      p.vx = 2;
      g.floor.push({ id: 5, kind: 'item', tx: 7, ty: 3 } as never);
      const n = applyMutation(g, synthetic([{ x: 7, y: 3, to: 'C' }]), mulberry32(3));
      return { g, n, at: [p.x, p.y, p.vx], item: [g.floor[0]!.tx, g.floor[0]!.ty] };
    };
    const a = go(),
      b = go();
    expect(a.n).toBe(2);
    expect(a.at).toEqual(b.at);
    expect(a.item).toEqual(b.item);
    expect(isFloor(a.g.grid, Math.floor(a.at[0]!), Math.floor(a.at[1]!))).toBe(true);
    expect(isFloor(a.g.grid, a.item[0]!, a.item[1]!)).toBe(true);
    expect(a.at[2]).toBe(0);
    expect(a.g.stations.at(-1)).toMatchObject({ kind: 'counter', tx: 7, ty: 3, item: null });
  });
});
