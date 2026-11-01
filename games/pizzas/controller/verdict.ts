// Versus results on the phone: the verdict and the score of this phone's own team (the screen sends every team's; the phone picks its own).
import { outcomeFor, type Outcome, type PhoneResult } from '@pichi/game-pizzas/sim/versus/report';

const VERDICT_TEXT: Record<Outcome, string> = { won: '¡Ganaron!', lost: 'Perdieron', draw: '¡Empate!', none: 'Sin ganador' };

/** Overwrites the coop score with the own team's when the round was a versus one; clears `data-outcome` otherwise. */
export function showVerdict(result: PhoneResult | undefined, myTeam: number | null) {
  const $ = (id: string) => document.getElementById(id)!;
  const outcome = result ? outcomeFor(result, myTeam) : null;
  const own = result && myTeam !== null ? result.scores.find((x) => x.team === myTeam) : undefined;
  if (outcome && own) {
    $('rank').textContent = String(own.score);
    $('myscore').textContent = 'puntos de tu equipo';
    $('verdict').textContent = VERDICT_TEXT[outcome];
    document.body.dataset.outcome = outcome;
  } else delete document.body.dataset.outcome;
}
