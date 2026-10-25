// Difficulty D = 100 * (0.35 J + 0.20 H + 0.15 C + 0.15 T + 0.15 Lg)  (plan §12).
//  J  : (envelope use)^2 averaged over the 5 hardest jumps of the route (missing jumps count 0)
//  H  : landings with a hazard within 1 tile / 6 (cap 1)
//  C  : (cooperative edges + gadget weight) / 6 (cap 1); a latch plate, door or ring weighs 1, a held plate or lever 2
//  T  : (edges with timing: crumbling, belts, boyas, movers, long flights; + held activators; a moving hazard counts 3) / 6 (cap 1)
//  Lg : (length - 60) / 140, clipped to 0..1; length = columns + 2 per row above the usual 18 (vertical levels)
// "Envelope use" of a jump = the smallest stick scale (of the 0.92 the validator allows) that still makes it, or the climb
// as a share of the 173 px jump, whichever is larger. It is measured by re-running the very plan that validated the edge.
import { JUMP_PEAK_PX, PLAYER_H, TILE } from '../constants';
import { isHazardKind } from '../legend';
import { tileAt } from '../sim/tiles';
import { EDGE_MOVE_SCALE, simPlan } from '../validator/sim';
import { planSet, surfaceTiming, type Edge, type Graph } from '../validator/graph';
import type { ValidationReport } from '../validator/validate';
import type { LevelDef } from '../types';

export interface Breakdown {
  J: number;
  H: number;
  C: number;
  T: number;
  Lg: number;
  D: number;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function edgeUsage(g: Graph, e: Edge): number {
  const vertical = Math.max(0, e.rise) / JUMP_PEAK_PX;
  if (e.kind === 'tower') return clamp01(Math.max(0, e.rise) / (JUMP_PEAK_PX + PLAYER_H * (e.k ?? 1)));
  if (e.kind === 'hand') return clamp01(Math.max(0, e.rise) / (JUMP_PEAK_PX + g.dp.handZoneTiles * TILE));
  if (e.kind !== 'jump' || !e.plan) return 0;
  if (e.plan.trigger === 'walk' || e.plan.trigger === 'drop') return 0;
  // the smallest stick scale at which ANY plan from that segment still reaches the same target
  const plans = planSet(g.grid, g.segs[e.from]!, EDGE_MOVE_SCALE);
  const reaches = (f: number) =>
    plans.some((p) => {
      const l = simPlan(g.grid, g.params, { ...p, f: p.dir === 0 ? 0 : f });
      return !!l && g.cellSeg[l.ty * g.grid.w + l.cx] === e.to;
    });
  let u = EDGE_MOVE_SCALE;
  for (let f = EDGE_MOVE_SCALE - 0.04; f >= 0.3 && reaches(f); f -= 0.04) u = f;
  return clamp01(Math.max(u, vertical));
}

const hazardNear = (g: Graph, c: { x: number; y: number }): boolean => {
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) if (isHazardKind(tileAt(g.grid, c.x + dx, c.y + dy))) return true;
  return false;
};

export function difficultyOf(report: ValidationReport, def: LevelDef): Breakdown {
  const g = report.graph;
  if (!report.ok || !g) return { J: 0, H: 0, C: 0, T: 0, Lg: 0, D: 0 };
  // the route to the goal, the followers' route, and the routes the pioneer took to reach what it had to press, hold or pick up
  const edges = new Map<string, { e: Edge; g: Graph }>();
  const add = (gr: Graph, e: Edge) => edges.set(`${e.kind}:${e.takeoffX}:${e.landCell.x},${e.landCell.y}:${e.rise}`, { e, g: gr });
  for (const e of [...report.path, ...report.followPath]) add(g, e);
  for (const x of report.extra) for (const e of x.edges) add(x.graph, e);
  const entries = [...edges.values()];
  const list = entries.map((x) => x.e);
  const uses = entries
    .filter(({ e }) => e.kind === 'jump' || e.kind === 'tower' || e.kind === 'hand')
    .map(({ e, g: gr }) => edgeUsage(gr, e) ** 2)
    .sort((a, b) => b - a)
    .slice(0, 5);
  const J = uses.reduce((s, v) => s + v, 0) / 5;
  const landings = entries.filter(
    ({ e }) => (e.kind === 'jump' && e.plan && e.plan.trigger !== 'walk') || e.kind === 'throw' || e.kind === 'tower',
  );
  const H = clamp01(landings.filter(({ e, g: gr }) => hazardNear(gr, e.landCell)).length / 6);
  const coop = new Set(list.filter((e) => e.coop).map((e) => `${e.from}>${e.to}`)).size;
  const C = clamp01((coop + report.gadgetWeight) / 6);
  const onRoute = new Set<number>([report.startSeg, ...report.path.map((e) => e.to), ...report.followPath.map((e) => e.to)]);
  const timedFloors = [...onRoute].filter((id) => {
    const sg = g.segs[id];
    return sg && surfaceTiming(g.grid, sg.row, sg.x0, sg.x1);
  }).length;
  const timing =
    list.filter((e) => e.timing).length +
    timedFloors +
    report.handoffs +
    (def.hazard && def.hazard.kind !== 'tide' ? 3 : def.hazard ? 1 : 0);
  const T = clamp01(timing / 6);
  const length = report.cols + 2 * Math.max(0, def.rows.length - 18); // a climb of a row costs about two columns of running
  const Lg = clamp01((length - 60) / 140);
  return { J, H, C, T, Lg, D: 100 * (0.35 * J + 0.2 * H + 0.15 * C + 0.15 * T + 0.15 * Lg) };
}

export const BAND = { easy: [10, 35], normal: [35, 60], hard: [60, 85] } as const;
export const bandCenter = (d: keyof typeof BAND): number => (BAND[d][0] + BAND[d][1]) / 2;

// Spearman rank correlation (average ranks for ties).
export function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (v: readonly number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a),
    rb = rank(b),
    n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n,
    mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}
