// Suggested stations ("puestos"): who starts where. Nothing here is enforced: any chef can use any station.
// Spawn i gets puesto i (design 15-mapas §1.2): the map author orders the S tiles so spawn i sits next to the stations of puesto i.
import { mechFlagsOf } from './mech/ids';
import type { IconId, PuestoMsg } from '@pichi/core';
import type { Slots } from '@pichi/core/contract';
import { teamSize } from '@pichi/core';
import { DIRS, floorComponents, isFloor, parseMap, spawnPoints, type Grid, type MapDef, type Pos } from './maps';

const accessTiles = (g: Grid, x: number, y: number): Pos[] =>
  DIRS.map(([dx, dy]): Pos => [x + dx, y + dy]).filter(([ax, ay]) => isFloor(g, ax, ay));

/** The stations message with Pizzas' own puesto ids (the wire types them as opaque strings). */
export type PuestoMsgPz = PuestoMsg<Slots & { puesto: PuestoId }>;
export const PUESTO_IDS = ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo', 'prep', 'platos', 'entrega'] as const;
export type PuestoId = (typeof PUESTO_IDS)[number];
export const isPuestoId = (v: unknown): v is PuestoId => PUESTO_IDS.includes(v as PuestoId);

export interface Features {
  cheese: boolean;
  sink: boolean;
}
interface Pick {
  kind: string;
  crate?: number;
}
export interface PuestoDef {
  id: PuestoId;
  name: string;
  icon: IconId;
  hint: (f: Features) => string;
  picks: readonly Pick[];
}

export const PUESTOS: Record<PuestoId, PuestoDef> = {
  masa: {
    id: 'masa',
    name: 'Masa',
    icon: 'dough',
    hint: () => 'Masa → tabla → horno',
    picks: [{ kind: 'crate', crate: 0 }, { kind: 'board' }],
  },
  corte: {
    id: 'corte',
    name: 'Corte',
    icon: 'chop',
    hint: (f) => (f.cheese ? 'Tomate y queso → tabla → horno' : 'Tomate → tabla → horno'),
    picks: [{ kind: 'crate', crate: 1 }, { kind: 'crate', crate: 2 }, { kind: 'board' }],
  },
  queso: {
    id: 'queso',
    name: 'Queso',
    icon: 'cheese',
    hint: () => 'Queso → tabla (rallar) → horno',
    picks: [{ kind: 'crate', crate: 2 }, { kind: 'board' }],
  },
  horno: { id: 'horno', name: 'Horno', icon: 'oven', hint: () => 'Carga el horno y saca la pizza con un plato', picks: [{ kind: 'pot' }] },
  reparto: {
    id: 'reparto',
    name: 'Reparto',
    icon: 'bell',
    hint: () => 'Plato → pizza → entrega',
    picks: [{ kind: 'plates' }, { kind: 'window' }],
  },
  lavado: {
    id: 'lavado',
    name: 'Lavado',
    icon: 'wash',
    hint: () => 'Sucios → lavaplatos → plato limpio',
    picks: [{ kind: 'dirty' }, { kind: 'sink' }],
  },
  platos: { id: 'platos', name: 'Platos', icon: 'plate', hint: () => 'Plato → horno → pásalo', picks: [{ kind: 'plates' }] },
  entrega: { id: 'entrega', name: 'Entrega', icon: 'bell', hint: () => 'Recibe la pizza y entrégala', picks: [{ kind: 'window' }] },
  apoyo: { id: 'apoyo', name: 'Apoyo', icon: 'star', hint: () => 'Ayuda donde haga falta', picks: [] },
  prep: {
    id: 'prep',
    name: 'Preparación',
    icon: 'crate',
    hint: (f) => (f.cheese ? 'Masa, tomate y queso → tabla → pasa al horno' : 'Masa y tomate → tabla → pasa al horno'),
    picks: [{ kind: 'crate', crate: 0 }, { kind: 'crate', crate: 1 }, { kind: 'crate', crate: 2 }, { kind: 'board' }],
  },
};

// Default table by spawn index; with a small team the first chefs take two puestos so the whole recipe is covered.
export function puestosFor(n: number, f: Features, override?: readonly (readonly PuestoId[])[]): PuestoId[][] {
  const t = teamSize(n);
  if (override) return Array.from({ length: t }, (_v, i) => [...(override[i] ?? override[override.length - 1] ?? ['apoyo'])]);
  const base: PuestoId[] = [
    'masa',
    'corte',
    'horno',
    'reparto',
    f.sink ? 'lavado' : 'apoyo',
    f.cheese ? 'queso' : 'corte',
    'horno',
    'reparto',
  ];
  const out: PuestoId[][] = base.slice(0, t).map((p) => [p]);
  if (t === 2) {
    out[0] = ['masa', 'horno'];
    out[1] = ['corte', 'reparto'];
  } else if (t === 3) out[2] = ['horno', 'reparto'];
  else if (t === 4 && f.sink) out[3] = ['reparto', 'lavado'];
  return out;
}

