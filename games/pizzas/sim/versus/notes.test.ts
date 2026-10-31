// QA versus 31-oct C1: a 0 a 0 without deliveries said "Empate perfecto: puntaje, entregas, pedidos dorados...".
import { expect, it } from 'vitest';
import { drawNote, resultNote } from './notes';

it('a draw with deliveries keeps the perfect-tie line; a draw where nobody delivered says so', () => {
  expect(drawNote([3, 3])).toMatch(/^Empate perfecto/);
  expect(drawNote([0, 2])).toMatch(/^Empate perfecto/);
  expect(drawNote([0, 0])).toBe('Nadie entregó ningún pedido');
});

it('resultNote is what the results screen shows: the 0 a 0 draw says nobody delivered, the rest of the lines are unchanged', () => {
  const t = (...d: number[]) => d.map((delivered) => ({ delivered }));
  expect(resultNote({ verdict: 'draw', decidedBy: null, margin: 0, teams: t(0, 0) })).toBe('Nadie entregó ningún pedido');
  expect(resultNote({ verdict: 'draw', decidedBy: null, margin: 0, teams: t(2, 2) })).toMatch(/^Empate perfecto/);
  expect(resultNote({ verdict: 'win', decidedBy: 'score', margin: 1, teams: t(2, 1) })).toBe('Ganaron por <b>1</b> punto');
  expect(resultNote({ verdict: 'aborted', decidedBy: null, margin: 0, teams: t(0, 0) })).toBe('El anfitrión terminó la partida');
  expect(resultNote({ verdict: 'nowinner', decidedBy: null, margin: 0, teams: t(0, 0) })).toBe('El anfitrión siguió sin ganador');
});
