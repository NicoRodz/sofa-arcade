// What the how-to card shows at a given moment, as plain data: the template (view.ts) only draws it.
import { isExpired, progress, secondsLeft, type HowToState } from '../../howto';

export interface HowToView {
  game: string;
  bodyHtml: string;
  showBar: boolean;
  fillWidth: string;
  seconds: number | null; // seconds left, shown only by the start card
}

// null when the start card ran out (the caller starts the round instead of drawing it).
export function howToView(state: HowToState, now: number, game: string, bodyHtml: string): HowToView | null {
  if (isExpired(state, now)) return null;
  const start = state.mode === 'start';
  return {
    game,
    bodyHtml,
    showBar: start,
    fillWidth: start ? `${(progress(state.startedAt, now) * 100).toFixed(1)}%` : '0',
    seconds: start ? secondsLeft(state.startedAt, now) : null,
  };
}
