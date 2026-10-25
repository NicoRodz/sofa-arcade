import type { Layout, Mech, Zone } from './layout';
import { pick, type Rng } from '@pichi/core/rng';
import { parseMap, posKey, type Pos } from '../maps';
import { teamSize } from '@pichi/core/difficulty';
import { PUESTOS, puestosFor, type PuestoId } from '../puestos';

// Spawns: floor tiles that are nobody's access tile, 2+ apart, alternating zones when the map has them. One per chef of nMax.
export function placeSpawns(l: Layout, nMax: number, claimed: Set<string>, rng: Rng): boolean {
  const { cells, zoneAt, blockX } = l;
  const chosen: Pos[] = [];
  for (let i = 0; i < teamSize(nMax); i++) {
    const want: Zone | null = zoneAt ? (i % 2 ? 'B' : 'A') : null;
    const cand: Pos[] = [];
    cells.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== '.' || claimed.has(posKey(x, y))) return;
        if (blockX && x >= blockX[0] && x < blockX[1]) return;
        if (want && zoneAt!(x) !== want) return;
        if (chosen.every(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) >= 2)) cand.push([x, y]);
      }),
    );
    if (!cand.length) return false;
    const [x, y] = pick(rng, cand);
    cells[y]![x] = 'S';
    chosen.push([x, y]);
  }
  return true;
}

// Orders the spawns like the puesto table: spawn i goes next to the stations of puesto i (greedy, first puesto first).
// Zone maps keep their alternating order (their puestos are assigned by zone instead, see zonePuestos).
export function orderSpawns(rows: readonly string[], spawns: readonly Pos[], nMax: number, mech: Mech): Pos[] {
  const g = parseMap(rows);
  const stations: { kind: string; crate: number; x: number; y: number }[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'station') stations.push({ kind: t.station, crate: t.crate, x, y });
    }),
  );
  const left = [...spawns];
  const out: Pos[] = [];
  for (const ids of puestosFor(nMax, mech)) {
    if (!left.length) break;
    const cost = (sp: Pos) =>
      ids.reduce(
        (sum, id) =>
          sum +
          PUESTOS[id].picks.reduce((s2, pick2) => {
            const d = stations
              .filter((s) => s.kind === pick2.kind && (pick2.crate === undefined || s.crate === pick2.crate))
              .map((s) => Math.abs(s.x - sp[0]) + Math.abs(s.y - sp[1]));
            return s2 + (d.length ? Math.min(...d) : 0);
          }, 0),
        0,
      );
    let best = 0;
    left.forEach((sp, i) => {
      if (cost(sp) < cost(left[best]!)) best = i;
    });
    out.push(left.splice(best, 1)[0]!);
  }
  return [...out, ...left];
}

// Puestos of a two-zone map by zone (A: boards and crates; B: ovens and plates; E on A for hard): the default table would
// ask a chef for stations on the other bank.
export function zonePuestos(spawns: readonly Pos[], zoneAt: (x: number) => Zone, serveInA: boolean, mech: Mech): PuestoId[][] {
  const zones = spawns.map(([x]) => zoneAt(x));
  const lastOf = (z: Zone) => zones.lastIndexOf(z);
  return spawns.map((_sp, i) => {
    const z = zones[i]!;
    const alone = zones.filter((v) => v === z).length === 1;
    if (z === 'A') return serveInA && i === lastOf('A') ? (alone ? ['prep', 'entrega'] : ['entrega']) : ['prep'];
    const base: PuestoId[] = serveInA ? ['horno', 'platos'] : ['horno', 'reparto'];
    if (mech.sink && i === lastOf('B')) return alone ? [...base, 'lavado'] : ['lavado'];
    return base;
  });
}
