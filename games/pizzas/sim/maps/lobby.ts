// Lobby rules for the fixed maps: which are recommended, warned or blocked for N players, and which one to pick.
import type { Difficulty } from '@pichi/core/difficulty';
import { COOP_MAPS, FIXED_MAPS, MAPS_BY_DIFFICULTY, fixedMap, groupOfMap, type MapChoice } from './catalog';
import type { MapDef } from './types';

// Lobby: with N connected players every map is recommended (nMin <= N <= nMax), warned (minDuro <= N < nMin: playable but
// meant for more) or blocked (N < minDuro or N > nMax). 0 players count as 2 so an empty lobby still shows a sensible list.
export type MapStatus = { state: 'recommended' } | { state: 'warn'; reason: string } | { state: 'blocked'; reason: string };
export const lobbyN = (connected: number) => Math.max(connected, 0) || 2;

export function mapStatus(m: MapDef, n: number): MapStatus {
  if (n > m.nMax) return { state: 'blocked', reason: `hasta ${m.nMax} jugadores` };
  if (n < m.minDuro) return { state: 'blocked', reason: `necesita ${m.minDuro}+ jugadores` };
  if (n < m.nMin) return { state: 'warn', reason: `pensado para ${m.nMin}+` };
  return { state: 'recommended' };
}
const centre = (m: MapDef) => (m.nMin + m.nMax) / 2;
const byFit = (n: number) => (a: MapDef, b: MapDef) =>
  a.stars - b.stars || Math.abs(centre(a) - n) - Math.abs(centre(b) - n) || Number(a.id) - Number(b.id);

// Recommended maps first (fewer stars first, then nearest to the middle of their range), then warned, then blocked.
export function lobbyMaps(n: number, maps: readonly MapDef[] = FIXED_MAPS): { map: MapDef; status: MapStatus }[] {
  const rank = { recommended: 0, warn: 1, blocked: 2 };
  return maps
    .map((map) => ({ map, status: mapStatus(map, n) }))
    .sort((a, b) => rank[a.status.state] - rank[b.status.state] || byFit(n)(a.map, b.map));
}
export const recommendedMaps = (n: number, maps: readonly MapDef[] = FIXED_MAPS) =>
  lobbyMaps(n, maps)
    .filter((x) => x.status.state === 'recommended')
    .map((x) => x.map);

// What the lobby selects by default: the first recommended map not yet played in this session (any recommended one once all were).
export function defaultMap(n: number, played: ReadonlySet<string>, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return rec.find((m) => !played.has(m.id)) ?? rec[0] ?? lobbyMaps(n, maps).find((x) => x.status.state === 'warn')?.map ?? maps[0]!;
}
// The selected map got blocked (someone joined or left): the recommended map with the closest complexity, then closest range.
export function replacementMap(current: MapDef, n: number, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return (
    [...rec].sort((a, b) => Math.abs(a.stars - current.stars) - Math.abs(b.stars - current.stars) || byFit(n)(a, b))[0] ??
    defaultMap(n, new Set(), maps)
  );
}

// "auto" (Aleatorio) draws among the maps recommended for N; rand is injected so the logic stays deterministic.
// Without N it falls back to the per-difficulty list.
export function pickFixedMap(choice: MapChoice, d: Difficulty, rand: () => number, n?: number): MapDef {
  if (choice !== 'auto') return fixedMap(choice) ?? fixedMap(MAPS_BY_DIFFICULTY[d][0]!)!;
  const rec = n === undefined ? [] : recommendedMaps(n);
  if (rec.length) return rec[Math.floor(rand() * rec.length)]!;
  const ids = MAPS_BY_DIFFICULTY[d];
  return fixedMap(ids[Math.floor(rand() * ids.length)]!)!;
}

// --- menuV2: the "Aleatorio" draw (design pizzas-tanda2 §1.3) ----------------------------------------------------------------------------------------------
// `auto` stops being "the fixed maps that fit N" and draws among every coop map with at least one dynamic: classic, ice/belts, Carta larga and Taller, by family
// weights that depend on the difficulty. The six plain maps stay out (they come back with a dynamic of their own in 2b) but can still be picked by hand.
export type MapFamily = 'classic' | 'surface' | 'series' | 'taller';
export const familyOfMap = (id: string): MapFamily => {
  const n = Number(id);
  return n >= 29 ? 'taller' : n >= 20 ? 'series' : n >= 16 ? 'surface' : 'classic';
};
/** Dynamics each map brings today (what the audit counted: river, belts, ice, sink, topping crates, rooms, sauce pot, hatch, mechanics). 0 = a plain map. */
export const MAP_DYNAMICS: Readonly<Record<string, number>> = {
  '1': 0,
  '2': 0,
  '3': 1,
  '4': 0,
  '5': 1,
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 1,
  '10': 1,
  '11': 1,
  '12': 2,
  '13': 3,
  '14': 2,
  '15': 1,
  '16': 1,
  '17': 1,
  '18': 1,
  '19': 1,
  '20': 3,
  '21': 2,
  '22': 1,
  '23': 2,
  '24': 3,
  '25': 1,
  '26': 2,
  '27': 2,
  '28': 3,
  '29': 1,
  '30': 3,
  '31': 2,
  '32': 2,
  '33': 1,
  '34': 2,
  '35': 1,
  '36': 3,
};
/** Maps with no dynamic of their own: out of the draw in 2a, still selectable. */
export const OUT_OF_DRAW: readonly string[] = ['1', '2', '4', '6', '7', '8'];
/** Level of a map: its dynamics, plus one when it is a three-star map. */
export const mapLevel = (m: MapDef): number => (MAP_DYNAMICS[m.id] ?? 0) + (m.stars === 3 ? 1 : 0);
/** % of the draws each family gets (renormalised when a family has no map for this N and difficulty). */
export const FAMILY_PCT: Record<Difficulty, Record<MapFamily, number>> = {
  easy: { classic: 40, surface: 30, series: 30, taller: 0 },
  normal: { classic: 30, surface: 20, series: 30, taller: 20 },
  hard: { classic: 20, surface: 20, series: 30, taller: 30 },
};

