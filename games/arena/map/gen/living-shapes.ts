// The three living elements as pure geometry (F5). A spec names one MIRRORED PAIR (brush, sofa) or the fountain; each state of a pair closes some tiles of
// the base map, and `closedTiles` is what the validators enumerate. Timing and pushing live in the sim: here nothing moves. Directions are the sim's
// (0 right, 1 down, 2 left, 3 up: clockwise on screen, y down).
import { mirrorTile, type Tile } from '../tile-map';
import type { LivingElement } from './living';

export type LivingKind = 'brush' | 'sofa' | 'fountain';

export interface LivingSpec {
  kind: LivingKind;
  x: number; // left member (team 0 half): the brush's pivot, the first tile of the sofa's rail, the fountain's tile. The right member is its mirror
  y: number;
  variant: number; // brush: orientation at the start (0..3, clockwise); sofa: 0 horizontal rail, 1 vertical rail; fountain: 0
  phase: number; // 0..999: where in its period the round starts (the sim turns it into ticks); drawn by the map substream
}

export const FOUNTAIN_TILE: Tile = [13, 7];
/** The pairs live in the team halves, left of column 10: the golden zone (columns 10-16) and the Hourglass's circle (12-14) stay clear of them. */
export const LIVING_MAX_X = 9;
export const BRUSH_REACH = 2; // the bar: pivot plus 2 tiles
export const SOFA_RAIL = 3;

const DIRS: readonly Tile[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const mirrorDir = (d: number): number => (d === 0 ? 2 : d === 2 ? 0 : d);

export const statesOf = (kind: LivingKind): number => (kind === 'brush' ? 4 : kind === 'sofa' ? 2 : 1);

/** The orientation of the brush's bar in a state: it turns clockwise one step per state (the right member turns the other way: it is the mirror). */
const orient = (spec: LivingSpec, state: number): number => (spec.variant + state) % 4;
const arm = ([px, py]: Tile, o: number, reach: number): Tile => [px + DIRS[o]![0]! * reach, py + DIRS[o]![1]! * reach];
const along = (spec: LivingSpec, i: number): Tile => (spec.variant === 1 ? [spec.x, spec.y + i] : [spec.x + i, spec.y]);

/** Left member: the tiles it closes in a state. The brush's pivot is never closed (a body stands on it); a sofa takes 2 of the 3 rail tiles. */
function leftTiles(spec: LivingSpec, state: number): Tile[] {
  if (spec.kind === 'brush') {
    const o = orient(spec, state);
    return [arm([spec.x, spec.y], o, 1), arm([spec.x, spec.y], o, 2)];
  }
  return spec.kind === 'sofa' ? [along(spec, state), along(spec, state + 1)] : [];
}

/** Every tile the pair closes in a state, both members. */
export const closedTiles = (spec: LivingSpec, state: number): Tile[] => {
  const left = leftTiles(spec, state);
  return [...left, ...left.map(mirrorTile)];
};

/** Both members' tiles over every state, pivots included: what a map must have free (and nothing else may use). */
export function footprint(spec: LivingSpec): Tile[] {
  const out: Tile[] = [];
  for (let s = 0; s < statesOf(spec.kind); s++) out.push(...closedTiles(spec, s));
  if (spec.kind === 'brush') out.push(...pivotsOf(spec));
  return out;
}

export const pivotsOf = (spec: LivingSpec): [Tile, Tile] => [[spec.x, spec.y], mirrorTile([spec.x, spec.y])];

export interface Closing {
  x: number;
  y: number;
  dir: number; // the way the moving part travels over this tile: a body on it is pushed that way
}

/** What the pair shuts going from state `a` to `b = a + 1 (mod states)`: the tiles that were open, each with its push direction. */
export function closing(spec: LivingSpec, a: number): Closing[] {
  const b = (a + 1) % statesOf(spec.kind);
  const was = new Set(leftTiles(spec, a).map(([x, y]) => `${x},${y}`));
  let dir: number;
  if (spec.kind === 'brush')
    dir = (orient(spec, a) + 2) % 4; // the bar turns clockwise: its new tiles are swept against the old bar's direction
  else dir = (spec.variant === 1 ? 1 : 0) + (b < a ? 2 : 0); // the sofa slides forward along its rail, or back
  const left = leftTiles(spec, b)
    .filter(([x, y]) => !was.has(`${x},${y}`))
    .map(([x, y]): Closing => ({ x, y, dir }));
  return [...left, ...left.map((c): Closing => ({ x: mirrorTile([c.x, c.y])[0], y: c.y, dir: mirrorDir(c.dir) }))];
}

/** What the brush's bar sweeps on its way from state `a` to the next, per member: the tiles it leaves (now floor) and the corner between the old bar and the new. */
export function swept(spec: LivingSpec, a: number): [Tile[], Tile[]] {
  const o = orient(spec, a);
  const n = (o + 1) % 4;
  const pv: Tile = [spec.x, spec.y];
  const corner: Tile = [pv[0] + DIRS[o]![0]! + DIRS[n]![0]!, pv[1] + DIRS[o]![1]! + DIRS[n]![1]!];
  const left = [...leftTiles(spec, a), corner];
  return [left, left.map(mirrorTile)];
}

/** The pair as the validators see it: one state variable, the tiles it closes in each state. */
export const toElement = (spec: LivingSpec, i: number): LivingElement => ({
  id: `${spec.kind}-${i}`,
  states: statesOf(spec.kind),
  closed: (s) => closedTiles(spec, s),
});

/** The validators' elements of a set of specs (the fountain closes nothing: it is left out). */
export const elementsOf = (specs: readonly LivingSpec[]): LivingElement[] =>
  specs.filter((s) => s.kind !== 'fountain').map((s, i) => toElement(s, i));
