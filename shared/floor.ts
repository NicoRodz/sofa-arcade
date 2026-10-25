// Things on the floor (sabotage S1): rubbish that makes chefs slip and the items a chef dropped when it slipped. Pure helpers on the
// game's `floor` list; the sim (overcooked.ts) and the sabotage rules (sabotage.ts) both use them, so they live apart to keep the imports acyclic.
import { SLIP_TRIGGER, type FloorItem } from './sabotage-config';
import type { Game } from './overcooked';

type Host = Pick<Game, 'floor' | 'players' | 'time'>;

/** A new floor item. Chefs that already stand on the tile of a rubbish item are marked as "inside": slipping counts ENTERING, not being there. */
export function addFloorItem(
  g: Host & { floorSeq: number },
  o: Pick<FloorItem, 'tx' | 'ty' | 'item' | 'kind' | 'team'> & { by?: number | null; ttlMs?: number },
): FloorItem {
  const f: FloorItem = {
    id: g.floorSeq++,
    tx: o.tx,
    ty: o.ty,
    item: o.item,
    kind: o.kind,
    team: o.team,
    by: o.by ?? null,
    bornAt: g.time,
    expiresAt: o.ttlMs === undefined ? Infinity : g.time + o.ttlMs,
  };
  g.floor.push(f);
  if (f.kind === 'trash')
    for (const p of g.players.values()) {
      if (p.ghost || Math.hypot(p.x - (f.tx + 0.5), p.y - (f.ty + 0.5)) > SLIP_TRIGGER) continue;
      (p.inTrash ??= []).push(f.id);
    }
  return f;
}

export function removeFloorItem(g: Host, id: number): FloorItem | null {
  const i = g.floor.findIndex((f) => f.id === id);
  if (i < 0) return null;
  const [f] = g.floor.splice(i, 1);
  for (const p of g.players.values()) if (p.inTrash) p.inTrash = p.inTrash.filter((x) => x !== id);
  return f!;
}

/** Rubbish items (the ones that make chefs slip) in one kitchen. */
export const pilesIn = (g: Pick<Game, 'floor'>, team: number) =>
  g.floor.reduce((n, f) => n + (f.kind === 'trash' && f.team === team ? 1 : 0), 0);
