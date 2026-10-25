// Versus with the magnetism on: the two kitchens are each other's isometry and the scripted chefs play mirrored, so the round must still tie EXACTLY (golden/mirror-bot.ts).
// The target by score has no tie-break by station order that could favour one side; this proves it on a mirror (V1) and a rotation (V3), with and without the other rules.
import { describe, expect, it } from 'vitest';
import { MIRRORS, runVersus } from './golden/mirror-bot';

const strip = (bus: { log: string[] }, team: number) =>
  bus.log
    .map((l) => l.split('|'))
    .filter(([, , p]) => (JSON.parse(p!) as { team?: number }).team === team)
    .map(([tk, type, p]) => {
      const o = JSON.parse(p!) as Record<string, unknown>;
      delete o.team;
      delete o.player;
      delete o.station;
      delete o.tie;
      return `${tk}|${type}|${JSON.stringify(o)}`;
    });

describe('the mirror proof with magnetism', () => {
  const cases = [
    {
      name: 'V1 3v3 Normal',
      m: MIRRORS.v1,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      difficulty: 'normal' as const,
      flags: { magnet: true as const },
    },
    {
      name: 'V1 2v2 Easy (strong magnet)',
      m: MIRRORS.v1,
      teams: [
        [1, 2],
        [3, 4],
      ],
      difficulty: 'easy' as const,
      flags: { magnet: 'strong' as const },
    },
    {
      name: 'V3 2v2 Normal with burn, fire and events',
      m: MIRRORS.v3,
      teams: [
        [1, 2],
        [3, 4],
      ],
      difficulty: 'normal' as const,
      flags: { magnet: true as const, burn: true, fire: true, events: true },
    },
  ];
  for (const c of cases)
    it(`${c.name}: both teams end tied, event for event`, () => {
      const r = runVersus({ ...c.m, difficulty: c.difficulty, seed: 7, teams: c.teams, flags: c.flags });
      const [a, b] = r.g.teams;
      expect(a!.delivered).toBeGreaterThanOrEqual(4); // a tie at zero proves nothing
      expect([b!.score, b!.delivered, b!.expired, b!.tips, b!.bestStreak, b!.reachedAt]).toEqual([
        a!.score,
        a!.delivered,
        a!.expired,
        a!.tips,
        a!.bestStreak,
        a!.reachedAt,
      ]);
      expect(strip(r.bus, 1)).toEqual(strip(r.bus, 0));
      expect(r.g.magnet).not.toBeNull();
    });
  it('V1 3v3 with the Carta del día (calzone folded at the oven) and every lobby rule on: still an exact tie, three seeds', () => {
    for (const seed of [2, 7, 11]) {
      const r = runVersus({
        ...MIRRORS.v1,
        mapId: 'V1',
        difficulty: 'normal',
        seed,
        teams: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        flags: { recipes: true, magnet: true, burn: true, fire: true, events: true },
      });
      expect(strip(r.bus, 1), `seed ${seed}`).toEqual(strip(r.bus, 0));
      const [a, b] = r.g.teams;
      expect(a!.delivered, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect([b!.score, b!.delivered, b!.reachedAt], `seed ${seed}`).toEqual([a!.score, a!.delivered, a!.reachedAt]);
      expect(
        r.bus.log.some((l) => l.includes('|foldDone|')),
        `seed ${seed}: a calzone was folded`,
      ).toBe(true);
    }
  });
  it('the flag is live in the round: the same seed without it is a different round', () => {
    const on = runVersus({
      ...MIRRORS.v1,
      difficulty: 'normal',
      seed: 7,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      flags: { magnet: true },
    });
    const off = runVersus({
      ...MIRRORS.v1,
      difficulty: 'normal',
      seed: 7,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    expect(on.bus.log).not.toEqual(off.bus.log);
  });
});
