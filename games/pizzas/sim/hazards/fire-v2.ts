// The fire of HAZARD_V2 (only in a round whose Burn carries `v2`): small fires need a few chef-seconds with a cap on how many chefs add up; a BIG fire (a pure function of the
// kitchen's local fire index, see hazard-v2.ts) only progresses while two chefs hold Picar at once. One chef alone only CONTAINS it: the spread timer waits, the fire stays.
// Picar no longer progresses inside the chef's own step: the chefs in front of a flame register (`registerDouse`) and `fireDouseTick` settles the tick once all of them did.
import type { FireV2 } from '../rules/types';
export type { FireV2 } from '../rules/types';
import type { Game, Station } from '../round/state';
import type { Burn } from '../rules/types';

export const newFireV2 = (seed: number, bigOk: boolean, teams: number): FireV2 => ({
  seed,
  bigOk,
  dousers: new Map(),
  count: Array.from({ length: teams }, () => 0),
});

/** Chef-ms of Picar that put this station out (a small fire: the table's value; a big one: its own). */
export function fireNeedMs(b: Burn, k: number): number {
  const f = b.fires[k];
  return !b.v2 ? 3000 : f?.big ? b.v2.params(k).bigMs : b.v2.params(k).smallMs;
}

export function registerDouse(g: Game, playerId: number, at: number) {
  const m = g.burn!.v2!.dousers;
  const list = m.get(at);
  if (!list) m.set(at, [playerId]);
  else if (!list.includes(playerId)) list.push(playerId);
}

/** Settle one tick: progress (or decay) of every flame, the containment of a big fire, the stations that go out. `out` puts one out (burn.ts). */
export function fireDouseTick(g: Game, dtMs: number, kitchenOf: (s: Station) => number, out: (playerId: number, s: Station) => void) {
  const b = g.burn!;
  const v2 = b.v2!;
  const contained = new Set<number>();
  g.stations.forEach((s, at) => {
    if (s.fire === undefined) return;
    const k = kitchenOf(s);
    const p = v2.params(k);
    const fire = b.fires[k];
    const who = v2.dousers.get(at) ?? [];
    const n = who.length;
    if (!fire?.big) {
      s.fire += dtMs * Math.min(n, p.smallCap);
    } else {
      if (n >= 1) contained.add(k);
      if (n >= p.bigMin) s.fire += dtMs * Math.min(n, p.bigCap);
      else if (p.bigSoloDecay > 0) s.fire = Math.max(0, s.fire - dtMs * p.bigSoloDecay);
    }
    if (s.fire >= fireNeedMs(b, k)) out(who[0] ?? -1, s);
  });
  for (const k of contained) {
    const f = b.fires[k];
    if (f) f.spreadAt += dtMs; // a chef in front of the flames holds the jump back
  }
  v2.dousers.clear();
}
