// Surfaces (ice, floor belts): pure rules. Off by default; on, ice stretches the velocity, belts carry chefs and loose items.
import { describe, expect, it } from 'vitest';
import { SPEED, TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Player } from './overcooked';
import { parseMap } from './maps';
import { addFloorItem } from './floor';
import { usesSurfaces } from './surfaces/legend';
import { surfaceProblems, validateMap } from './validate';
import type { MapDef } from './maps/types';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const step = (g: Game, c: Record<number, Partial<Controls>> = {}) =>
  tick(g, new Map(Object.entries(c).map(([id, v]) => [Number(id), { ...idle, ...v }])));
const walk = (g: Game, ms: number, c: Record<number, Partial<Controls>> = {}) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) step(g, c);
};
const put = (p: Player, x: number, y: number) => Object.assign(p, { x, y, vx: 0, vy: 0 });

// ice in the middle band (rows 2-3), an east belt on row 5 and a south belt on column 14 (rows 1-3), plain floor elsewhere
const ROWS = [
  '##C1C2CKCKCOCOC#',
  '#.............↓#',
  'C..iiiiiiiii..↓E',
  'P..iiiiiiiii..↓C',
  'C..S......S.....',
  'C.→→→→→→→→→→→..C',
  'C......S.S.....C',
  '#..............#',
  '##CCCCCCCCCCCC##',
];
const make = (surfaces: boolean): Game => {
  const g = createGame({ rows: ROWS, surfaces, countdownMs: 0, n: 2 });
  addPlayer(g, 1, 0);
  step(g); // starts the round
  return g;
};
const chef = (g: Game) => g.players.get(1)!;
const speed = (g: Game) => Math.hypot(chef(g).vx, chef(g).vy);

describe('legend and parser', () => {
  it('reads ice and the four arrows as floor with a surface; a versus map refuses them', () => {
    const g = parseMap(ROWS.map((r, i) => (i === 7 ? '#↑↓←→i.........#' : r)));
    expect(g[7]![1]).toMatchObject({ kind: 'floor', surface: { kind: 'belt', dx: 0, dy: -1 } });
    expect(g[7]![2]).toMatchObject({ surface: { kind: 'belt', dy: 1 } });
    expect(g[7]![5]).toMatchObject({ kind: 'floor', surface: { kind: 'ice' } });
    expect(() =>
      parseMap(
        ROWS.map((r, i) => (i === 7 ? '#.i............#' : r)),
        true,
      ),
    ).toThrow(/unknown tile/);
  });
  it('usesSurfaces tells the maps that need the flag', () => {
    expect(usesSurfaces(ROWS)).toBe(true);
    expect(usesSurfaces(ROWS.map((r) => r.replace(/[i→↓]/g, '.')))).toBe(false);
  });
});

describe('flag off: nothing changes', () => {
  it('has no surface state and a chef stops at once on an ice tile', () => {
    const g = make(false);
    expect(g.surf).toBeNull();
    put(chef(g), 5.5, 2.5);
    walk(g, 600, { 1: { x: 1 } });
    walk(g, 200, {});
    expect(speed(g)).toBeLessThan(0.1);
  });
});

describe('ice', () => {
  it('keeps most of the speed 150 ms after the stick is released (plain floor: almost none)', () => {
    const g = make(true);
    put(chef(g), 4.5, 2.5);
    walk(g, 1600, { 1: { x: 1 } });
    expect(chef(g).x).toBeLessThan(11.5); // still on the ice
    const v = speed(g);
    walk(g, 150, {});
    expect(speed(g)).toBeGreaterThan(v * 0.55);
    const plain = make(true);
    put(plain.players.get(1)!, 4.5, 4.5);
    walk(plain, 600, { 1: { x: 1 } });
    walk(plain, 150, {});
    expect(Math.hypot(plain.players.get(1)!.vx, 0)).toBeLessThan(SPEED * 0.1);
  });
  it('a reversed stick does not turn the chef at once, but takes the control back (tau ~ 400 ms)', () => {
    const g = make(true);
    put(chef(g), 8.5, 2.5);
    chef(g).vx = SPEED;
    walk(g, 100, { 1: { x: -1 } });
    expect(chef(g).vx).toBeGreaterThan(0);
    walk(g, 1900, { 1: { x: -1 } });
    expect(chef(g).vx).toBeLessThan(-SPEED * 0.9);
  });
  it('with the stick held it reaches 95% of the walking speed within 3 tau', () => {
    const g = make(true);
    put(chef(g), 3.5, 2.5);
    walk(g, 1200, { 1: { x: 1 } });
    expect(chef(g).vx).toBeGreaterThan(SPEED * 0.9);
  });
});

