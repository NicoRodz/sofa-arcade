// Rescue and Loot's slot in the tick: after the drops and before the stains count down, so a rescue that completes on the tick the stain would have ended wins (no footprints).
// Both passes read the snapshot of the tick and apply afterwards: nothing depends on the order of the bodies, so the rules are the same on both sides of the map.
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { cardOf } from '../sabotage/state';
import { dist } from '../sabotage/near';
import { lootTile } from './loot';
import { LOOT_LOCK_TICKS, LOOT_TICKS, RESCUE_GLOW_TICKS, RESCUE_TICKS } from './config';

function stepContact(s: ManchazoState): void {
  const m = s.match;
  const r = m.res!;
  const bodies = s.grid.bodies;
  const tiles = bodies.map((b, i) => bodyTile(b, m.bodies[i]!.face));
  const stained = m.bodies.map((bm) => bm.stun > 0);
  const freed: { i: number; by: number[] }[] = [];
  bodies.forEach((b, i) => {
    if (!stained[i]) {
      r.contact[i] = 0;
      return;
    }
    const by = bodies.flatMap((o, j) => (j !== i && !stained[j] && o.team === b.team && dist(tiles[i]!, tiles[j]!) <= 1 ? [j] : []));
    if (by.length === 0) {
      r.contact[i] = 0; // contact broken: the count starts over
      return;
    }
    if (++r.contact[i]! >= RESCUE_TICKS) freed.push({ i, by });
  });
  for (const { i, by } of freed) {
    const bm = m.bodies[i]!;
    bm.stun = 0; // free at once; the rival footprints that follow a stain that ends on its own never start (the countdown only starts them when it reaches 0)
    r.contact[i] = 0;
    for (const k of [i, ...by]) r.glow[k] = RESCUE_GLOW_TICKS;
    r.log.push({ kind: 'rescue', tick: s.grid.tick, body: i, x: tiles[i]![0], y: tiles[i]![1], card: null });
  }
}

function stepLoot(s: ManchazoState): void {
  const m = s.match;
  const r = m.res!;
  const a = m.sab;
  if (!a || r.loot.length === 0) return;
  for (const l of [...r.loot]) {
    l.age++;
    if (l.age > LOOT_TICKS) {
      r.loot.splice(r.loot.indexOf(l), 1);
      const p = a.pickups[l.from];
      // back to its spawner if it is still empty and still waiting for this very card; otherwise the card is gone
      if (p && p.wait > 0 && p.drawn > 0 && cardOf(a, { ...p, drawn: p.drawn - 1 }) === l.kind) {
        p.drawn--;
        p.wait = 0;
      }
      r.log.push({ kind: 'expire', tick: s.grid.tick, body: l.owner, x: l.x, y: l.y, card: l.kind });
    } else if (s.grid.map.solid[l.y * s.grid.map.w + l.x]) {
      const b = s.grid.bodies[l.owner]!; // a Mudanza shut its tile: it slides to the nearest valid one
      [l.x, l.y] = lootTile(s, r, l.x, l.y, b.team, l);
    }
  }
  const tiles = s.grid.bodies.map((b, i) => bodyTile(b, m.bodies[i]!.face));
  const takes = r.loot.flatMap((l, k) => {
    const who = s.grid.bodies.flatMap((_b, i) =>
      m.bodies[i]!.stun === 0 &&
      a.held[i] === null &&
      tiles[i]![0] === l.x &&
      tiles[i]![1] === l.y &&
      (i !== l.owner || l.age >= LOOT_LOCK_TICKS)
        ? [i]
        : [],
    );
    return who.length === 1 ? [{ k, i: who[0]! }] : []; // two bodies on it in the same tick: nobody gets it
  });
  for (const { i, k } of takes) {
    const l = r.loot[k]!;
    a.held[i] = l.kind;
    r.from[i] = l.from;
    r.log.push({ kind: 'take', tick: s.grid.tick, body: i, x: l.x, y: l.y, card: l.kind });
  }
  if (takes.length) r.loot = r.loot.filter((_l, k) => !takes.some((t) => t.k === k));
}

export function stepRescue(s: ManchazoState): void {
  const r = s.match.res;
  if (!r) return;
  r.glow.forEach((g, i) => g > 0 && r.glow[i]!--);
  stepContact(s);
  stepLoot(s);
}
