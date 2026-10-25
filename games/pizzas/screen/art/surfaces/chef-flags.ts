// The per-chef flags of the rig that the round decides: the Ayudante propeller, and the skate pose while the chef stands on ice.
import type { Game, Player } from '../../../sim/round/state';
import { surfaceAt } from '../../../sim/surfaces/physics';

export function chefFlags(g: Game, gp: Player): { assist?: true; skate?: true } {
  return {
    ...(gp.assist ? { assist: true as const } : {}),
    ...(g.surf && surfaceAt(g, gp.x, gp.y)?.kind === 'ice' ? { skate: true as const } : {}),
  };
}
