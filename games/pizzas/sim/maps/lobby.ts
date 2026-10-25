// Lobby rules for the fixed maps: which are recommended, warned or blocked for N players, and which one to pick.
import type { Difficulty } from '@pichi/core/difficulty';
import { FIXED_MAPS, MAPS_BY_DIFFICULTY, fixedMap, type MapChoice } from './catalog';
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