describe('belts', () => {
  it('carry an idle chef at 1.2 tiles/s', () => {
    const g = make(true);
    put(chef(g), 3.5, 5.5);
    walk(g, 1000, {});
    expect(chef(g).x - 3.5).toBeCloseTo(1.2, 1);
  });
  it('can be walked against, slower', () => {
    const g = make(true);
    put(chef(g), 9.5, 5.5);
    walk(g, 800, { 1: { x: -1 } });
    const net = (9.5 - chef(g).x) / 0.8;
    expect(net).toBeGreaterThan(1.5);
    expect(net).toBeLessThan(SPEED - 1.2 + 0.3);
  });
  it('carry a loose item one tile per BELT_STEP_MS and stop it at the end of the belt, on the floor', () => {
    const g = make(true);
    const f = addFloorItem(g, { tx: 2, ty: 5, item: 'raw0', kind: 'dropped', team: 0 });
    walk(g, 833 * 3 + 50, {});
    expect(f.tx).toBe(5);
    walk(g, 20000, {});
    expect(f.tx).toBe(13); // the belt ends at column 12; the item steps off onto the plain floor and stays
    expect(g.grid[f.ty]![f.tx]!.kind).toBe('floor');
  });
  it('never push an item into a station or a wall: it waits at the end of the belt', () => {
    const g = createGame({
      rows: ROWS.map((r, i) => (i === 5 ? 'C.→→→→→→→→→→→C..C'.slice(0, 13) + 'C..' : r)),
      surfaces: true,
      countdownMs: 0,
      n: 2,
    });
    const f = addFloorItem(g, { tx: 11, ty: 5, item: 'raw0', kind: 'dropped', team: 0 });
    walk(g, 5000, {});
    expect(f.tx).toBe(12);
  });
  it('leave rubbish where it fell and a chef carried into a wall just stops', () => {
    const g = make(true);
    const t = addFloorItem(g, { tx: 4, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    put(chef(g), 14.5, 1.5);
    walk(g, 6000, {});
    expect(t.tx).toBe(4);
    expect(chef(g).y).toBeLessThan(5);
    expect(chef(g).y).toBeGreaterThan(3);
  });
  it('announce themselves when a chef steps on one, and ice when it steps on at speed', () => {
    const g = make(true);
    const seen: string[] = [];
    g.bus.on('surface:belt', () => seen.push('belt'));
    g.bus.on('surface:slide', () => seen.push('slide'));
    put(chef(g), 1.5, 5.5);
    walk(g, 500, { 1: { x: 1 } });
    put(chef(g), 1.5, 2.5);
    walk(g, 600, { 1: { x: 1 } });
    expect(seen).toEqual(['belt', 'slide']);
  });
});

describe('validator', () => {
  const meta = { id: 'x', name: 'x', nMin: 2, nMax: 2, minDuro: 1, stars: 1 as const };
  const def = (rows: string[]): MapDef => ({ ...meta, rows });
  it('accepts belts and ice (they are floor)', () => {
    expect(surfaceProblems(parseMap(ROWS))).toEqual([]);
    expect(validateMap(def(ROWS)).errors.filter((e) => /belt/.test(e))).toEqual([]);
  });
  it('refuses a belt that feeds a wall, water, the edge, or a belt facing it', () => {
    const at = (y: number, x: number, c: string) => ROWS.map((r, i) => (i === y ? r.slice(0, x) + c + r.slice(x + 1) : r));
    expect(surfaceProblems(parseMap(at(7, 1, '←')))).toEqual([expect.stringMatching(/feeds wall/)]);
    expect(surfaceProblems(parseMap(at(7, 1, '~').map((r, i) => (i === 6 ? r.slice(0, 1) + '↓' + r.slice(2) : r))))).toEqual([
      expect.stringMatching(/feeds water/),
    ]);
    expect(surfaceProblems(parseMap(at(4, 15, '→')))).toEqual([expect.stringMatching(/edge/)]);
    expect(surfaceProblems(parseMap(at(5, 13, '←')))).toEqual([
      expect.stringMatching(/\(12, 5\).*head on/),
      expect.stringMatching(/\(13, 5\).*head on/),
    ]);
    expect(validateMap(def(at(5, 13, '←'))).ok).toBe(false);
  });
});
