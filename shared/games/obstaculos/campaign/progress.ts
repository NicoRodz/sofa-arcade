// The progress of an expedition and the rules on it (plan §3 and §6). Pure: no clock, no disk, no catalog of its own (it is always passed in).
//   Expedition      what the server stores, one JSON per expedition
//   applyResult     a played level -> stars, medal, best time, next unlocks (monotone: nothing ever goes down)
//   mergeExpedition the union of two versions of the same expedition (commutative, associative, idempotent), so a stale screen can never erase progress
//   isUnlocked...   what the map may open
import { SKIP_AFTER_FAILURES, SUMMIT_STARS_DEN, SUMMIT_STARS_NUM, TIME_MEDAL_FACTOR, bossOf, campaignOrder, levelById, pathOf, summitOf, worldById, worldIndex, type Catalog, type CatalogLevel } from './catalog';

export const SCHEMA_VERSION = 1;
export type Stars = [boolean, boolean, boolean]; // [reached the goal, every collectible, no hearts lost]

export interface LevelProgress {
  done: boolean;
  stars: Stars;
  bestTimeMs: number | null;
  timeMedal: boolean; // the clock medal: apart from the stars
  collectiblesMask: number; // bit i = collectible i taken in a run that cleared the level
  skipped: boolean; // passed over after repeated game overs: it opens the next level but gives no stars; cleared later it stops being "skipped"
}
export interface Assists { infiniteHearts: boolean; slowMotion: boolean; instantBubble: boolean; permanentSilhouette: boolean }
export const NO_ASSISTS: Assists = { infiniteHearts: false, slowMotion: false, instantBubble: false, permanentSilhouette: false };

export interface Expedition {
  schemaVersion: number;
  id: string;
  name: string; // the group: "Nico y Angi"
  createdAt: number;
  updatedAt: number;
  levels: Record<string, LevelProgress>;
  unlocked: string[]; // explicit grants only ('world:2' = "ya sabemos escalar"); what the levels unlock is derived, see isUnlocked
  assists: Assists;
  lastLevelId: string | null; // the level played last
}

// A level as the screen reports it when it ends.
export interface LevelOutcome {
  levelId: string;
  cleared: boolean;
  timeMs: number; // of the run that ended the level
  collectiblesMask: number; // taken in that run
  deaths: number; // hearts lost in this play of the level, failed attempts included
}

export const emptyProgress = (): LevelProgress => ({ done: false, stars: [false, false, false], bestTimeMs: null, timeMedal: false, collectiblesMask: 0, skipped: false });
export const newExpedition = (id: string, name: string, now: number): Expedition => ({
  schemaVersion: SCHEMA_VERSION, id, name, createdAt: now, updatedAt: now, levels: {}, unlocked: [], assists: { ...NO_ASSISTS }, lastLevelId: null,
});

export const fullMask = (collectibles: number): number => (collectibles >= 31 ? 0x7fffffff : (1 << collectibles) - 1);
export const maskCount = (mask: number): number => { let n = 0; for (let m = mask >>> 0; m; m &= m - 1) n++; return n; };
export const progressOf = (e: Expedition, levelId: string): LevelProgress => e.levels[levelId] ?? emptyProgress();
export const starCount = (p: LevelProgress): number => p.stars.filter(Boolean).length;
export const totalStars = (e: Expedition): number => Object.values(e.levels).reduce((a, p) => a + starCount(p), 0);
export const worldStars = (e: Expedition, c: Catalog, worldId: string): number => pathOf(c, worldId).reduce((a, l) => a + starCount(progressOf(e, l.id)), 0);

// ---- stars (plan §3): 1 = the goal; 2 = every collectible (counted over the runs that cleared the level); 3 = no hearts lost and no infinite-hearts assist
export function starsOf(r: LevelOutcome, level: CatalogLevel, assists: Assists, maskSoFar: number): Stars {
  if (!r.cleared) return [false, false, false];
  const mask = (maskSoFar | r.collectiblesMask) >>> 0;
  return [true, level.collectibles > 0 && mask === fullMask(level.collectibles), r.deaths === 0 && !assists.infiniteHearts];
}
export const timeMedalOf = (timeMs: number, level: CatalogLevel): boolean => level.botMs !== null && timeMs <= level.botMs * TIME_MEDAL_FACTOR;

// ---- monotone merge
const minN = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.min(a, b)); // best time: the smaller
export function mergeProgress(a: LevelProgress, b: LevelProgress): LevelProgress {
  const done = a.done || b.done;
  return {
    done,
    stars: [a.stars[0] || b.stars[0], a.stars[1] || b.stars[1], a.stars[2] || b.stars[2]],
    bestTimeMs: minN(a.bestTimeMs, b.bestTimeMs),
    timeMedal: a.timeMedal || b.timeMedal,
    collectiblesMask: (a.collectiblesMask | b.collectiblesMask) >>> 0,
    skipped: (a.skipped || b.skipped) && !done,
  };
}
const later = (a: Expedition, b: Expedition): Expedition => (a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : JSON.stringify(a) >= JSON.stringify(b) ? a : b);
// The union of two versions: progress only ever goes up. The settings (name, assists, last level) come from the newer one; ties break on content, so it is commutative.
export function mergeExpedition(a: Expedition, b: Expedition): Expedition {
  const win = later(a, b);
  const levels: Record<string, LevelProgress> = {};
  for (const id of [...new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])].sort()) levels[id] = mergeProgress(progressOf(a, id), progressOf(b, id));
  return {
    schemaVersion: SCHEMA_VERSION, id: win.id, name: win.name, createdAt: Math.min(a.createdAt, b.createdAt), updatedAt: Math.max(a.updatedAt, b.updatedAt),
    levels, unlocked: [...new Set([...a.unlocked, ...b.unlocked])].sort(), assists: { ...win.assists }, lastLevelId: win.lastLevelId,
  };
}

