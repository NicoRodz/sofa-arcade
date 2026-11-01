// HAZARD_V3, the rat that escapes: a rat that reaches its hole without having been scared and without loot takes one item from the counter nearest to its hole (ready dishes first).
// Pure and deterministic: candidates are ordered by (is it a dish, distance to the hole, station index); no stream. At most one loss per `lossGapMs` (anti-frustration); Easy never loses an item.
import type { Game, Item } from '../round/state';
import type { Mid, Rat } from '../rules/midround';
import { hz3Params } from '../hazards/hazard-v3';
import { isDish } from '../recipes/defs';
import { book } from '../hazards/score-ledger';

/** Bonus (in tiles of distance) a ready dish gets in the rat's choice of counter: it goes for the pizza first. */
export const DISH_PULL = 2;
export const ratPull = (g: Game, item: Item | null): number => (g.hz3 && isDish(item) ? DISH_PULL : 0);

/** The station index of the item an escaping rat would take, or -1. */
export function escapeLoot(g: Game, r: Rat): number {
  let best = -1,
    key: [number, number] = [Infinity, Infinity];
  g.stations.forEach((s, i) => {
    if (s.kind !== 'counter' || !s.item || s.fire !== undefined) return;
    const k: [number, number] = [isDish(s.item) ? 0 : 1, Math.hypot(s.tx + 0.5 - (r.hole[0] + 0.5), s.ty + 0.5 - (r.hole[1] + 0.5))];
    if (k[0] < key[0] || (k[0] === key[0] && k[1] < key[1])) {
      best = i;
      key = k;
    }
  });
  return best;
}

/** Called when the rat leaves. Returns true when it took something with it (the caller reports `stolen`). */
export function stealOnEscape(g: Game, m: Mid, r: Rat): boolean {
  const hz = hz3Params(g);
  if (!hz.rat.stealOnEscape || r.scared || r.item || (g.versus && !g.vz3)) return false;
  if (g.time - (m.lossAt ?? -Infinity) < hz.lossGapMs) return false;
  const i = escapeLoot(g, r);
  if (i < 0) return false;
  const s = g.stations[i]!;
  const item = s.item!;
  s.item = null;
  m.lossAt = g.time;
  g.bus.emit('rat:steal', { station: i, item });
  book(g, 'hazard:rat-escape', 0);
  return true;
}