export const featuresOf = (stations: readonly { kind: string; crate: number }[]): Features => ({
  cheese: stations.some((s) => s.kind === 'crate' && s.crate === 2),
  sink: stations.some((s) => s.kind === 'sink'),
});

// Round assignment: chef i (in spawn order) gets puesto i. `pool` is what "Cambiar" cycles through.
export function assignPuestos(ids: readonly number[], f: Features, override?: readonly (readonly PuestoId[])[]): PuestoMsgPz {
  const table = puestosFor(ids.length, f, override);
  const pool = [...new Set(puestosFor(8, f, override).flat())];
  return { cheese: f.cheese, sink: f.sink, assign: ids.map((id, i) => ({ id, puestos: table[i] ?? ['apoyo'], pool })) };
}

// Stations to light up for a chef standing at `spawn`: for each station of the puesto, the instance of that kind nearest to
// the spawn, preferring those on the chef's own floor region. Indices into game.stations.
export function puestoStations(
  g: Grid,
  stations: readonly { kind: string; crate: number; tx: number; ty: number }[],
  ids: readonly PuestoId[],
  spawn: Pos,
): number[] {
  const { comp } = floorComponents(g);
  const home = comp[spawn[1]]?.[spawn[0]] ?? -1;
  const reach = (s: { tx: number; ty: number }) => accessTiles(g, s.tx, s.ty).some(([ax, ay]) => comp[ay]![ax] === home);
  const out = new Set<number>();
  for (const id of ids)
    for (const pick of PUESTOS[id].picks) {
      const cand = stations
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.kind === pick.kind && (pick.crate === undefined || s.crate === pick.crate));
      if (!cand.length) continue;
      const mine = cand.filter(({ s }) => reach(s));
      const pool = mine.length ? mine : cand;
      const d = ({ s }: { s: { tx: number; ty: number } }) => Math.hypot(s.tx + 0.5 - spawn[0] - 0.5, s.ty + 0.5 - spawn[1] - 0.5);
      out.add(pool.sort((a, b) => d(a) - d(b))[0]!.i);
    }
  return [...out];
}

// Spawn order a map really uses: explicit, or what spawnPoints gives.
export const mapSpawns = (m: MapDef, g: Grid = parseMap(m.rows, false, mechFlagsOf(m.mechanics))): Pos[] => spawnPoints(g, 8, m.spawns);

// Every chef must be able to reach the stations of their puesto, for every team size the map recommends.
export function puestoProblems(m: MapDef, versus = false): string[] {
  const g = parseMap(m.rows, versus, versus ? undefined : mechFlagsOf(m.mechanics));
  const f = { cheese: m.rows.some((r) => r.includes('3')), sink: m.rows.some((r) => r.includes('L')) };
  const { comp } = floorComponents(g);
  const spawns = mapSpawns(m, g);
  const stations: { kind: string; crate: number; tx: number; ty: number }[] = [];
  g.forEach((row, ty) =>
    row.forEach((t, tx) => {
      if (t.kind === 'station') stations.push({ kind: t.station, crate: t.crate, tx, ty });
    }),
  );
  const out: string[] = [];
  for (let n = m.nMin; n <= m.nMax; n++) {
    puestosFor(n, f, m.puestos).forEach((ids, i) => {
      const sp = spawns[i];
      if (!sp) {
        out.push(`N=${n}: no spawn ${i + 1}`);
        return;
      }
      const home = comp[sp[1]]![sp[0]]!;
      for (const id of ids)
        for (const pick of PUESTOS[id].picks) {
          const all = stations.filter((s) => s.kind === pick.kind && (pick.crate === undefined || s.crate === pick.crate));
          if (!all.length) continue; // that station does not exist on this map (no cheese, no sink)
          if (!all.some((s) => accessTiles(g, s.tx, s.ty).some(([ax, ay]) => comp[ay]![ax] === home)))
            out.push(`N=${n} spawn ${i + 1} (${id}): no ${pick.kind}${pick.crate === undefined ? '' : pick.crate} reachable`);
        }
    });
  }
  return out;
}
