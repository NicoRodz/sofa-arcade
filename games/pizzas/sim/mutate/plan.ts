// Kitchens that mutate (council pizzas A-2 / B-9): ONE change of the map per round, at 1:30, announced MUTATE_WARN_MS before with an alarm and a banner.
// A mutation is DATA: a diff of tiles (position + the map letter it becomes). Only coop maps that have one are eligible; with the flag off nothing here runs.
// Versus excludes it for now (two kitchens must stay equal halves; a mutation would have to be mirrored through sigma).
import type { Difficulty } from '@pichi/core';

export interface TileDiff {
  x: number;
  y: number;
  to: string; // a map letter (maps/parse.ts, surfaces/legend.ts): the tile after the change
}
export interface Mutation {
  id: string;
  title: string; // banner (Spanish: shown as is)
  blurb: string;
  tiles: readonly TileDiff[];
}

export const MUTATE_AT_MS = 90_000; // minute 1:30
export const MUTATE_WARN_MS = 3000;
export const MUTATE_SEED_TAG = 0x6d757461; // sub-seed of its own: seed XOR tag, so no other stream is touched
export const MUTATE_OPTION = 'mutate';

const strip = (y: number, x0: number, x1: number, to: string): TileDiff[] =>
  Array.from({ length: x1 - x0 + 1 }, (_v, i) => ({ x: x0 + i, y, to }));

// One mutation per eligible map (the id of the fixed map). Each one only turns floor into ice or belt: stations and spawn tiles never move.
export const MUTATIONS: Readonly<Record<string, Mutation>> = {
  '1': {
    id: 'rink',
    title: '¡SE CONGELÓ EL PISO!',
    blurb: 'La mitad sur de la cocina es hielo',
    tiles: [...strip(5, 3, 12, 'i'), ...strip(6, 3, 12, 'i')],
  },
  '2': {
    id: 'belt-east',
    title: '¡CINTA EN LA COCINA!',
    blurb: 'El pasillo sur arrastra todo hacia el este',
    tiles: strip(5, 2, 12, '→'),
  },
  '4': {
    id: 'belt-window',
    title: '¡CINTA AL PASE!',
    blurb: 'El pasillo lleva todo hacia la ventanilla',
    tiles: strip(4, 6, 9, '←'),
  },
};

export const mutationFor = (mapId: string | undefined): Mutation | null => (mapId ? (MUTATIONS[mapId] ?? null) : null);

/** The rows of a map after a mutation (what the validator checks, and what the round's grid becomes). */
export function rowsAfter(rows: readonly string[], m: Mutation): string[] {
  const out = rows.map((r) => [...r]);
  for (const t of m.tiles) if (out[t.y]?.[t.x] !== undefined) out[t.y]![t.x] = t.to;
  return out.map((r) => r.join(''));
}

/** The lobby option: Sí / No. Missing = Sí on Normal and Difícil, No on Fácil (only maps with a mutation ever use it). */
export const mutateOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty): boolean => {
  const v = modeOptions?.[MUTATE_OPTION];
  return typeof v === 'boolean' ? v : d !== 'easy';
};
