// Heavy tray (design section 2, "Bandeja pesada"): the shared reads of the module. There is no tray object in the kitchen (the Bandeja familiar is a ticket of three plates, recipes/bandeja.ts), so a chef
// "carries the tray" while it holds a plate that fills a free slot of an open Bandeja ticket of its team. Everything is an integer except the stick (a float, as always).
import type { Game, Player } from '../../round/state';
import { isDish } from '../../recipes/defs';
import { partSlot } from '../../recipes/bandeja';

export const CARRY_PERMIL = 450; // the stick of the carrier counts x0.45 on its own
export const COUPLED_PERMIL = 1000; // coupled: the average of the two sticks at full pace
export const COUPLE_REACH = 1.3; // tiles between the centres for a helper to take the other end
export const RELEASE_DIST = 2; // farther than this (a wall came between them) and the helper lets go by itself
export const BRIDGE_WEAR = 3; // a step onto a bridge with the tray counts this much (a plain step counts 1)

interface TrayExt {
  sticks: Record<number, [number, number]>; // the raw stick of every chef this tick, read by the `controls` hook
}
export const trayExt = (g: Game) => g.mech!.ext!.heavyTray as TrayExt;
export const startTrayExt = (g: Game) => {
  g.mech!.ext = { ...g.mech!.ext, heavyTray: { sticks: {} } satisfies TrayExt };
};

/** Does this chef hold a plate of an open Bandeja of its team? */
export function carriesTray(g: Game, p: Player): boolean {
  if (p.ghost || !isDish(p.item)) return false;
  return !!g.teams[p.team]?.orders.some((o) => partSlot(o, p.item!) >= 0);
}
/** The tray rules apply to this chef (heavy flag on and it carries). Read by the bridge. */
export const carriesHeavy = (g: Game, p: Player): boolean => !!g.flags?.mech.heavyTray && !!g.mech?.tray && carriesTray(g, p);
/** Are these two chefs the coupled pair? */
export const coupled = (g: Game, a: number, b: number): boolean => {
  const t = g.mech?.tray;
  return !!t && t.carrier !== null && t.helper !== null && ((t.carrier === a && t.helper === b) || (t.carrier === b && t.helper === a));
};
