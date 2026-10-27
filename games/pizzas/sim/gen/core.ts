// The generator of maps with mechanics (design section 6): `generateMech({ seed, n, difficulty, mechanics? })`. It takes the classic generator's map of seed+k (already valid), pastes the mechanics with
// its own stream (seed ^ MECH_TAG), rolls the v2 mutation, and keeps the first attempt whose validators all pass (the base validator, every mechanic's, and the multi-state one, for the team sizes 2..n).
// Up to 64 seeds; then it falls back to the plain classic map with no mechanics (`fallback: true`). Same inputs, same map. The sim never draws from this stream.
import { mulberry32, type Rng } from '@pichi/core/rng';
import { teamSize, type Difficulty } from '@pichi/core/difficulty';
import { generate } from '../generate/coop';
import { floorTiles, minPlayers, validateMap, FLOOR_PER_PLAYER } from '../validate';
import { multistateProblems } from '../validate/multistate';
import { parseMap, type MapDef, type Pos } from '../maps';
import type { PuestoId } from '../puestos';
import { mechFlagsOf, type MechId } from '../mech/ids';
import { mechModule } from '../mech/registry';
import { MAX_OPS, opsProblems, type MutationV2, type Op } from '../mech/mutation/ops';
import { DECORATORS, GEN_MECHS, find, pick, type Cells } from './place';
import { ROUND_AT, rollMutation } from './mutation-roll';

export const MECH_TAG = 0x6d656368;
export const MAX_SEEDS = 64;
export const HOW_MANY: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 }; // mechanics per map (design: 1, 2, 3)

export interface MechGenOpts {
  seed: number;
  n: number;
  difficulty: Difficulty;
  mechanics?: readonly MechId[]; // the ones the player ticked; none = the generator chooses `HOW_MANY[difficulty]` of GEN_MECHS
}
export interface MechGenerated {
  rows: string[];
  mechanics: MechId[]; // includes 'mutation' when the map has one
  mutation?: MutationV2;
  spawns?: Pos[];
  puestos?: PuestoId[][];
  seed: number; // the seed that produced the map (the asked one + the retries)
  attempts: number;
  fallback: boolean; // no attempt validated: this is the classic map with no mechanics
}

function choose(rng: Rng, want: readonly MechId[] | undefined, diff: Difficulty): MechId[] {
  if (want?.length) return GEN_MECHS.filter((m) => want.includes(m));
  const pool = [...GEN_MECHS],
    out: MechId[] = [];
  while (out.length < HOW_MANY[diff] && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return GEN_MECHS.filter((m) => out.includes(m));
}

export function generateMech(o: MechGenOpts): MechGenerated {
  const sizes = [...new Set([2, Math.min(8, Math.max(2, teamSize(o.n)))])];
  for (let k = 0; k < MAX_SEEDS; k++) {
    const seed = o.seed + k;
    const base = generate(seed, o.difficulty, o.n);
    if (base.archetype === 'fixed') continue;
    const rng = mulberry32((seed ^ MECH_TAG) >>> 0);
    const mechs = choose(rng, o.mechanics, o.difficulty);
    const cells: Cells = base.rows.map((r) => [...r]);
    if (!mechs.every((m) => DECORATORS[m]!(cells, rng))) continue;
    const rows = cells.map((r) => r.join(''));
    const mutation = o.difficulty === 'easy' && !o.mechanics ? undefined : rollMutation(rows, rng, o.difficulty);
    const mechanics: MechId[] = mutation ? [...mechs, 'mutation'] : mechs;
    const grid = parseMap(rows, false, mechFlagsOf(mechanics));
    if (floorTiles(grid) < FLOOR_PER_PLAYER * base.nMax) continue;
    const def: MapDef = {
      id: 'gen',
      name: 'gen',
      rows,
      nMin: base.nMin,
      nMax: base.nMax,
      minDuro: minPlayers(grid),
      stars: 2,
      spawns: base.spawns,
      puestos: base.puestos,
      mechanics,
      mutation,
    };
    if (!validateMap(def).ok) continue;
    if (sizes.some((n) => mechs.some((m) => mechModule(m).validate(rows, n).length))) continue;
    if (mutation && multistateProblems(def, o.n).length) continue;
    return { rows, mechanics, mutation, spawns: base.spawns, puestos: base.puestos, seed, attempts: k + 1, fallback: false };
  }
  const base = generate(o.seed, o.difficulty, o.n);
  return { rows: base.rows, mechanics: [], spawns: base.spawns, puestos: base.puestos, seed: o.seed, attempts: MAX_SEEDS, fallback: true };
}

export { GEN_MECHS, MAX_OPS, ROUND_AT, find, pick, opsProblems };
export type { Op };
