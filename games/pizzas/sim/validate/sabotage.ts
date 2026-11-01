import { DIRS, MAP_H, MAP_W, floorComponents, isFloor, type Grid, type Pos } from '../maps';
import type { VersusLayout } from './versus-layout';
import { accessTiles } from './stations';
import { MIN_LANDING_TILES } from '../rules/sabotage-config';

// Sabotage (plan versus-sabotaje-basura section 7): a map with catapults ('Y') needs one per kitchen, twins, next to the barrier and reachable from a
// spawn; every place a bag can land (floor that is not a spawn) must be reachable from that kitchen's bin, there must be MIN_LANDING_TILES of them, and
// none may be a dead end (fewer than two walkable neighbours: a chef that slid there could not get out). A map with no catapult has no sabotage: fine.
export const CATAPULT_NEAR = 5; // Manhattan tiles from the catapult to the nearest floor of the rival kitchen ("next to the barrier")
export function sabotageProblems(
  g: Grid,
  lay: VersusLayout,
  sigma: (x: number, y: number, w: number, h: number) => Pos,
  spawns: readonly (readonly Pos[])[],
): string[] {
  const ys: Pos[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'station' && t.station === 'catapult') ys.push([x, y]);
    }),
  );
  if (!ys.length) return [];
  const errors: string[] = [];
  const { comp } = floorComponents(g);
  const mine = (side: 0 | 1) => ys.filter(([x, y]) => lay.owner[y]![x] === side);
  const per = [mine(0), mine(1)];
  if (per[0]!.length !== 1 || per[1]!.length !== 1) {
    errors.push(`sabotage: each kitchen needs exactly one catapult, found ${per[0]!.length} and ${per[1]!.length}`);
    return errors;
  }
  const [ay, by] = [per[0]![0]!, per[1]![0]!];
  const tw = sigma(ay[0], ay[1], MAP_W, MAP_H);
  if (tw[0] !== by[0] || tw[1] !== by[1]) errors.push(`sabotage: the catapults (${ay.join(', ')}) and (${by.join(', ')}) are not twins`);
  ([0, 1] as const).forEach((side) => {
    const name = side ? 'B' : 'A';
    const [cx, cy] = per[side]![0]!;
    const access = accessTiles(g, cx, cy);
    const spawnComps = new Set(spawns[side]!.map(([x, y]) => comp[y]![x]!));
    if (!access.some(([x, y]) => spawnComps.has(comp[y]![x]!)))
      errors.push(`sabotage: kitchen ${name}: the catapult at (${cx}, ${cy}) cannot be reached from a spawn`);
    const rival: Pos[] = [];
    g.forEach((row, y) =>
      row.forEach((_t, x) => {
        if (isFloor(g, x, y) && lay.owner[y]![x] === 1 - side) rival.push([x, y]);
      }),
    );
    const near = rival.reduce((m, [x, y]) => Math.min(m, Math.abs(x - cx) + Math.abs(y - cy)), Infinity);
    if (near > CATAPULT_NEAR)
      errors.push(
        `sabotage: kitchen ${name}: the catapult is ${near} tiles from the rival kitchen (it must be next to the barrier: ${CATAPULT_NEAR} at most)`,
      );
    const landing: Pos[] = [];
    g.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t.kind === 'floor' && !t.spawn && lay.owner[y]![x] === side) landing.push([x, y]);
      }),
    );
    if (landing.length < MIN_LANDING_TILES)
      errors.push(`sabotage: kitchen ${name} has ${landing.length} landing tiles (want ${MIN_LANDING_TILES})`);
    const binComps = new Set<number>();
    g.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t.kind === 'station' && t.station === 'trash' && lay.owner[y]![x] === side)
          for (const [ax, ay2] of accessTiles(g, x, y)) binComps.add(comp[ay2]![ax]!);
      }),
    );
    if (!binComps.size) errors.push(`sabotage: kitchen ${name} has no bin to clean the rubbish into`);
    for (const [x, y] of landing) {
      if (binComps.size && !binComps.has(comp[y]![x]!))
        errors.push(`sabotage: kitchen ${name}: rubbish at (${x}, ${y}) could not be carried to the bin`);
      const open = DIRS.filter(([dx, dy]) => isFloor(g, x + dx, y + dy)).length;
      if (open < 2) errors.push(`sabotage: kitchen ${name}: landing tile (${x}, ${y}) is a dead end (${open} walkable neighbour)`);
    }
  });
  return errors;
}
