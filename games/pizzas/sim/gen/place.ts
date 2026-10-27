// What the generator can paste on a classic map, one decorator per mechanic (design section 6). Each takes the rows as a mutable grid and the generator's own stream and returns false when the map has no
// room for it (the attempt is then dropped and the next seed tried). Nothing here validates: `generateMech` runs every validator after the paste, on the map before and after the mutation.
import type { Rng } from '@pichi/core/rng';
import type { MechId } from '../mech/ids';

export type Cells = string[][];
export type Decorator = (c: Cells, rng: Rng) => boolean;
type P = [number, number];

const at = (c: Cells, x: number, y: number) => c[y]?.[x];
const floorLike = (ch: string | undefined) => ch === '.' || ch === 'S';
const cells = (c: Cells, ok: (x: number, y: number) => boolean): P[] =>
  c.flatMap((row, y) => row.flatMap((_ch, x) => (x >= 1 && y >= 1 && x <= 14 && y <= 7 && ok(x, y) ? [[x, y] as P] : [])));
const find = (c: Cells, ch: string): P[] => c.flatMap((row, y) => row.flatMap((v, x) => (v === ch ? [[x, y] as P] : [])));
const manhattan = (a: P, b: P) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];
const set = (c: Cells, [x, y]: P, ch: string) => void (c[y]![x] = ch);
const farFrom = (c: Cells, p: P, chs: string, d: number) => chs.split('').every((ch) => find(c, ch).every((q) => manhattan(p, q) >= d));

const kneader: Decorator = (c, rng) => {
  // a free tile with floor on both sides (the two handles); the walls above or below are welcome but not needed
  const p = pick(
    rng,
    cells(
      c,
      (x, y) =>
        at(c, x, y) === '.' &&
        floorLike(at(c, x - 1, y)) &&
        floorLike(at(c, x + 1, y)) &&
        at(c, x - 1, y) !== 'S' &&
        at(c, x + 1, y) !== 'S',
    ),
  );
  if (!p) return false;
  set(c, p, 'M');
  return true;
};
const woodOven: Decorator = (c, rng) => {
  if (!find(c, 'O').length) return false;
  const open = (x: number, y: number) =>
    at(c, x, y) === '.' &&
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dy]) => floorLike(at(c, x + dx!, y + dy!))).length >= 2;
  const w = pick(rng, cells(c, open));
  if (!w) return false;
  set(c, w, 'W');
  const q = pick(
    rng,
    cells(c, (x, y) => open(x, y) && manhattan([x, y], w) >= 5 && manhattan([x, y], w) <= 9),
  );
  if (!q) return false;
  set(c, q, 'Q');
  return true;
};
const oil: Decorator = (c, rng) => {
  const spot = (d: number) => cells(c, (x, y) => at(c, x, y) === '.' && farFrom(c, [x, y], 'SE', d));
  const g = pick(rng, spot(3));
  if (!g) return false;
  set(c, g, 'g');
  for (let i = 0; i < 2; i++) {
    const a = pick(rng, spot(2));
    if (!a) return false;
    set(c, a, 'a');
  }
  return true;
};
const sprinkler: Decorator = (c, rng) => {
  const p = pick(
    rng,
    cells(c, (x, y) => at(c, x, y) === '.' && farFrom(c, [x, y], 'WS', 2)),
  );
  if (!p) return false;
  set(c, p, '*');
  return true;
};
const oneWay: Decorator = (c, rng) => {
  // three tiles in a row with free floor above and below each: a one-way lane that always has a bypass
  const runs = cells(c, (x, y) =>
    [0, 1, 2].every((i) => at(c, x + i, y) === '.' && floorLike(at(c, x + i, y - 1)) && floorLike(at(c, x + i, y + 1))),
  );
  const r = pick(rng, runs);
  if (!r) return false;
  const ch = rng() < 0.5 ? '>' : '<';
  for (let i = 0; i < 3; i++) set(c, [r[0] + i, r[1]], ch);
  return true;
};
const bridge: Decorator = (c, rng) => {
  // a ditch of five tiles in a column with a plank in the middle: crossing sideways is the shortcut, going round its ends is the long way
  const run = (x: number, y: number) =>
    [0, 1, 2, 3, 4].every((i) => at(c, x, y + i) === '.') && floorLike(at(c, x - 1, y + 2)) && floorLike(at(c, x + 1, y + 2));
  const p = pick(
    rng,
    cells(c, (x, y) => y <= 3 && run(x, y)),
  );
  if (!p) return false;
  for (let i = 0; i < 5; i++) set(c, [p[0], p[1] + i], i === 2 ? 'b' : '~');
  return true;
};
const beltReverse: Decorator = (c, rng) => {
  const r = pick(
    rng,
    cells(c, (x, y) => [0, 1, 2, 3, 4].every((i) => at(c, x + i, y) === '.')),
  );
  if (!r) return false;
  for (let i = 0; i < 4; i++) set(c, [r[0] + i, r[1]], '→'); // the fifth tile stays floor: the belt feeds somewhere
  return true;
};
const ovenHeat: Decorator = (c) => find(c, 'O').length > 0;

/** The mechanics the generator can place on a classic map. gate, raft and heavyTray need a layout of their own (curated maps). */
export const DECORATORS: Partial<Record<MechId, Decorator>> = { kneader, woodOven, oil, sprinkler, oneWay, bridge, beltReverse, ovenHeat };
export const GEN_MECHS = Object.keys(DECORATORS) as MechId[];

export { find, manhattan, pick };
