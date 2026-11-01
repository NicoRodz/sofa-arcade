// Versus: each kitchen's floor takes its team's colour, with the team's glyph big and faint in the middle (colour alone never says whose it is).
// The tint is a flat wash plus a stripe of the team's colour along the barrier, so even from the sofa the two halves read as two teams.
// Returns the floor tiles of each kitchen (tile centres): the finale picks its confetti from them.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import { TILE, hexNum } from '@pichi/screen-kit/art';
import { OX, OY } from './grid';
import { makeText } from '@pichi/screen-kit/art/fx';
import type { RoundView } from '../hud/hud';

export function tintKitchens(scene: Phaser.Scene, game: Game, view: RoundView): [number, number][][] {
  const kitchenTiles: [number, number][][] = [];
  const k = game.kitchens;
  if (!k) return kitchenTiles;
  const g = scene.add.graphics().setDepth(1);
  view.teams!.forEach((team, i) => {
    const region = k.regions[i];
    const tiles: [number, number][] = [];
    g.fillStyle(hexNum(team.color), 0.24);
    k.comp.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== region) return;
        g.fillRect(OX + x * TILE, OY + y * TILE, TILE, TILE);
        tiles.push([x + 0.5, y + 0.5]);
      }),
    );
    kitchenTiles[i] = tiles;
    if (!tiles.length) return;
    // the glyph sits on the floor tile closest to the middle of the kitchen (never over a counter island)
    const mx = tiles.reduce((a, t) => a + t[0], 0) / tiles.length,
      my = tiles.reduce((a, t) => a + t[1], 0) / tiles.length;
    const [gx, gy] = tiles.reduce((a, t) => (Math.hypot(t[0] - mx, t[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? t : a));
    makeText(scene, OX + gx * TILE, OY + gy * TILE, team.icon, { size: 150, color: team.color, stroke: 0, depth: 2 }).setAlpha(0.3);
  });
  // a stripe along every edge where a kitchen's floor meets something that is not its own floor and not a counter: the barrier
  const edge = scene.add.graphics().setDepth(2);
  view.teams!.forEach((team, i) => {
    edge.fillStyle(hexNum(team.color), 0.9);
    for (const [cx, cy] of kitchenTiles[i] ?? []) {
      const x = Math.floor(cx),
        y = Math.floor(cy);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const t = game.grid[y + dy]?.[x + dx];
        if (t?.kind !== 'wall') continue; // only the barrier and the outer wall, not the stations
        const px = OX + x * TILE,
          py = OY + y * TILE,
          w = 8;
        if (dx === 1) edge.fillRect(px + TILE - w, py, w, TILE);
        else if (dx === -1) edge.fillRect(px, py, w, TILE);
        else if (dy === 1) edge.fillRect(px, py + TILE - w, TILE, w);
        else edge.fillRect(px, py, TILE, w);
      }
    }
  });
  return kitchenTiles;
}
