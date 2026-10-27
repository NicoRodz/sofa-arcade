// The multi-state validator (design section 5): a map with a v2 mutation must be valid BEFORE and AFTER the change (the base validator and every declared mechanic), the ops must be applicable,
// and the inverse must give the original map back. Used by the map tests and by the generator.
import type { MapDef } from '../maps';
import { validateMap } from './index';
import { applyRows, handleProblems, opsProblems } from '../mech/mutation/ops';
import { mechModule } from '../mech/registry';

export function multistateProblems(map: MapDef, n = 2): string[] {
  const m = map.mutation;
  if (!m) return [];
  const bad = opsProblems(map.rows, m);
  if (bad.length) return bad;
  const after = applyRows(map.rows, m.ops);
  const side = (label: string, rows: readonly string[]) => [
    ...validateMap({ ...map, rows }).errors.map((e) => `${label}: ${e}`),
    ...(map.mechanics ?? []).flatMap((id) =>
      mechModule(id)
        .validate(rows, n)
        .map((e) => `${label}: ${e}`),
    ),
  ];
  return [...side('before', map.rows), ...side('after', after), ...handleProblems(after)];
}
