// Map legend of the surfaces: `i` ice and four arrows for the floor belt. Coop only (a versus kitchen is two equal halves with no moving floor).
import type { Tile } from '../maps/types';

export const BELT_ARROWS: Record<string, readonly [number, number]> = { '→': [1, 0], '←': [-1, 0], '↑': [0, -1], '↓': [0, 1] };
export const ICE_CHAR = 'i';
export const SURFACE_CHARS = [ICE_CHAR, ...Object.keys(BELT_ARROWS)];

export function surfaceTile(c: string, versus: boolean): Tile | null {
  if (versus) return null;
  if (c === ICE_CHAR) return { kind: 'floor', spawn: false, surface: { kind: 'ice' } };
  const d = BELT_ARROWS[c];
  return d ? { kind: 'floor', spawn: false, surface: { kind: 'belt', dx: d[0], dy: d[1] } } : null;
}

/** Does this map use ice or belts? The lobby turns `surfaces` on for the ones that do. */
export const usesSurfaces = (rows: readonly string[]) => rows.some((r) => [...r].some((c) => SURFACE_CHARS.includes(c)));
