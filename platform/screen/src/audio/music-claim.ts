// A game with music of its own claims its lobby and results: the shell's default (Pizzas' tarantela, which plays in every lobby) stays quiet for it.
// Created on first use, not when the module loads.
let claimed: Set<string> | undefined;

export function claimMusic(gameId: string): void {
  claimed ??= new Set();
  claimed.add(gameId);
}
export const musicClaimed = (gameId: string): boolean => claimed?.has(gameId) ?? false;

/** The phase a game's own music should see: while another game that claimed its music has the lobby or the results, "playing" (and not started, so: silence). */
export function phaseFor<P extends string>(phase: P, pickedGame: string, ownGame: string): P | 'playing' {
  return (phase === 'lobby' || phase === 'results') && pickedGame !== ownGame && musicClaimed(pickedGame) ? 'playing' : phase;
}
