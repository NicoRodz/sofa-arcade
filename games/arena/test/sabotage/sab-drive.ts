// Helpers for the sabotage tests: a duel with the sabotages on, a card put in a hand, the inputs of a tick.
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState, type SabotageKind } from '../../sim';

export const IDLE: ManchazoInput = { sx: 0, sy: 0, drop: false };
export const USE: ManchazoInput = { sx: 0, sy: 0, drop: false, use: true };
export const DROP: ManchazoInput = { sx: 0, sy: 0, drop: true };
export const stick = (sx: number, sy: number): ManchazoInput => ({ sx, sy, drop: false });

/** A round with the sabotages on, on the F0 map. Body i is on team teams[i] (default 0, 1, 0, 1...). */
export function round(teams: readonly number[] = [0, 1], seed = 5): ManchazoState {
  return createManchazo({ slots: teams.map((_t, i) => i), teams, seed, sabotage: true });
}
export const sab = (s: ManchazoState) => s.match.sab!;
export const give = (s: ManchazoState, i: number, kind: SabotageKind) => (sab(s).held[i] = kind);
export function put(s: ManchazoState, i: number, tx: number, ty: number) {
  s.grid.bodies[i]!.x = tx * 16 + 8;
  s.grid.bodies[i]!.y = ty * 16 + 8;
}
/** Steps n ticks with the same inputs by body index (the others idle). */
export function tick(s: ManchazoState, inputs: Record<number, ManchazoInput> = {}, n = 1) {
  for (let k = 0; k < n; k++) stepManchazo(s, new Map(Object.entries(inputs).map(([i, v]) => [s.grid.bodies[Number(i)]!.slot, v])));
}
export const owner = (s: ManchazoState, x: number, y: number) => s.match.paint[y * 27 + x]!;
export const tilesOf = (s: ManchazoState, team: number) => s.match.paint.reduce((n, v) => n + (v === team ? 1 : 0), 0);
/** The counts per team the sim keeps must equal the paint on the floor. */
export const countsAgree = (s: ManchazoState) => [0, 1].every((t) => s.match.counts[t] === tilesOf(s, t));
