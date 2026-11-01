import type { Game, Player } from './state';

// The event that ends what a chef's Picar was doing: putting a fire out, scrubbing plates at a sink, or chopping.
export const stopKind = (g: Game, p: Player) =>
  p.dousing
    ? 'douseStop'
    : g.stations[p.chopAt]?.kind === 'sink' || g.stations[p.chopAt]?.kind === 'saucepot'
      ? 'washStop'
      : g.stations[p.chopAt]?.kind === 'pot'
        ? 'foldStop'
        : 'chopStop';
