// The per-chef flags of the rig that the round decides: the Ayudante propeller, the skate pose while the chef stands on ice, and (HAZARD_V3 raft) the lift of the name plate of a chef that shares its tile.
import type { Game, Player } from '../../../sim/round/state';
import { surfaceAt } from '../../../sim/surfaces/physics';

const PLATE_STEP = 34; // logical px, a little over the height of a plate

/** Two chefs on one raft tile (noCollide) would wear their plates on top of each other: the one with the higher id wears it one step lower. */
function plateLift(g: Game, gp: Player): number {
  if (!g.flags?.mech.raft || gp.ghost) return 0;
  const [tx, ty] = [Math.floor(gp.x), Math.floor(gp.y)];
  let before = 0;
  for (const o of g.players.values()) if (o.id < gp.id && !o.ghost && Math.floor(o.x) === tx && Math.floor(o.y) === ty) before++;
  return before * PLATE_STEP;
}

export function chefFlags(g: Game, gp: Player): { assist?: true; skate?: true; tagLift?: number } {
  const lift = plateLift(g, gp);
  return {
    ...(gp.assist ? { assist: true as const } : {}),
    ...(g.surf && surfaceAt(g, gp.x, gp.y)?.kind === 'ice' ? { skate: true as const } : {}),
    ...(lift ? { tagLift: lift } : {}),
  };
}
