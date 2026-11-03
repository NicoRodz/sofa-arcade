import { describe, expect, it } from 'vitest';
import { ARCHETYPES, archetypeOf, generateMap, type Archetype, type TileMap } from '../../map';
import { createGrid, stepGrid } from '../../sim';
import { RouteBot } from '../route-bot';

const SEEDS = Array.from({ length: 400 }, (_, i) => (i * 3359 + 17) % 33_554_432);
const MAX_TICKS = 1500;

/** The route bot walks from an exit of team 0 to its mirror image (the exit of team 1) through the real grid sim; returns the ticks it took (null: it never got there). */
function cross(map: TileMap, from: readonly [number, number]): number | null {
  const s = createGrid({ slots: [0], map, durationTicks: 10 ** 9 });
  const b = s.bodies[0]!;
  b.x = from[0] * 16 + 8;
  b.y = from[1] * 16 + 8;
  const bot = new RouteBot([[map.w - 1 - from[0], from[1]]], map);
  for (let t = 0; t < MAX_TICKS; t++) {
    if (bot.done) return t;
    stepGrid(s, new Map([[0, bot.input(b)]]));
  }
  return null;
}

describe.each(ARCHETYPES)('the bot plays %s', (kind: Archetype) => {
  it('walks from each exit of team 0 to its mirror exit across the middle line in under 25 s, on 3 seeds', () => {
    for (const seed of SEEDS.filter((s) => archetypeOf(s) === kind).slice(0, 3)) {
      const g = generateMap(seed);
      expect(g.archetype).toBe(kind);
      for (const exit of g.map.spawns[0]!) {
        const ticks = cross(g.map, exit as [number, number]);
        expect(ticks, `seed ${seed} exit ${exit}`).not.toBeNull();
      }
    }
  });
});
