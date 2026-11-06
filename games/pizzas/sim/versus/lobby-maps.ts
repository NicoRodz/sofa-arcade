// Versus lobby: the maps that fit the team sizes, how a lobby choice resolves to a map and which side each kitchen is on (split from lobby.ts, moved verbatim).
// lobby.ts re-exports all of it. No DOM, no clock, no I/O.
import type { Difficulty, Rng } from '@pichi/core';
import { generateVersus } from '../generate';
import { parseMap, type Pos, type SigmaName } from '../maps';
import { kitchenRegions } from './versus';
import { VERSUS_AUTO, VERSUS_MAPS, VERSUS_RANDOM, versusMap, type VersusChoice } from './maps';

// --- Versus maps that fit -----------------------------------------------------------------------------------------------------------

export type VersusMapStatus = { state: 'recommended' } | { state: 'blocked'; reason: string };

/** A map fits when the total is inside its range and the biggest team has a start tile each in its kitchen. */
export function versusMapStatus(
  m: { nMin: number; nMax: number; versus: { spawns: readonly (readonly Pos[])[] } },
  sizes: readonly number[],
): VersusMapStatus {
  const total = sizes.reduce((a, b) => a + b, 0),
    biggest = Math.max(0, ...sizes);
  if (total > m.nMax) return { state: 'blocked', reason: `hasta ${m.nMax} jugadores` };
  if (total < m.nMin) return { state: 'blocked', reason: `necesita ${m.nMin}+ jugadores` };
  const room = Math.min(...m.versus.spawns.map((s) => s.length));
  if (biggest > room) return { state: 'blocked', reason: `caben ${room} por cocina` };
  return { state: 'recommended' };
}

/** Every versus map with its status for these team sizes; the ones that fit come first. */
export function versusLobbyMaps(sizes: readonly number[]) {
  const all = VERSUS_MAPS.map((map) => ({ map, status: versusMapStatus(map, sizes) }));
  return [...all.filter((x) => x.status.state === 'recommended'), ...all.filter((x) => x.status.state !== 'recommended')];
}

/** The versus map the lobby proposes: the first that fits and was not played yet (any that fits once all were), else "auto". */
export function defaultVersusChoice(sizes: readonly number[], played: ReadonlySet<string>): VersusChoice {
  const fit = versusLobbyMaps(sizes)
    .filter((x) => x.status.state === 'recommended')
    .map((x) => x.map.id);
  return (fit.find((id) => !played.has(id)) ?? fit[0] ?? VERSUS_AUTO) as VersusChoice;
}

export interface ResolvedVersusMap {
  id: string;
  name: string;
  rows: readonly string[];
  spawns: readonly Pos[];
  sigma: SigmaName;
  shared?: readonly Pos[];
} // shared: the tiles of a shared pantry (V2)

/**
 * The map a lobby choice stands for. `spawns` is kitchen A's starts followed by kitchen B's (createGame keeps each team's own, in order).
 * "auto" draws among the maps that fit (`rand` is injected); "random" generates one from the lobby seed for the biggest team (2 x biggest chefs).
 */
export function resolveVersusMap(
  choice: string,
  seed: number,
  difficulty: Difficulty,
  sizes: readonly number[],
  rand: Rng,
): ResolvedVersusMap {
  const biggest = Math.max(1, ...sizes);
  if (choice === VERSUS_RANDOM) {
    const g = generateVersus(seed, difficulty, Math.max(2, Math.min(8, 2 * biggest)));
    return { id: 'vs-gen', name: `Versus ${seed}`, rows: g.rows, spawns: [...g.spawns[0], ...g.spawns[1]], sigma: g.sigma };
  }
  const fit = versusLobbyMaps(sizes)
    .filter((x) => x.status.state === 'recommended')
    .map((x) => x.map);
  const m =
    (choice === VERSUS_AUTO ? undefined : versusMap(choice)) ?? (fit.length ? fit[Math.floor(rand() * fit.length)]! : versusMap('V1')!);
  return {
    id: m.id,
    name: m.name,
    rows: m.rows,
    spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]],
    sigma: m.versus.sigma,
    ...(m.versus.shared?.length ? { shared: m.versus.shared } : {}),
  };
}

/** "izquierda" / "derecha" or "arriba" / "abajo" for each kitchen of a map, from where its floor really is (team 0 = the region met first). */
export function kitchenSides(rows: readonly string[], spawns: readonly Pos[], teamCount = 2): string[] {
  const grid = parseMap(rows, true);
  const { comp, regions } = kitchenRegions(grid, teamCount, spawns);
  const centre = regions.map((r) => {
    let sx = 0,
      sy = 0,
      n = 0;
    comp.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === r) {
          sx += x;
          sy += y;
          n++;
        }
      }),
    );
    return { x: sx / n, y: sy / n };
  });
  const spreadX = Math.max(...centre.map((c) => c.x)) - Math.min(...centre.map((c) => c.x));
  const spreadY = Math.max(...centre.map((c) => c.y)) - Math.min(...centre.map((c) => c.y));
  const side = spreadX >= spreadY;
  const order = centre
    .map((c, i) => ({ i, v: side ? c.x : c.y }))
    .sort((a, b) => a.v - b.v)
    .map((o) => o.i);
  return centre.map((_c, i) => (side ? ['izquierda', 'derecha'] : ['arriba', 'abajo'])[order.indexOf(i)]!);
}
