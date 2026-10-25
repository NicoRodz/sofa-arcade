// Dijkstra over the reachability graph and path recovery.
import type { Edge, Graph } from './types';

// Dijkstra over segments: time in seconds, cooperative edges cost 6 s extra so the plain route wins when there is one.
export function shortest(
  g: Graph,
  start: number,
  goal: number | ((id: number) => boolean),
  edgeOk?: (e: Edge) => boolean,
): { dist: Float64Array; prev: (Edge | null)[]; reached: Set<number>; hit: number } {
  const n = g.segs.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev: (Edge | null)[] = new Array(n).fill(null);
  const done = new Uint8Array(n);
  const isGoal = typeof goal === 'function' ? goal : (id: number) => id === goal;
  dist[start] = 0;
  let hit = -1;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) break;
    done[u] = 1;
    if (hit < 0 && isGoal(u)) hit = u;
    for (const e of g.adj[u]!) {
      if (edgeOk && !edgeOk(e)) continue;
      const w = e.steps / 60 + (e.coop ? 6 : 0);
      if (dist[u]! + w < dist[e.to]!) {
        dist[e.to] = dist[u]! + w;
        prev[e.to] = e;
      }
    }
  }
  const reached = new Set<number>();
  for (let i = 0; i < n; i++) if (dist[i]! < Infinity) reached.add(i);
  return { dist, prev, reached, hit };
}

export const pathTo = (prev: (Edge | null)[], id: number): Edge[] => {
  const out: Edge[] = [];
  for (let e = prev[id]; e; e = prev[e.from]!) out.unshift(e);
  return out;
};
