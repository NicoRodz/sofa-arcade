// Registry of the games a surface (the screen, the controller, the server) knows: by id, in declaration order, no duplicates.
// Generic over what each surface registers: the screen registers `ScreenGame`s, tests register bare manifests. EXPERIMENTAL (F4a).
import type { GameManifest } from './contract/game';

export interface HasManifest {
  manifest: GameManifest;
}
export interface Registry<G extends HasManifest> {
  list(): readonly G[];
  ids(): readonly string[];
  get(id: string): G | undefined;
  require(id: string): G;
}

export function createRegistry<G extends HasManifest>(games: readonly G[]): Registry<G> {
  const byId = new Map<string, G>();
  for (const g of games) {
    if (byId.has(g.manifest.id)) throw new Error(`registry: duplicated game id ${g.manifest.id}`);
    byId.set(g.manifest.id, g);
  }
  const list = [...games];
  return {
    list: () => list,
    ids: () => list.map((g) => g.manifest.id),
    get: (id) => byId.get(id),
    require: (id) => {
      const g = byId.get(id);
      if (!g) throw new Error(`registry: unknown game id ${id}`);
      return g;
    },
  };
}
