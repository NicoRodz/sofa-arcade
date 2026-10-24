// Elastic ring (campaign dynamic 11, plan §4 "Cuerda elastica"): a ring marked 'u' in the level. A player anchored to it with B (like any ring) holds the rope link to its partner
// as a SPRING: the partner can fall / swing out to CampaignParams.bungeeMaxMult x the rope (1.6) and is pulled back with a bounce (sim/rope.ts ElasticParams does the physics;
// this file only says which links are elastic). Outside a campaign world a 'u' is a plain ring. N >= 3: every link of a cordada that touches an anchored elastic holder is elastic
// (the plan's "max 4 per cordada" is the level author's to keep: a cordada has at most 4 players).
import type { CampaignParams } from './campaign';
import type { ElasticParams } from './rope';
import { playerOf, isActive, type World } from './state';

export const elasticOf = (c: CampaignParams): ElasticParams => ({ max: c.bungeeMaxMult, stiffness: c.bungeeStiffness, damping: c.bungeeDamping });

// Is this player hanging its end of a rope from an elastic ring?
export function onBungee(w: World, slot: number): boolean {
  const p = playerOf(w, slot);
  return !!p && isActive(p) && p.holding?.kind === 'ring' && p.holding.id >= w.ent.bungeeFrom;
}

// Before the rope solves: a link is elastic while either end is anchored to an elastic ring.
export function markElastic(w: World): void {
  for (const r of w.ropes) for (const l of r.links) l.elastic = onBungee(w, l.a) || onBungee(w, l.b);
}

// The end of an elastic link that is NOT on the ring (the one that stretches).
export const stretchedEnd = (w: World, a: number, b: number): number => (onBungee(w, a) ? b : a);
