// Pure layout helpers (no Phaser): ticket strip and clock text.
export const TICKET_WIDTH = 128;
const TICKET_GAP = 10;
export const MAX_TICKETS = 6; // R23: no more than six on screen (the queue is 6 at most, with 8 players)
export const TICKET_SHAKE_AT = 0.2; // R23: a ticket starts to tremble with 20% of its patience left
const TICKET_X0 = 28;
const TICKET_MAX_X = 872; // clock sits at 960 +- 56

// Left edge of each ticket: normal spacing, overlapped when the strip is full. Versus passes a narrower strip per team (x0..maxX).
export function ticketXs(n: number, x0 = TICKET_X0, maxX = TICKET_MAX_X): number[] {
  if (n <= 0) return [];
  const step = n === 1 ? 0 : Math.min(TICKET_WIDTH + TICKET_GAP, (maxX - x0 - TICKET_WIDTH) / (n - 1));
  return Array.from({ length: n }, (_, i) => x0 + i * step);
}
export const VS_TICKET_MAX_X = 596; // versus: each team's strip ends here (the right one is mirrored); the scoreboard sits between the strips and the clock
// Versus scoreboard: one plate per team either side of the clock (x of the left edge of each, in logical px, on a 1920 wide stage).
export const VS_PLATE = { w: 296, h: 84, y: 12, x: [610, 1014] as const };
export const VS_STAGE_W = 1920;
export const VS_CLOCK_HALF = 52; // the clock (88 px disc, ring inside) spans 44 px either side of the centre, plus a small gap

/**
 * Where the golden order card goes: the middle of the barrier between the kitchens. `centres` are the kitchens' centres (any unit); when they
 * differ more in x the barrier is a vertical wall and the card sits in its upper part (a pantry may fill the middle row, V2), otherwise it is
 * a horizontal wall and the card sits at its middle. Returns tile units: x in [0, 16], y in [0, 9].
 */
export function vipCardAt(centres: readonly { x: number; y: number }[], cols: number, rows: number): { x: number; y: number } {
  const xs = centres.map((c) => c.x),
    ys = centres.map((c) => c.y);
  const spreadX = Math.max(...xs) - Math.min(...xs),
    spreadY = Math.max(...ys) - Math.min(...ys);
  return spreadX >= spreadY ? { x: cols / 2, y: 2.5 } : { x: cols / 2, y: rows / 2 };
}
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
