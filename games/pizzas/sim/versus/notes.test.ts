// QA versus 31-oct C1: a 0 a 0 without deliveries said "Empate perfecto: puntaje, entregas, pedidos dorados...".
import { expect, it } from 'vitest';
import { drawNote } from './notes';

it('a draw with deliveries keeps the perfect-tie line; a draw where nobody delivered says so', () => {
  expect(drawNote([3, 3])).toMatch(/^Empate perfecto/);
  expect(drawNote([0, 2])).toMatch(/^Empate perfecto/);
  expect(drawNote([0, 0])).toBe('Nadie entregó ningún pedido');
});
