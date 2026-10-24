// The catalog of the campaign: which levels exist, how they group into worlds, and what the progress rules need to know about each one.
// S2's catalog (catalog.ts: CAMPAIGN, practice.ts: PRACTICE) is adapted to it by campaignCatalog() below.
// Everything here is plain data + pure lookups, so the server, the screen and the tests read the same thing.
import type { Biome, GameMode, LevelDef } from '../types';
import { CAMPAIGN } from './catalog';
import { PRACTICE } from './practice';

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
  opensAt?: string; // practice stations: the campaign level whose debut opens them
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

// ---- S2's catalog adapted to this interface
// Decisions: only BUILT levels enter (planned ones have no tilemap yet; a world with none built does not appear, so the map grows by itself as A5-A7 land);
// 'E' and 'E/L' play Encadenados, 'L' Libres; the clock medal reads the level's par (the validator keeps no bot time); the practice stations carry the
// level of their debut in `opensAt`.
const WORLD_IDS = ['beach', 'forest', 'glacier', 'mine', 'volcano'] as const;
const WORLD_TITLE: Record<(typeof WORLD_IDS)[number], string> = { beach: 'Playa', forest: 'Bosque', glacier: 'Glaciar', mine: 'Mina', volcano: 'Volcán' };
const modeOf = (m: 'E' | 'L' | 'E/L'): GameMode => (m === 'L' ? 'free' : 'chain');

export function campaignCatalog(): Catalog {
  const levels: CatalogLevel[] = [];
  for (const l of CAMPAIGN) {
    if (l.status !== 'built' || !l.def) continue;
    const world = l.world === 'summit' ? l.id.slice(1) : String(WORLD_IDS.indexOf(l.world) + 1);
    levels.push({
      id: l.id, world, order: l.world === 'summit' ? 0 : l.index, name: l.name, kind: l.world === 'summit' ? 'summit' : l.boss ? 'boss' : 'level', def: l.def, mode: modeOf(l.mode),
      collectibles: l.collectibles.length, botMs: l.def.parSec * 1000, validatedFor: l.validatedFor,
    });
  }
  const worlds = WORLD_IDS.map((b, i): CatalogWorld => ({ id: String(i + 1), name: WORLD_TITLE[b], biome: b })).filter((w) => levels.some((l) => l.world === w.id));
  const practice = PRACTICE.map((s): CatalogLevel => ({ id: s.id, world: '1', order: 0, name: s.name, kind: 'practice', def: s.def, mode: modeOf(s.mode), collectibles: 0, botMs: null, validatedFor: [2], opensAt: s.opensAt }));
  return { worlds, levels, practice };
}
export const CAMPAIGN_CATALOG: Catalog = campaignCatalog();
