// The mutating kitchen over the real relay: two bots cook on each of the three maps that mutate, the round crosses minute 1:30 (warn at 1:27, change at 1:30) and keeps delivering after it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server';
import { kit, playRound } from './rules-kit';

beforeAll(async () => {
  kit.srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await kit.srv.close();
});

describe('a bot keeps cooking through the mutation', () => {
  for (const map of ['1', '2', '4'])
    it(`map ${map}: warns at 1:27, changes at 1:30 and delivers after`, async () => {
      const r = await playRound(`mu${map}`, { roles: ['cook', 'cook'], seconds: 150, map, difficulty: 'easy', flags: { mutate: true } });
      const warn = r.of('mutate:warn'),
        apply = r.of('mutate:apply');
      expect(warn).toHaveLength(1);
      expect(apply).toHaveLength(1);
      expect(warn[0]!.t).toBeGreaterThanOrEqual(87_000);
      expect(apply[0]!.t).toBeGreaterThanOrEqual(90_000);
      expect(apply[0]!.t).toBeLessThan(90_200);
      expect(r.game.mut?.phase).toBe('done');
      expect(r.of('delivered').filter((d) => d.t > 90_000).length).toBeGreaterThanOrEqual(1);
      r.close();
    }, 240_000);
});
