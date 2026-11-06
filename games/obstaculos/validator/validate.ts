// Reachability validator (plan §12). Two phases over the same physics:
//  1. PIONEER: the first explorer reaches the goal with everything the team can do (jumps from stepPlayer, towers of k, throws,
//     rope swings, ladders, movers, plates/levers/keys opened as a closure until nothing new opens).
//  2. FOLLOWERS: everybody else reaches the goal from the spawn with the final state, helped by the planted partner's hand
//     (a catch zone under every ledge the pioneer reached). Towers and throws are one-way trips, so they are not available here.
// Plates: OR semantics (any activator held opens its objective). A held (non-latching) activator costs its weight in holders,
// who can only follow if a second activator of the same objective sits on the far side (handoff) - or if it latches.
import { MAX_PLAYERS_OBST, MIN_PLAYERS } from '../constants';
import { MARKER_CHARS } from '../legend';
import { parseLevel } from '../parse';
import type { Difficulty } from '@pichi/core';
import type { Cell, GameMode, LevelDef, Weight } from '../types';
import type { ModeledMechanic } from '../mechanics';
import { lint } from './lint';
import { activatorsOf, goalTest, startSegOf, touches } from './segments';
import { hazardCheck, mechanicOf, pathSeconds, usesOf, type Uses } from './path-checks';
import {
  buildGraph,
  can,
  doorGroupsOf,
  newSimCache,
  pathTo,
  ringsOf,
  shortest,
  type Edge,
  type Env,
  type Graph,
  type OpenState,
} from './graph';

export const resolveWeight = (w: Weight, n: number): number =>
  typeof w === 'number'
    ? w
    : w === 'half-up'
      ? Math.ceil(n / 2)
      : w === 'half-down'
        ? Math.floor(n / 2)
        : w === 'all'
          ? n
          : Math.max(1, n - 1);

export const modesOf = (def: LevelDef): GameMode[] =>
  def.tether === 'chainOnly' ? ['chain'] : def.tether === 'freeOnly' ? ['free'] : ['chain', 'free'];

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  env: Env;
  startSeg: number; // segment of the spawn in the final graph
  path: Edge[]; // pioneer critical path (spawn -> goal)
  followPath: Edge[]; // followers' path (spawn -> goal)
  opened: string[]; // objectives the closure opened
  gadgetCount: number; // plates/levers/keys/rings that were needed or used
  gadgetWeight: number; // latch plate / door / ring = 1, a held plate or lever (needs a handoff between two groups) = 2
  handoffs: number; // held activators (they need two groups coordinating)
  pathSeconds: number; // estimate
  cols: number;
  graph?: Graph; // final follower graph (the metric re-simulates its jumps)
  extra: { graph: Graph; edges: Edge[] }[]; // routes the pioneer took to reach the plates, levers, keys and rings it needed
  stars: { found: number; total: number };
  checkpoints: { found: number; total: number }; // P markers a follower can stand at (every checkpoint must be reachable)
  uses: Uses; // what the route (pioneer, followers, and the gadgets the pioneer had to reach) actually did, by mechanic: the learning test's record
}
export type { Uses };
export { lint, mechanicOf, startSegOf, touches };

const failed = (env: Env, errors: string[]): ValidationReport => ({
  ok: false,
  errors,
  env,
  startSeg: -1,
  path: [],
  followPath: [],
  opened: [],
  gadgetCount: 0,
  gadgetWeight: 0,
  handoffs: 0,
  extra: [],
  pathSeconds: 0,
  cols: 0,
  stars: { found: 0, total: 0 },
  checkpoints: { found: 0, total: 0 },
  uses: {},
});

