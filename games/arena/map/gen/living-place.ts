// Where the living map goes (F5), drawn from the attempt's own stream right after the furniture, so the furniture of a seed is the same with or without it.
// Each pair is tried on random anchors (left half, columns 0-9) and kept only if V1-V3 hold in every combination of the pairs placed so far; a pair that
// finds no place in TRIES draws is dropped, so a crowded map has fewer elements. How many pairs (1-3, the plan's cap is 4), which kinds, and whether the
// fountain stands (it needs the centre tile free) all come from the seed.
import type { Rng } from '@pichi/core';
import { MAP_H, MAP_W } from '../layout';
import type { TileMap } from '../tile-map';
import { mapStates, type LivingElement } from './living';
import { FOUNTAIN_TILE, LIVING_MAX_X, elementsOf, footprint, type LivingSpec } from './living-shapes';
import type { LivingPlan } from './archetypes/living-for';
import { STATE_CHECKS } from './validate';
import { v1Connection } from './validate-state';

const TRIES = 60;
const MAX_NEW_PAIRS = 3;
const FOUNTAIN_ODDS = 2 / 3;
const PLANNED_ODDS = 0.75; // of the pairs of an archetype with a plan (Pasillos' sofas, Islas' brushes)

/** V1-V3 in every combination of the elements' states. */
export const holdsEverywhere = (base: TileMap, specs: readonly LivingSpec[]): boolean =>
  mapStates(base, elementsOf(specs)).every((st) => STATE_CHECKS.every(([, check]) => check(st.map) === null));

/** `plan`: where the archetype wants its pairs (most pairs go there; the others, and every pair of a map without a plan, anywhere). */
/** V9: V1 (one walkable component) holds in every combination of the living elements' states; null when it does, else the first combination that shuts the map. */
export function v9LivingConnection(base: TileMap, living: readonly LivingElement[]): string | null {
  const bad = mapStates(base, living).find((st) => v1Connection(st.map) !== null);
  return bad ? `states ${bad.states.join('/')}: ${v1Connection(bad.map)}` : null;
}

export function placeLiving(base: TileMap, rng: Rng, plan: LivingPlan | null = null): LivingSpec[] {
  const out: LivingSpec[] = [];
  const used = new Set<number>();
  const pairs = 1 + Math.floor(rng() * MAX_NEW_PAIRS);
  for (let k = 0; k < pairs; k++) {
    const planned = plan !== null && rng() < PLANNED_ODDS;
    const kind = planned ? plan.kind : rng() < 0.5 ? 'brush' : 'sofa';
    const drawn = Math.floor(rng() * (kind === 'brush' ? 4 : 2));
    const variant = planned && plan.variant !== undefined ? plan.variant : drawn;
    const phase = Math.floor(rng() * 1000);
    const from = planned ? Math.floor(rng() * plan.anchors.length) : 0;
    for (let n = 0; n < TRIES; n++) {
      const [ax, ay] = planned
        ? plan.anchors[(from + n) % plan.anchors.length]!
        : [Math.floor(rng() * (LIVING_MAX_X + 1)), Math.floor(rng() * MAP_H)];
      const spec: LivingSpec = { kind, x: ax, y: ay, variant, phase };
      const tiles = footprint(spec);
      const free = tiles.every(
        ([x, y]) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && base.solid[y * MAP_W + x] === 0 && !used.has(y * MAP_W + x),
      );
      if (!free || tiles.some(([x]) => Math.min(x, MAP_W - 1 - x) > LIVING_MAX_X) || !holdsEverywhere(base, [...out, spec])) continue;
      out.push(spec);
      for (const [x, y] of tiles) used.add(y * MAP_W + x);
      break;
    }
  }
  const stands = rng() < FOUNTAIN_ODDS;
  const phase = Math.floor(rng() * 1000);
  if (stands && base.solid[FOUNTAIN_TILE[1] * MAP_W + FOUNTAIN_TILE[0]] === 0)
    out.push({ kind: 'fountain', x: FOUNTAIN_TILE[0], y: FOUNTAIN_TILE[1], variant: 0, phase });
  return out;
}
