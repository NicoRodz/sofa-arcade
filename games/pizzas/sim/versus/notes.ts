// The line under a draw on the results screen. A 0 a 0 where nobody delivered is not a "perfect tie" of anything: it says what happened.
export const drawNote = (delivered: readonly number[]): string =>
  delivered.every((d) => d === 0)
    ? 'Nadie entregó ningún pedido'
    : 'Empate perfecto: puntaje, entregas, pedidos dorados y hasta el momento en que lo lograron';
