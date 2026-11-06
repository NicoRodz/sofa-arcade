// What a found route used and how long it takes: mechanic of an edge, uses, timeline and hazard check (moved out of validate.ts).
import { RUN_SPEED, TILE } from '../constants';
import type { ModeledMechanic } from '../mechanics';
import type { ParsedLevel } from '../parse';
import type { Edge, Graph } from './graph';

export type Uses = Partial<Record<ModeledMechanic, number>>;

// Which mechanic an edge is. A plain walk-off or fall is not a mechanic; a jump from or onto a boya is a spring.
export function mechanicOf(g: Graph, e: Edge, p?: ParsedLevel): ModeledMechanic | null {
  switch (e.kind) {
    case 'jump':
      return g.segs[e.from]?.tramp || g.segs[e.to]?.tramp ? 'spring' : e.plan && e.plan.trigger !== 'walk' ? 'jump' : null;
    case 'tower':
    case 'hand':
    case 'throw':
    case 'swing':
    case 'ladder':
      return e.kind;
    case 'climb':
      return 'pickaxe';
    case 'superjump':
      return 'superjump';
    case 'ride':
      return e.obj && p?.objects[e.obj]?.param?.kind === 'balance' ? 'balance' : 'mover';
  }
}
export function usesOf(
  p: ParsedLevel,
  g: Graph,
  g2: Graph,
  path: Edge[],
  followPath: Edge[],
  extra: { graph: Graph; edges: Edge[] }[],
  gadgets: Uses,
): Uses {
  const seen = new Set<string>();
  const uses: Uses = { ...gadgets };
  const add = (gr: Graph, e: Edge) => {
    const key = `${e.kind}:${e.takeoffX}:${e.landCell.x},${e.landCell.y}:${e.rise}`;
    if (seen.has(key)) return;
    seen.add(key);
    const m = mechanicOf(gr, e, p);
    if (m) uses[m] = (uses[m] ?? 0) + 1;
  };
  for (const e of path) add(g, e);
  for (const e of followPath) add(g2, e);
  for (const x of extra) for (const e of x.edges) add(x.graph, e);
  return uses;
}
interface Timeline {
  total: number;
  at: { edge: Edge; t: number }[];
}
export function pathSeconds(p: ParsedLevel, path: Edge[], gadgets: number): Timeline {
  let t = 0;
  let x = (p.markers.spawn[0]?.x ?? 0) * TILE;
  const at: { edge: Edge; t: number }[] = [];
  for (const e of path) {
    t += Math.abs(e.takeoffX - x) / RUN_SPEED + e.steps / 60 + (e.coop ? 4 : 0);
    at.push({ edge: e, t });
    x = e.landX;
  }
  const goal = p.markers.goal[0];
  if (goal) t += Math.abs(goal.x * TILE - x) / RUN_SPEED;
  return { total: t + gadgets * 6, at };
}

// Moving hazards (plan §9): the path, with a 1.5x human slowdown, must stay ahead of the avalanche front / above the lava.
export function hazardCheck(p: ParsedLevel, g: Graph, path: Edge[], tl: Timeline, errors: string[]): void {
  const hz = p.def.hazard;
  if (!hz || hz.kind === 'tide') return;
  const mult = g.dp.hazardSpeed; // the legacy table (0.7 / 1 / 1.25) or the campaign world's
  const v = hz.speed * mult; // tiles per second
  const frozen = 3 * p.markers.checkpoint.length; // each checkpoint freezes the lava 3 s (plan §10, level 14); credited to both
  const goal = p.markers.goal[0];
  const stops = tl.at.map(({ edge, t }) => ({ cell: edge.landCell, t }));
  if (goal) stops.push({ cell: goal, t: tl.total });
  for (const { cell, t } of stops) {
    const slow = t * 1.5;
    if (hz.kind === 'risingLava') {
      const surface = p.h - v * Math.max(0, slow - frozen);
      if (cell.y + 1 >= surface - 1) {
        errors.push(
          `risingLava catches the path at (${cell.x},${cell.y}) t=${slow.toFixed(1)}s: lava surface at row ${surface.toFixed(1)}`,
        );
        return;
      }
    } else if (cell.x < v * slow - 5) {
      errors.push(`avalanche catches the path at (${cell.x},${cell.y}) t=${slow.toFixed(1)}s: front at col ${(v * slow - 5).toFixed(1)}`);
      return;
    }
  }
}
