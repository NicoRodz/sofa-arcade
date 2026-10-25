// Surfaces against the solver: ice and belts are floor (they never block, so every region and route is found as before), and a belt must never
// carry a chef or a loose item somewhere it cannot come back from: it feeds floor, another belt or a station, never a wall, water, the edge, or a belt facing it.
import type { Grid, Pos } from '../maps';

export function surfaceProblems(g: Grid): string[] {
  const errors: string[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'floor' || t.surface?.kind !== 'belt') return;
      const { dx, dy } = t.surface;
      const next = g[y + dy]?.[x + dx];
      const at = `belt at (${x}, ${y})`;
      if (!next || next.kind === 'wall' || next.kind === 'water') errors.push(`${at} feeds ${next?.kind ?? 'the edge of the map'}`);
      else if (next.kind === 'floor' && next.surface?.kind === 'belt' && next.surface.dx === -dx && next.surface.dy === -dy)
        errors.push(`${at} faces another belt head on`);
    }),
  );
  return errors;
}

/** Floor belt tiles and ice tiles of a grid (for tests and the lobby: how much of the kitchen moves). */
export function surfaceTiles(g: Grid): { ice: Pos[]; belts: Pos[] } {
  const out = { ice: [] as Pos[], belts: [] as Pos[] };
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.surface) (t.surface.kind === 'ice' ? out.ice : out.belts).push([x, y]);
    }),
  );
  return out;
}
