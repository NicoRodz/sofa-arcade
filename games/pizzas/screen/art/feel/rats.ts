// The rats on the floor by team: coop has the one (team 0); a versus round with VERSUS_V3 has one per kitchen (sim/feel/rat-versus.ts). The feel layers (rat-signal, rat-dodge) and the
// sprite (events/rat-view.ts) all read them from here, so a versus rat gets the same arrow, jump and panting as the coop one.
import type { Game } from '../../../sim/overcooked';
import type { Rat } from '../../../sim/rules/midround';

export const ratsOf = (g: Game): [number, Rat][] =>
  g.versus ? (g.mid?.rats ?? []).flatMap((m, team): [number, Rat][] => (m.rat ? [[team, m.rat]] : [])) : g.mid?.rat ? [[0, g.mid.rat]] : [];

export const ratOfTeam = (g: Game, team: number): Rat | undefined => ratsOf(g).find(([t]) => t === team)?.[1];
