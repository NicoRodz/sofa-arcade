// The lobby rows that take focus, top to bottom, as DOM ids (index.html): the platform's (difficulty, how-to, start) and the ones each game paints
// (Pizzas: mode, sabotage, events, mutation, map, team buttons; Obstaculos: mode, level). A row whose box is hidden (`.off`) or empty is skipped.
export interface RowSpec {
  id: string;
  root: string; // element id holding the items
  items: string; // selector of the focusable items inside it
  live: boolean; // left/right picks the neighbour at once (a segmented choice); false: they only move the cursor, Enter picks
  start?: boolean;
}

export const LOBBY_ROWS: readonly RowSpec[] = [
  { id: 'diffs', root: 'diffs', items: '[data-diff]', live: true },
  { id: 'obstmodes', root: 'obstmodes', items: '[data-tether]', live: true },
  { id: 'modes', root: 'modes', items: '[data-mode]', live: true },
  { id: 'sabs', root: 'sabs', items: '[data-sab]', live: true },
  { id: 'evs', root: 'evs', items: '[data-ev]', live: true },
  { id: 'muts', root: 'muts', items: '[data-mut]', live: true },
  { id: 'maps', root: 'maps', items: '[data-map]', live: false },
  { id: 'obstlevels', root: 'obstlevels', items: '[data-level]', live: false },
  { id: 'teambar', root: 'teambar', items: 'button', live: false },
  { id: 'howto', root: 'howtobtn', items: ':scope', live: false },
  { id: 'start', root: 'start', items: ':scope', live: false, start: true },
];
