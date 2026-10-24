// Pure layout helpers (no Phaser): ticket strip and clock text.
export const TICKET_WIDTH = 128;
const TICKET_GAP = 10;
export const MAX_TICKETS = 6; // R23: no more than six on screen (the queue is 6 at most, with 8 players)
export const TICKET_SHAKE_AT = 0.2; // R23: a ticket starts to tremble with 20% of its patience left
const TICKET_X0 = 28;
const TICKET_MAX_X = 872; // clock sits at 960 +- 56

// Left edge of each ticket: normal spacing, overlapped when the strip is full.
export function ticketXs(n: number): number[] {
  if (n <= 0) return [];
  const step = n === 1 ? 0 : Math.min(TICKET_WIDTH + TICKET_GAP, (TICKET_MAX_X - TICKET_X0 - TICKET_WIDTH) / (n - 1));
  return Array.from({ length: n }, (_, i) => TICKET_X0 + i * step);
}
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