export function validateState(def: LevelDef, env: Env): ValidationReport {
  const p = parseLevel(def);
  const errs = lint(p);
  if (errs.length) return failed(env, errs);
  const doors = doorGroupsOf(p);
  const acts = activatorsOf(p);
  const S: OpenState = { open: new Set(), doors: new Set() };
  const rings = new Set<number>();
  const cache = newSimCache();
  const edgeOk = (e: Edge) => e.kind !== 'swing' || rings.has(e.ring!);
  const solveFrom = (g: Graph) => shortest(g, startSegOf(p, g), () => false, edgeOk);
  const extra: { graph: Graph; edges: Edge[] }[] = [];
  const routeTo = (g: Graph, sr: ReturnType<typeof shortest>, cells: Cell[], up: number) => {
    let best = -1;
    for (const id of sr.reached)
      if (cells.some((c) => touches(g.segs[id]!, c, up)) && (best < 0 || sr.dist[id]! < sr.dist[best]!)) best = id;
    if (best >= 0) extra.push({ graph: g, edges: pathTo(sr.prev, best) });
  };
  const gadgetsUsed: string[] = [];
  const gadgetUses: Uses = {};
  const bump = (m: ModeledMechanic) => {
    gadgetUses[m] = (gadgetUses[m] ?? 0) + 1;
  };
  let gadgetWeight = 0,
    handoffs = 0;
  let g = buildGraph(p, env, S, doors, { pioneer: true, cache });
  let startSeg = startSegOf(p, g);
  if (startSeg < 0) return failed(env, ['spawn is not above a floor']);
  let sr = solveFrom(g);
  let reached = sr.reached;

  for (let iter = 0; iter < 40; iter++) {
    let changed = false;
    ringsOf(p).forEach((r, i) => {
      if (!rings.has(i) && can(env, 'swing') && [...reached].some((id) => touches(g.segs[id]!, r, 2))) {
        rings.add(i);
        routeTo(g, sr, [r], 2);
        changed = true;
        gadgetsUsed.push(`ring${i}`);
        gadgetWeight += 1;
      }
    });
    const keysHeld = !can(env, 'key') ? 0 : p.markers.key.filter((k) => [...reached].some((id) => touches(g.segs[id]!, k, 3))).length;
    doors.forEach((grp, i) => {
      if (S.doors.has(i) || keysHeld <= S.doors.size) return;
      if (
        grp.some((c) =>
          [...reached].some((id) => {
            const s = g.segs[id]!;
            return Math.abs(s.row - c.y) <= 1 && c.x >= s.x0 - 1 && c.x <= s.x1 + 1;
          }),
        )
      ) {
        S.doors.add(i);
        routeTo(g, sr, p.markers.key, 3);
        changed = true;
        gadgetsUsed.push(`door${i}`);
        gadgetWeight += 1;
        bump('key');
      }
    });
    if (!S.pick && can(env, 'pickaxe') && p.markers.pickaxe.some((k) => [...reached].some((id) => touches(g.segs[id]!, k, 3)))) {
      // the pickaxe: reachable = ice walls can be climbed
      S.pick = true;
      routeTo(g, sr, p.markers.pickaxe, 3);
      changed = true;
      gadgetsUsed.push('pickaxe');
      gadgetWeight += 1;
    }
    for (const X of acts) {
      const q = X.param as Extract<NonNullable<typeof X.param>, { kind: 'plate' | 'lever' | 'target' }>;
      if (S.open.has(q.opens) || !can(env, q.kind)) continue;
      if (q.kind === 'target') {
        // hit in flight: any segment from which a jump passes through it; the gate then needs the run to fit in targetSec (lint)
        if (!X.cells.some((c) => [...reached].some((id) => touches(g.segs[id]!, c, 3)))) continue;
        S.open.add(q.opens);
        routeTo(g, sr, X.cells, 3);
        changed = true;
        gadgetsUsed.push(X.char);
        gadgetWeight += 1;
        bump('target');
        continue;
      }
      if (!X.cells.some((c) => [...reached].some((id) => touches(g.segs[id]!, c, 1)))) continue;
      const w = q.kind === 'plate' ? resolveWeight(q.weight, env.n) : 1;
      if (w > env.n) continue;
      if (q.latch) {
        S.open.add(q.opens);
        routeTo(g, sr, X.cells, 1);
        changed = true;
        gadgetsUsed.push(X.char);
        gadgetWeight += 1;
        bump(q.kind);
        continue;
      }
      if (w > env.n - 1) continue; // somebody has to be free to pass
      // handoff: with the objective open, a second activator on the far side takes over the hold
      const S2: OpenState = { open: new Set([...S.open, q.opens]), doors: S.doors, pick: S.pick };
      const g2 = buildGraph(p, env, S2, doors, { pioneer: true, cache });
      const sr2 = shortest(g2, startSeg, () => false, edgeOk);
      const reached2 = sr2.reached;
      const near = new Set([...reached].map((id) => `${g.segs[id]!.row}:${g.segs[id]!.x0}:${g.segs[id]!.x1}`));
      const far2 = [...reached2].filter((id) => !near.has(`${g2.segs[id]!.row}:${g2.segs[id]!.x0}:${g2.segs[id]!.x1}`));
      const ok = acts.some((Y) => {
        if (Y === X) return false;
        const qy = Y.param as typeof q;
        if (qy.opens !== q.opens) return false;
        const wy = qy.kind === 'plate' ? resolveWeight(qy.weight, env.n) : 1;
        return wy <= env.n - w && Y.cells.some((c) => far2.some((id) => touches(g2.segs[id]!, c, 1)));
      });
      if (ok) {
        S.open.add(q.opens);
        routeTo(g, sr, X.cells, 1);
        for (const Y of acts) if (Y !== X && (Y.param as typeof q).opens === q.opens) routeTo(g2, sr2, Y.cells, 1);
        changed = true;
        gadgetsUsed.push(`${X.char}~`);
        gadgetWeight += 2;
        handoffs++;
        bump(q.kind);
      }
    }
    if (!changed) break;
    g = buildGraph(p, env, S, doors, { pioneer: true, cache });
    startSeg = startSegOf(p, g);
    sr = solveFrom(g);
    reached = sr.reached;
  }

  const isGoal = goalTest(p, g);
  const pr = shortest(g, startSeg, isGoal, edgeOk);
  if (pr.hit < 0)
    return {
      ...failed(env, [
        `pioneer cannot reach G (reached ${reached.size} of ${g.segs.length} segments; opened ${[...S.open].join('') || 'nothing'})`,
      ]),
      opened: [...S.open],
    };
  const path = pathTo(pr.prev, pr.hit);

  // followers: first with plain moves only; the planted partner's hand (a second batch of simulations) only when that is not enough
  let g2 = buildGraph(p, env, S, doors, { pioneer: false, cache });
  let fr = shortest(g2, startSegOf(p, g2), goalTest(p, g2), edgeOk);
  if (fr.hit < 0 && can(env, 'hand')) {
    g2 = buildGraph(p, env, S, doors, { pioneer: false, catchTargets: reached, cache });
    fr = shortest(g2, startSegOf(p, g2), goalTest(p, g2), edgeOk);
  }
  if (fr.hit < 0)
    return {
      ...failed(env, ['followers cannot reach G (the pioneer got there but the rest cannot follow: no hand, ladder or plain route)']),
      opened: [...S.open],
      path,
    };
  const followPath = pathTo(fr.prev, fr.hit);

  const errors: string[] = [];
  const seconds = pathSeconds(p, path, S.open.size + S.doors.size + rings.size);
  hazardCheck(p, g, path, seconds, errors);
  const uses = usesOf(p, g, g2, path, followPath, extra, gadgetUses);
  const cpFound = p.markers.checkpoint.filter((c) => [...fr.reached].some((id) => touches(g2.segs[id]!, c, 1))).length;
  const starsFound = p.markers.star.filter((c) => [...fr.reached].some((id) => touches(g2.segs[id]!, c, 3))).length;
  return {
    ok: errors.length === 0,
    errors,
    env,
    startSeg: startSegOf(p, g2),
    path,
    followPath,
    opened: [...S.open],
    gadgetCount: gadgetsUsed.length,
    gadgetWeight,
    handoffs,
    pathSeconds: seconds.total,
    cols: p.w,
    graph: g2,
    extra,
    stars: { found: starsFound, total: p.markers.star.length },
    checkpoints: { found: cpFound, total: p.markers.checkpoint.length },
    uses,
  };
}

export interface LevelVerdict {
  ok: boolean;
  reports: ValidationReport[];
  errors: string[];
}
// A level is valid when it is solvable in every mode its tether allows, with the fewest, a middle and the most players.
export function validateLevel(def: LevelDef, diff: Difficulty = 'hard', counts?: number[]): LevelVerdict {
  const { min, max } = def.players;
  const ns = counts ?? [...new Set([min, Math.round((min + max) / 2), max])];
  const reports: ValidationReport[] = [];
  const errors: string[] = [];
  for (const mode of modesOf(def))
    for (const n of ns) {
      const r = validateState(def, { n, mode, diff });
      reports.push(r);
      if (!r.ok) errors.push(`${def.id} ${mode} n=${n}: ${r.errors.join('; ')}`);
    }
  return { ok: errors.length === 0, reports, errors };
}
export { MARKER_CHARS, MAX_PLAYERS_OBST, MIN_PLAYERS };