/** The maps `auto` may draw for N players on a difficulty: N in the map's range, a dynamic, not out of the draw, and the level the difficulty allows (Fácil up to 2, no Taller; Difícil from 2). Without N, 4. */
export function autoMaps(n: number | undefined, d: Difficulty): MapDef[] {
  const k = Math.max(2, n ?? 4);
  return COOP_MAPS.filter((m) => {
    if (mapStatus(m, k).state !== 'recommended' || OUT_OF_DRAW.includes(m.id) || (MAP_DYNAMICS[m.id] ?? 0) < 1) return false;
    const level = mapLevel(m);
    return d === 'easy' ? level <= 2 && familyOfMap(m.id) !== 'taller' : d === 'hard' ? level >= 2 : true;
  });
}

/** What the draw remembers of a session: the maps already played and the family of the last round. */
export interface AutoSession {
  played: ReadonlySet<string>;
  last?: MapFamily;
  first?: boolean; // the first round of the session (after the school): the lowest level available
}

/**
 * One `auto` draw. The bag: a map is not repeated until every eligible one was played, two rounds in a row are not of the same family when there is
 * another, and the first round takes the lowest level available. Then a family by weight and a map of it, both from `rand` (inject a sub-stream: the draw is deterministic).
 */
export function pickAutoMap(n: number | undefined, d: Difficulty, rand: () => number, session: AutoSession): MapDef {
  const all = autoMaps(n, d);
  if (!all.length) return fixedMap(MAPS_BY_DIFFICULTY[d][0]!)!;
  let pool = all.filter((m) => !session.played.has(m.id));
  if (!pool.length) pool = all; // the bag is empty: refill it
  if (session.first) {
    const low = Math.min(...pool.map(mapLevel));
    pool = pool.filter((m) => mapLevel(m) === low);
  }
  const families = (['classic', 'surface', 'series', 'taller'] as const).filter((f) => pool.some((m) => familyOfMap(m.id) === f));
  const fresh = families.filter((f) => f !== session.last);
  const candidates = fresh.length ? fresh : families;
  const weighted = candidates.filter((f) => FAMILY_PCT[d][f] > 0);
  const open = weighted.length ? weighted : candidates; // all weights zero (cannot happen with today's tables): equal shares
  const w = (f: MapFamily) => (weighted.length ? FAMILY_PCT[d][f] : 1);
  let u = rand() * open.reduce((a, f) => a + w(f), 0);
  let family = open[open.length - 1]!;
  for (const f of open) {
    u -= w(f);
    if (u < 0) {
      family = f;
      break;
    }
  }
  const inFamily = pool.filter((m) => familyOfMap(m.id) === family);
  return inFamily[Math.floor(rand() * inFamily.length)]!;
}

// --- menuV2: the lobby lists (design pizzas-tanda2 §1.3, UI) ------------------------------------------------------------------------------------------------
/** The page of the lobby's map grid a coop map lives on: the three sets of `groupOfMap`, and "plain" for the six maps out of the draw (the folded "Sin dinámica" group). */
export const lobbyGroupOfMap = (id: string): ReturnType<typeof groupOfMap> | 'plain' =>
  OUT_OF_DRAW.includes(id) ? 'plain' : groupOfMap(id);
/** How many maps "Recomendados para N" lists. */
export const RECOMMENDED_COUNT = 3;
/**
 * "Recomendados para N": up to three maps from the bag of the session, a preview of what `auto` would serve. The same pool as the draw (autoMaps minus the maps already
 * played, refilled when empty), deterministic: families that are not the last round's first, then one map per family while there are families left, each family's
 * pick being its lowest level, then closest to the middle of the range, then lowest id.
 */
export function recommendedForN(n: number | undefined, d: Difficulty, session: Pick<AutoSession, 'played' | 'last'>): MapDef[] {
  const all = autoMaps(n, d);
  const bag = all.filter((m) => !session.played.has(m.id));
  const pool = bag.length ? bag : all;
  const k = Math.max(2, n ?? 4);
  const best = (a: MapDef, b: MapDef) =>
    mapLevel(a) - mapLevel(b) || Math.abs(centre(a) - k) - Math.abs(centre(b) - k) || Number(a.id) - Number(b.id);
  const families = (['classic', 'surface', 'series', 'taller'] as const).filter((f) => pool.some((m) => familyOfMap(m.id) === f));
  families.sort((a, b) => Number(a === session.last) - Number(b === session.last) || FAMILY_PCT[d][b] - FAMILY_PCT[d][a]);
  const out: MapDef[] = [];
  for (const f of families) {
    const m = pool.filter((x) => familyOfMap(x.id) === f).sort(best)[0];
    if (m && out.length < RECOMMENDED_COUNT) out.push(m);
  }
  return out;
}
