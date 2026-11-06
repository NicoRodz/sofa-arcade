// Where things sit on the walkable segments: touches, the spawn's segment, the goal test and the activators of a level (moved out of validate.ts).
import { T } from '../legend';
import type { ParsedLevel } from '../parse';
import type { Cell } from '../types';
import type { Graph, Seg } from './graph';

// A segment "touches" a cell if a body standing on it reaches the cell with its box, jumping up to `up` tiles.
export function touches(seg: Seg, c: Cell, up: number): boolean {
  if (c.y > seg.row || c.y < seg.row - up) return false;
  return c.x >= seg.x0 - 1 && c.x <= seg.x1 + 1;
}

export function startSegOf(p: ParsedLevel, g: Graph): number {
  const s = p.markers.spawn[0];
  if (!s) return -1;
  for (let y = s.y; y < g.grid.h; y++) {
    const id = g.cellSeg[y * g.grid.w + s.x] ?? -1;
    if (id >= 0) return id;
    const k = g.grid.cells[y * g.grid.w + s.x]!;
    if (k === T.Solid || k === T.Spikes || k === T.Liquid) return -1;
  }
  return -1;
}
export const goalTest = (p: ParsedLevel, g: Graph) => {
  const c = p.markers.goal[0];
  return (id: number) => (c ? touches(g.segs[id]!, c, 3) : false);
};

export function activatorsOf(p: ParsedLevel) {
  return Object.values(p.objects).filter(
    (o) => o.param && (o.param.kind === 'plate' || o.param.kind === 'lever' || o.param.kind === 'target'),
  );
}
