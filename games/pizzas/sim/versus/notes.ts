// The line under the verdict on the results screen (HTML: the margin is bold). A 0 a 0 where nobody delivered is not a "perfect tie" of
// anything: it says what happened.
import { DECIDED_TEXT, type VersusReport } from './report';

export const drawNote = (delivered: readonly number[]): string =>
  delivered.every((d) => d === 0)
    ? 'Nadie entregó ningún pedido'
    : 'Empate perfecto: puntaje, entregas, pedidos dorados y hasta el momento en que lo lograron';

export const resultNote = (
  rep: Pick<VersusReport, 'verdict' | 'decidedBy' | 'margin'> & { teams: readonly { delivered: number }[] },
): string =>
  rep.verdict === 'win'
    ? rep.decidedBy === 'score'
      ? `Ganaron por <b>${rep.margin}</b> ${rep.margin === 1 ? 'punto' : 'puntos'}`
      : DECIDED_TEXT[rep.decidedBy ?? 'score']
    : rep.verdict === 'draw'
      ? drawNote(rep.teams.map((t) => t.delivered))
      : rep.verdict === 'aborted'
        ? 'El anfitrión terminó la partida'
        : 'El anfitrión siguió sin ganador';
