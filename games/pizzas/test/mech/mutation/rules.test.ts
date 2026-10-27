// Rules of the v2 mutation on a live round: the banner 60 ticks before, the atomic change at `at` (the station keeps its whole state), what happens to a chef on the destination or using
// the station, the revert, and the same result every run.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { liveOf } from '../../../sim/mech/mutation/module';
import { MUT, MUT_ROWS } from './map';

const idle = new Map<number, Controls>();
const make = (n = 2, mutation: typeof MUT | null = MUT): Game => {
  const g = createGame({ rows: MUT_ROWS, n, mech: { mutation: true }, mutation: mutation ?? undefined, countdownMs: 0 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const events = (g: Game) => {
  const seen: { type: string; payload: unknown }[] = [];
  const bus = g.bus as unknown as { emit: (t: string, p: unknown) => void };
  const emit = bus.emit.bind(bus);
  bus.emit = (type, payload) => {
    seen.push({ type, payload });
    emit(type, payload);
  };
  return seen;
};
const oven = (g: Game) => g.stations.find((s) => s.kind === 'pot')!;
const put = (g: Game, id: number, x: number, y: number) => Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0 });

describe('mech.mutation v2', () => {
  it('warns 60 ticks before, changes the map at `at`, and does nothing earlier', () => {
    const g = make();
    const ev = events(g);
    run(g, 238);
    expect(ev.filter((e) => e.type === 'mutate:warn')).toHaveLength(0);
    run(g, 4);
    expect(ev.filter((e) => e.type === 'mutate:warn')).toHaveLength(1);
    expect(oven(g)).toMatchObject({ tx: 2, ty: 4 });
    run(g, 60);
    expect(oven(g)).toMatchObject({ tx: 12, ty: 4 });
    expect(g.grid[4]![12]!.kind).toBe('station');
    expect(g.grid[4]![2]!.kind).toBe('floor');
  });
  it('the station keeps its whole state: items, baking progress, index', () => {
    const g = make();
    const o = oven(g),
      idx = g.stations.indexOf(o);
    Object.assign(o, { inputs: [0, 1], progress: 0.4 });
    run(g, 302);
    expect(g.stations.indexOf(oven(g))).toBe(idx);
    expect(oven(g).inputs).toEqual([0, 1]);
    expect(oven(g).progress).toBeGreaterThan(0.39);
  });
  it('swap trades the two stations with their contents', () => {
    const g = make();
    const board = g.stations.find((s) => s.kind === 'board')!;
    board.item = 'raw1';
    run(g, 302);
    expect(board).toMatchObject({ tx: 3, ty: 1, item: 'raw1' });
    expect(g.stations.find((s) => s.kind === 'crate' && s.crate === 1)).toMatchObject({ tx: 8, ty: 1 });
  });
  it('a chef on the destination goes to the nearest free floor tile', () => {
    const g = make();
    put(g, 1, 12, 4);
    run(g, 302);
    const p = g.players.get(1)!;
    expect(g.grid[Math.floor(p.y)]![Math.floor(p.x)]!.kind).toBe('floor');
    expect(Math.abs(Math.floor(p.x) - 12) + Math.abs(Math.floor(p.y) - 4)).toBe(1);
  });
  it('revertAt puts every station back (same tick rules)', () => {
    const g = make();
    run(g, 602);
    expect(oven(g)).toMatchObject({ tx: 2, ty: 4 });
    expect(g.stations.find((s) => s.kind === 'board')).toMatchObject({ tx: 8, ty: 1 });
  });
  it('without the flag, or without data, nothing happens', () => {
    const g = createGame({ rows: MUT_ROWS, n: 1, mutation: MUT, countdownMs: 0 });
    addPlayer(g, 1, 0, 0);
    run(g, 400);
    expect(oven(g)).toMatchObject({ tx: 2, ty: 4 });
    const h = make(1, null);
    run(h, 400);
    expect(oven(h)).toMatchObject({ tx: 2, ty: 4 });
    expect(liveOf(h)).toBeUndefined();
  });
  it('is deterministic: two runs end in the same fingerprint', () => {
    const hash = () => {
      const g = make(3);
      put(g, 1, 12, 4);
      run(g, 700);
      return g.mech!.hash;
    };
    expect(hash()).toBe(hash());
  });
});
