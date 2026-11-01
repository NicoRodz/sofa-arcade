import type { Difficulty, Rng } from '@pichi/core';
import { generateMech } from '../gen/core';
import { pickFixedMap, type MapChoice, type MapDef, type Pos } from '../maps';
import type { MechId } from '../mech/ids';
import { generate } from './coop';

// The map a lobby choice stands for. "random" is generated from the lobby seed; the rest are fixed maps.
export function resolveMap(
  choice: MapChoice,
  seed: number,
  diff: Difficulty,
  n: number,
  rand: Rng,
  gen?: { mechs: boolean; mechanics?: readonly MechId[]; mutate?: boolean }, // the lobby's choices for the generated map: mechanics Sí / No and the ticked ones
): {
  id: string;
  name: string;
  rows: readonly string[];
  spawns?: readonly Pos[];
  puestos?: MapDef['puestos'];
  mechanics?: MapDef['mechanics'];
  mutation?: MapDef['mutation'];
  caves?: MapDef['caves'];
} {
  if (choice === 'random') {
    if (gen?.mechs) {
      const g = generateMech({ seed, n, difficulty: diff, mechanics: gen.mechanics, mutate: gen.mutate });
      return {
        id: 'random',
        name: `Aleatorio ${seed}`,
        rows: g.rows,
        spawns: g.spawns,
        puestos: g.puestos,
        mechanics: g.mechanics.length ? g.mechanics : undefined,
        mutation: g.mutation,
      };
    }
    const g = generate(seed, diff, n);
    return { id: 'random', name: `Aleatorio ${seed}`, rows: g.rows, spawns: g.spawns, puestos: g.puestos };
  }
  const m = pickFixedMap(choice, diff, rand, n);
  return {
    id: m.id,
    name: m.name,
    rows: m.rows,
    spawns: m.spawns,
    puestos: m.puestos,
    mechanics: m.mechanics,
    mutation: m.mutation,
    caves: m.caves,
  };
}
