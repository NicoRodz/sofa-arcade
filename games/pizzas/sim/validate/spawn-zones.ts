// Spawns against the floor regions (design pizzas-mapas-platos-diseno §C, validator point 3): for every team size the map recommends, the chefs that start must
// stand, between them, next to every recipe station. Items cross a wall through a counter or a hatch, chefs do not: a map like Pasaplatos (a wall with no door)
// is impossible if the first N spawns all land on one side. `puestoProblems` checks the suggested puestos; this checks the stations themselves, whatever the puestos say.
import { mechFlagsOf } from '../mech/ids';
import { floorComponents, parseMap, spawnPoints, type MapDef } from '../maps';
import { accessTiles, keysOf, stationsOf } from './stations';

export function spawnZoneProblems(m: MapDef): string[] {
  const g = parseMap(m.rows, false, mechFlagsOf(m.mechanics));
  const { comp } = floorComponents(g);
  const errors: string[] = [];
  for (let n = m.nMin; n <= m.nMax; n++) {
    const manned = new Set(spawnPoints(g, n, m.spawns).map(([x, y]) => comp[y]![x]!));
    for (const key of keysOf(g)) {
      const reachable = stationsOf(g, key).some(([x, y]) => accessTiles(g, x, y).some(([ax, ay]) => manned.has(comp[ay]![ax]!)));
      if (!reachable) errors.push(`N=${n}: no chef starts where station ${key} can be reached`);
    }
  }
  return errors;
}
