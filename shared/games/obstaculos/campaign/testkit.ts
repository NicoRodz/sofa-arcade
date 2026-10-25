// Test helper: a catalog of the plan's size (5 worlds x 7 levels, the 7th a boss, plus one summit per world) built on one real LevelDef.
import { LEVELS } from '../levels';
import type { Catalog, CatalogLevel, CatalogWorld } from './progcatalog';

export function planCatalog(): Catalog {
  const worlds: CatalogWorld[] = (['beach', 'forest', 'glacier', 'mine', 'volcano'] as const).map((biome, i) => ({
    id: String(i + 1),
    name: ['Playa', 'Bosque', 'Glaciar', 'Mina', 'Volcán'][i]!,
    biome,
  }));
  const levels: CatalogLevel[] = [];
  for (const w of worlds) {
    for (let o = 1; o <= 7; o++)
      levels.push({
        id: `${w.id}-${o}`,
        world: w.id,
        order: o,
        name: `${w.name} ${o}`,
        kind: o === 7 ? 'boss' : 'level',
        def: LEVELS[0]!,
        mode: 'chain',
        collectibles: 3,
        botMs: 60_000,
        validatedFor: [2],
      });
  }
  for (const w of worlds)
    levels.push({
      id: `C${w.id}`,
      world: w.id,
      order: 0,
      name: `Cumbre ${w.id}`,
      kind: 'summit',
      def: LEVELS[0]!,
      mode: 'chain',
      collectibles: 3,
      botMs: 90_000,
      validatedFor: [2],
    });
  return { worlds, levels, practice: [] };
}