// ---- applying what happened
// A level was played: fold the result into the expedition. Returns a new object; a failed run changes nothing but lastLevelId.
export function applyResult(e: Expedition, c: Catalog, r: LevelOutcome, now: number): Expedition {
  const level = levelById(c, r.levelId);
  if (!level) return e;
  const prev = progressOf(e, r.levelId);
  const next: LevelProgress = { ...prev };
  if (r.cleared) {
    next.done = true;
    next.skipped = false;
    next.collectiblesMask = (prev.collectiblesMask | r.collectiblesMask) >>> 0;
    next.stars = starsOf(r, level, e.assists, prev.collectiblesMask);
    next.bestTimeMs = r.timeMs;
    next.timeMedal = timeMedalOf(r.timeMs, level);
  }
  return mergeExpedition(e, { ...e, updatedAt: Math.max(now, e.updatedAt + 1), levels: { ...e.levels, [r.levelId]: next }, lastLevelId: r.levelId });
}
// "Saltar nivel" (after SKIP_AFTER_FAILURES game overs): opens the next level, gives nothing. Only for a level that is open and not done.
export function skipLevel(e: Expedition, c: Catalog, levelId: string, now: number): Expedition {
  const level = levelById(c, levelId);
  if (!level || level.kind === 'summit' || level.kind === 'practice' || !isUnlocked(e, c, levelId) || progressOf(e, levelId).done) return e;
  const prev = progressOf(e, levelId);
  return mergeExpedition(e, { ...e, updatedAt: Math.max(now, e.updatedAt + 1), levels: { ...e.levels, [levelId]: { ...prev, skipped: true } }, lastLevelId: levelId });
}
export const canOfferSkip = (failuresInARow: number): boolean => failuresInARow >= SKIP_AFTER_FAILURES;
// "Ya sabemos escalar": opens a world from the start.
export function openWorld(e: Expedition, c: Catalog, worldId: string, now: number): Expedition {
  if (!worldById(c, worldId)) return e;
  return mergeExpedition(e, { ...e, updatedAt: Math.max(now, e.updatedAt + 1), unlocked: [...e.unlocked, `world:${worldId}`] });
}

// ---- unlocks (plan §3)
const passed = (p: LevelProgress) => p.done || p.skipped;
// A world is open when it is the first, was granted, or the boss of the previous world was beaten (skipping the boss does not count).
export function isWorldUnlocked(e: Expedition, c: Catalog, worldId: string): boolean {
  const i = worldIndex(c, worldId);
  if (i < 0) return false;
  if (i === 0 || e.unlocked.includes(`world:${worldId}`)) return true;
  const boss = bossOf(c, c.worlds[i - 1]!.id);
  return !boss || progressOf(e, boss.id).done;
}
// Stars a world must give for its summit to open: 15 of the 21 (the same share when a world has fewer levels).
export const summitNeed = (c: Catalog, worldId: string): number => Math.ceil((pathOf(c, worldId).length * 3 * SUMMIT_STARS_NUM) / SUMMIT_STARS_DEN);
export function isUnlocked(e: Expedition, c: Catalog, levelId: string): boolean {
  const l = levelById(c, levelId);
  if (!l) return false;
  if (l.kind === 'practice') return true;
  if (!isWorldUnlocked(e, c, l.world)) return false;
  if (l.kind === 'summit') return worldStars(e, c, l.world) >= summitNeed(c, l.world);
  const path = pathOf(c, l.world);
  const i = path.findIndex((x) => x.id === l.id);
  return i <= 0 || passed(progressOf(e, path[i - 1]!.id)) || e.unlocked.includes(`level:${l.id}`);
}
export const unlockedLevels = (e: Expedition, c: Catalog): CatalogLevel[] => c.levels.filter((l) => isUnlocked(e, c, l.id));

// What "Continuar" offers: the first level in campaign order that is open and not passed yet (null: every level was passed).
export function continueLevel(e: Expedition, c: Catalog): CatalogLevel | null {
  return campaignOrder(c).find((l) => isUnlocked(e, c, l.id) && !passed(progressOf(e, l.id))) ?? null;
}
// The level after `levelId` in the campaign, when it is open (what "Siguiente" offers).
export function nextLevel(e: Expedition, c: Catalog, levelId: string): CatalogLevel | null {
  const order = campaignOrder(c);
  const i = order.findIndex((l) => l.id === levelId);
  const n = i >= 0 ? order[i + 1] : undefined;
  return n && isUnlocked(e, c, n.id) ? n : null;
}
// The summit of a world once it is open (hidden before: the map shows "???").
export const summitState = (e: Expedition, c: Catalog, worldId: string): 'none' | 'hidden' | 'open' => {
  const s = summitOf(c, worldId);
  return !s ? 'none' : isUnlocked(e, c, s.id) ? 'open' : 'hidden';
};
