// The four surface maps over the real relay: two phones are websockets driven by the cooking bot, a Node "screen" hosts the sim with `surfaces` on
// (what the lobby does when a map uses them). A round on each map must deliver pizzas, and the surfaces must have been felt (slide / belt events).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server';
import { kit, playRound } from './rules-kit';

beforeAll(async () => {
  kit.srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await kit.srv.close();
});

describe('a bot cooks on every surface map', () => {
  const maps: [string, string][] = [
    ['16', 'surface:slide'],
    ['17', 'surface:belt'],
    ['18', 'surface:slide'],
    ['19', 'surface:belt'],
  ];
  for (const [map, event] of maps)
    it(`map ${map} delivers over the relay and fires ${event}`, async () => {
      const r = await playRound(`sf${map}`, { roles: ['cook', 'cook'], seconds: 120, map, difficulty: 'easy', flags: { surfaces: true } });
      expect(r.game.surf).not.toBeNull();
      expect(r.of(event).length).toBeGreaterThan(0);
      expect(r.of('delivered').length).toBeGreaterThanOrEqual(2);
      r.close();
    }, 180_000);
});
