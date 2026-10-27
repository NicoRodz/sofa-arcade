// The kneader's rules (design section 2): the ball goes through M, two chefs on the handles give a tick each, one alone gives x0.35, letting go keeps the progress, the dough comes off
// from either handle, and a lone chef calls another. Each rule is pinned against the sim with the real hooks (no spies).
import { describe, expect, it } from 'vitest';
import { KNEADER_ROWS } from './map';
import { press, put, rig, run, station } from './rig';
import type { Controls } from '../../../sim/overcooked';

const LEFT = [6, 4] as const;
const RIGHT = [8, 4] as const;
const hold = (...ids: number[]) => new Map<number, Controls>(ids.map((id) => [id, press(true, 0, id === 1 ? 1 : -1, 0)]));
const ball = () => {
  const g = rig(KNEADER_ROWS, 'kneader');
  station(g, 'kneader').item = 'raw0';
  put(g, 1, ...LEFT, 1, 0);
  put(g, 2, ...RIGHT, -1, 0);
  return g;
};
const prog = (g: ReturnType<typeof ball>) => Object.values(g.mech!.kneader!)[0]!.prog;

describe('kneader: the dough goes through M', () => {
  it('the board refuses the raw ball and keeps it in the hand', () => {
    const g = rig(KNEADER_ROWS, 'kneader');
    put(g, 1, 4, 1, -1, 0, 'raw0');
    run(g, 5, new Map([[1, press(false, 1)]]));
    const board = g.stations.find((s) => s.kind === 'board' && s.tx === 3 && s.ty === 1)!;
    expect(board.item).toBeNull();
    expect(g.players.get(1)!.item).toBe('raw0');
  });
  it('A with the ball puts it on M; A with empty hands takes nothing while it is still a ball', () => {
    const g = rig(KNEADER_ROWS, 'kneader');
    put(g, 1, ...LEFT, 1, 0, 'raw0');
    run(g, 3, new Map([[1, press(false, 1)]]));
    expect(station(g, 'kneader').item).toBe('raw0');
    expect(g.players.get(1)!.item).toBeNull();
    run(g, 3, new Map([[1, press(false, 1)]]));
    expect(station(g, 'kneader').item).toBe('raw0');
  });
});

describe('kneader: progress', () => {
  it('two chefs, one on each handle, finish in 150 ticks and M holds the stretched dough', () => {
    const g = ball();
    run(g, 149, hold(1, 2));
    expect(prog(g)).toBe(149_000);
    expect(station(g, 'kneader').item).toBe('raw0');
    run(g, 1, hold(1, 2));
    expect(station(g, 'kneader').item).toBe('cut0');
  });
  it('a chef alone works at x0.35 (never impossible): 350 permil per tick, done in 429', () => {
    const g = ball();
    run(g, 100, hold(1));
    expect(prog(g)).toBe(35_000);
    run(g, 328, hold(1));
    expect(station(g, 'kneader').item).toBe('raw0');
    run(g, 1, hold(1));
    expect(station(g, 'kneader').item).toBe('cut0');
  });
  it('the same chef cannot be on both handles: one body, one handle', () => {
    const g = ball();
    put(g, 2, ...LEFT, 1, 0); // both chefs on the left handle: only one handle is held
    run(g, 100, hold(1, 2));
    expect(prog(g)).toBe(35_000);
  });
  it('letting go keeps the progress; holding again goes on from there', () => {
    const g = ball();
    run(g, 50, hold(1, 2));
    run(g, 80, new Map());
    expect(prog(g)).toBe(50_000);
    run(g, 10, hold(1, 2));
    expect(prog(g)).toBe(60_000);
  });
  it('B held on a handle pins the chef (no walking, no dash)', () => {
    const g = ball();
    const p = g.players.get(1)!;
    const x = p.x;
    run(g, 30, new Map([[1, press(true, 0, 0, -1)]]));
    expect(p.x).toBe(x);
    expect(p.dashMs).toBe(0);
  });
});

describe('kneader: taking the dough', () => {
  it('either handle takes it, M empties and its progress restarts', () => {
    for (const [who, tile] of [
      [1, LEFT],
      [2, RIGHT],
    ] as const) {
      const g = ball();
      run(g, 150, hold(1, 2));
      put(g, who, tile[0], tile[1], who === 1 ? 1 : -1, 0);
      run(g, 3, new Map([[who, press(false, 1)]]));
      expect(g.players.get(who)!.item).toBe('cut0');
      expect(station(g, 'kneader').item).toBeNull();
      expect(prog(g)).toBe(0);
    }
  });
  it('a chef with full hands does not take it', () => {
    const g = ball();
    run(g, 150, hold(1, 2));
    put(g, 1, ...LEFT, 1, 0, 'plate');
    run(g, 3, new Map([[1, press(false, 1)]]));
    expect(station(g, 'kneader').item).toBe('cut0');
    expect(g.players.get(1)!.item).toBe('plate');
  });
});

describe('kneader: the call for the missing chef', () => {
  const calls = (g: ReturnType<typeof ball>) => {
    const seen: { player: number }[] = [];
    (g.bus as unknown as { on(t: string, f: (e: { player: number }) => void): void }).on('mech:need', (e) => seen.push(e));
    return seen;
  };
  it('a chef alone for 1 s calls the other one, once', () => {
    const g = ball();
    const seen = calls(g);
    run(g, 59, hold(1));
    expect(seen).toHaveLength(0);
    run(g, 1, hold(1));
    expect(seen).toEqual([expect.objectContaining({ player: 2, kind: 'kneader' })]);
    run(g, 300, hold(1));
    expect(seen).toHaveLength(1);
  });
  it('with both on the handles nobody is called', () => {
    const g = ball();
    const seen = calls(g);
    run(g, 100, hold(1, 2));
    expect(seen).toHaveLength(0);
  });
  it('the dough done sounds the clac (chopDone) on both phones', () => {
    const g = ball();
    const done: number[] = [];
    g.bus.on('chopDone', (e) => done.push(e.player));
    run(g, 150, hold(1, 2));
    expect(done.sort()).toEqual([1, 2]);
  });
});
