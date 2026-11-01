// VERSUS_V3 ice: the patch is the same in both kitchens (each tile of one is the twin of a tile of the other), only floor turns to ice, and the lobby applies it.
import { describe, expect, it } from 'vitest';
import { VERSUS_BASE_MAPS } from './maps';
import { iceRows } from './ice-patch';
import { isometryCheck } from '../symmetry';
import { MAP_H, MAP_W } from '../maps';
import { SIGMAS } from '../symmetry';
import { createVersusGame } from './lobby';
import type { Game } from '../overcooked';

const iceTiles = (rows: readonly string[]) =>
  rows.flatMap((r, y) => [...r].flatMap((c, x): [number, number][] => (c === 'i' ? [[x, y]] : [])));

describe('versus ice patch', () => {
  for (const m of VERSUS_BASE_MAPS)
    it(`${m.id}: a patch of ice, twin in both kitchens, floor only`, () => {
      const rows = iceRows(m.rows, m.versus.sigma);
      const ice = iceTiles(rows);
      expect(ice.length).toBeGreaterThanOrEqual(2);
      expect(ice.length % 2).toBe(0);
      expect(isometryCheck(rows, SIGMAS[m.versus.sigma]).s).toBe(isometryCheck(m.rows, SIGMAS[m.versus.sigma]).s); // as symmetric as the map it came from
      for (const [x, y] of ice) {
        expect(m.rows[y]![x], `${m.id} ${x},${y} was floor`).toBe('.');
        const [tx, ty] = SIGMAS[m.versus.sigma](x, y, MAP_W, MAP_H);
        expect(rows[ty]![tx]).toBe('i');
      }
      // everything but the ice is as it was
      expect(rows.map((r) => r.replaceAll('i', '.'))).toEqual(m.rows.map((r) => r.replaceAll('i', '.')));
      expect(iceRows(m.rows, m.versus.sigma)).toEqual(rows); // deterministic
    });

  it('the lobby round has the ice in both kitchens, equal in number, and the surfaces on', () => {
    for (const m of VERSUS_BASE_MAPS) {
      const g: Game = createVersusGame({
        map: { id: m.id, name: m.name, rows: m.rows, spawns: m.versus.spawns.flat(), sigma: m.versus.sigma, shared: m.versus.shared },
        difficulty: 'normal',
        seed: 5,
        teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }] as never,
        modeOptions: {},
        slotOf: (id: number) => id - 1,
      } as never);
      const per = [0, 0];
      g.grid.forEach((row, y) =>
        row.forEach((t, x) => {
          if (t.kind === 'floor' && t.surface?.kind === 'ice') per[g.kitchens!.comp[y]![x] === g.kitchens!.regions[0] ? 0 : 1]!++;
        }),
      );
      expect(per[0], m.id).toBeGreaterThanOrEqual(2);
      expect(per[1], m.id).toBe(per[0]);
      expect(g.surf).not.toBeNull();
    }
  });
});
