// The catalog of the campaign: which levels exist, how they group into worlds, and what the progress rules need to know about each one.
// S2 produces the real one (40 levels + the practice room); until it lands, LEGACY_CATALOG feeds the same interface with the 15 existing levels.
// Everything here is plain data + pure lookups, so the server, the screen and the tests read the same thing.
import { levelCompat } from '../lobby';
import { LEVELS } from '../levels';
import type { Biome, GameMode, LevelDef } from '../types';

export type LevelKind = 'level' | 'boss' | 'summit' | 'practice';

export interface CatalogWorld {
  id: string; // '1'..'5'
  name: string; // 'Playa'
  biome: Biome;
}

export interface CatalogLevel {
  id: string; // '1-3' (world 1, third level), 'C1' for a summit, 'P-ancla' for a practice station. Unique across the catalog; it is the key of the saved progress.
  world: string; // CatalogWorld.id. A summit belongs to the world whose stars open it.
  order: number; // 1-based position inside its world (summits and practice stations: 0)
  name: string;
  kind: LevelKind; // 'boss' closes a world: beating it opens the next world
  def: LevelDef; // the frozen tilemap
  mode: GameMode; // chained or free: the campaign decides it per level (plan §2 "Modo")
  collectibles: number; // how many collectibles the level has: all of them = star 2
  botMs: number | null; // the validator bot's time: the clock medal is timeMs <= botMs * TIME_MEDAL_FACTOR (null: no medal)
  validatedFor: readonly number[]; // player counts the CI validated this level for (plan §7 "lobby ofrece solo los validados")
}

export interface Catalog {
  readonly worlds: readonly CatalogWorld[]; // in unlock order
  readonly levels: readonly CatalogLevel[]; // regular levels and bosses in campaign order, then summits; practice stations are kept apart
  readonly practice: readonly CatalogLevel[]; // the practice room, one station per action (empty until A3)
}

export const TIME_MEDAL_FACTOR = 1.6; // plan §3: the clock medal needs the bot's time x 1.6
export const SUMMIT_STARS_NUM = 15; // plan §3: a summit opens with 15 of the 21 stars of its world...
export const SUMMIT_STARS_DEN = 21; // ...so the share of the world's stars is 15/21, whatever the number of levels
export const SKIP_AFTER_FAILURES = 5; // plan §2: after 5 game overs in a row on a level the group is offered to skip it

// ---- lookups
export const levelById = (c: Catalog, id: string): CatalogLevel | undefined => c.levels.find((l) => l.id === id) ?? c.practice.find((l) => l.id === id);
export const worldById = (c: Catalog, id: string): CatalogWorld | undefined => c.worlds.find((w) => w.id === id);
export const worldIndex = (c: Catalog, id: string): number => c.worlds.findIndex((w) => w.id === id);
// The regular levels (bosses included) of a world in play order: the path of the map.
export const pathOf = (c: Catalog, worldId: string): CatalogLevel[] => c.levels.filter((l) => l.world === worldId && l.kind !== 'summit').sort((a, b) => a.order - b.order);
export const summitOf = (c: Catalog, worldId: string): CatalogLevel | undefined => c.levels.find((l) => l.world === worldId && l.kind === 'summit');
export const bossOf = (c: Catalog, worldId: string): CatalogLevel | undefined => pathOf(c, worldId).find((l) => l.kind === 'boss');
// The regular levels of the whole campaign in play order (no summits).
export const campaignOrder = (c: Catalog): CatalogLevel[] => c.worlds.flatMap((w) => pathOf(c, w.id));
export const playableWith = (l: CatalogLevel, n: number): boolean => l.validatedFor.includes(n);
export const maxStarsOf = (c: Catalog, worldId: string): number => pathOf(c, worldId).length * 3;

// ---- the 15 existing levels as a catalog (S2's 40-level catalog replaces it behind the same interface)
// Decisions: the worlds follow the plan's order (Playa, Bosque, Glaciar, Mina, Volcan); only the levels that can be played by 2 enter (11 of the 15:
// the rest ask for 3-4 players), the last of each world is its boss, the first of each world is Libres (plan: 1-1 is "L") and the rest are Encadenados
// unless the level itself allows only one of the two; the bot time is the level's par (the existing levels carry no validator time).
const LEGACY_WORLDS: readonly CatalogWorld[] = [
  { id: '1', name: 'Playa', biome: 'beach' },
  { id: '2', name: 'Bosque', biome: 'forest' },
  { id: '3', name: 'Glaciar', biome: 'glacier' },
  { id: '4', name: 'Mina', biome: 'mine' },
  { id: '5', name: 'Volcán', biome: 'volcano' },
];

export function legacyCatalog(defs: readonly LevelDef[] = LEVELS): Catalog {
  const levels: CatalogLevel[] = [];
  for (const w of LEGACY_WORLDS) {
    const own = defs.filter((d) => d.biome === w.biome && d.players.min <= 2);
    own.forEach((def, i) => {
      const mode: GameMode = def.tether === 'chainOnly' ? 'chain' : def.tether === 'freeOnly' ? 'free' : i === 0 ? 'free' : 'chain';
      levels.push({
        id: `${w.id}-${i + 1}`, world: w.id, order: i + 1, name: def.name, kind: i === own.length - 1 ? 'boss' : 'level', def, mode,
        collectibles: def.stars, botMs: def.parSec * 1000,
        validatedFor: [2, 3, 4, 5, 6, 7, 8].filter((n) => levelCompat(def, n, mode).ok),
      });
    });
  }
  return { worlds: LEGACY_WORLDS.filter((w) => levels.some((l) => l.world === w.id)), levels, practice: [] };
}
export const LEGACY_CATALOG: Catalog = legacyCatalog();
