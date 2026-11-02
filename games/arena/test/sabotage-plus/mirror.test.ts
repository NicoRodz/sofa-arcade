import { describe, expect, it } from 'vitest';
import { MAP_W } from '../../map';
import { PLUS_KINDS, createManchazo, hashManchazo, type ManchazoState } from '../../sim';
import { plus, playUses, put } from './plus-drive';

const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];

/** Every 20 ticks the next F8a card goes into the next body's hand when it is empty (or, every 80 ticks, whatever it holds: a refused card would block it). The schedule goes by body index, so a run and its mirror get the same. Remembers what ran. */
function feed(seen: Set<string>) {
  return (s: ManchazoState) => {
    const a = s.match.sab!;
    const p = a.plus!;
    const n = s.grid.bodies.length;
    if (s.grid.tick % 20 === 0) {
      const k = s.grid.tick / 20;
      const i = k % n;
      if (p.sponge[i] === 0 && (a.held[i] === null || k % 4 === 0))
        a.held[i] = PLUS_KINDS[(2 * Math.floor(k / n) + i) % PLUS_KINDS.length]!;
    }
    if (p.tapes.length) seen.add('tape');
    if (p.veil.some((v) => v > 0)) seen.add('ink');
    if (p.sponge.some((v) => v > 0)) seen.add('sponge');
    if (p.immune.some((v) => v > 0)) seen.add('swap');
    if (p.dizzy.some((v) => v > 0)) seen.add('dizzy');
  };
}

/** Everybody starts on row 0 within 8 tiles of each other, so rivals meet (the spawns are 26 tiles apart); the mirror run stands on the mirror tiles. */
const gather = (s: ManchazoState, flip: boolean) => s.grid.bodies.forEach((_b, i) => put(s, i, flip ? 26 - (10 + i) : 10 + i, 0));

describe('mirror with the F8a sabotages: swapping the teams swaps everything', () => {
  for (const [name, teams] of CASES)
    it(`${name}: paint, hidden tiles, tapes, sponges, dizziness and immunity mirror`, () => {
      const slots = teams.map((_t, i) => i);
      const seen = new Set<string>();
      for (const rs of [101, 202, 303, 404, 505, 606, 707, 808]) {
        const mk = (ts: number[]) => createManchazo({ slots, teams: ts, seed: 4, sabotage: true, sabotagePlus: true });
        const a = mk(teams);
        const b = mk(teams.map((t) => 1 - t));
        gather(a, false);
        gather(b, true);
        playUses(a, rs, 3000, false, 30, feed(seen));
        playUses(b, rs, 3000, true, 30, feed(new Set()));
        const [pa, pb] = [plus(a), plus(b)];
        expect(b.match.sab!.used).toBe(a.match.sab!.used);
        expect(b.match.sab!.held).toEqual(a.match.sab!.held);
        expect(pb.veil).toEqual([pa.veil[1], pa.veil[0]]);
        for (const k of ['sponge', 'soaked', 'charge', 'dizzy', 'immune', 'swapFx', 'squeezeFx'] as const) expect(pb[k]).toEqual(pa[k]);
        const tape = (p: typeof pa, flip: boolean) =>
          p.tapes.map((t) => [flip ? MAP_W - 1 - t.x : t.x, t.y, flip ? 1 - t.team : t.team, t.left].join());
        expect(tape(pb, true)).toEqual(tape(pa, false));
        expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
        for (let y = 0; y < 15; y++)
          for (let x = 0; x < MAP_W; x++) {
            const [i, j] = [y * MAP_W + x, y * MAP_W + (MAP_W - 1 - x)];
            const pt = a.match.paint[i]!;
            expect(b.match.paint[j]).toBe(pt < 0 ? pt : 1 - pt);
            expect(pb.veiled[j]).toBe(pa.veiled[i]);
          }
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
      expect([...seen].sort(), 'the runs played every F8a card, so the mirror checks something').toEqual([
        'dizzy',
        'ink',
        'sponge',
        'swap',
        'tape',
      ]);
    });
  it('same seed and inputs, same hash; the F8a rounds draw their deck from the 10 sabotages', () => {
    const run = (seed: number) => {
      const s = createManchazo({ slots: [0, 1, 2, 3], teams: [0, 1, 0, 1], seed, sabotage: true, sabotagePlus: true });
      playUses(s, 7, 2400, false, 90, feed(new Set()));
      return hashManchazo(s);
    };
    expect(run(4)).toBe(run(4));
    expect(run(4)).not.toBe(run(6));
    const decks = new Set(
      Array.from({ length: 40 }, (_, i) =>
        createManchazo({ slots: [0, 1], teams: [0, 1], seed: i * 31 + 1, sabotage: true, sabotagePlus: true }).match.sab!.deck.join(),
      ),
    );
    expect(decks.size).toBeGreaterThan(20);
    expect(new Set([...decks].flatMap((d) => d.split(',')))).toEqual(
      new Set(['turpentine', 'roller', 'fan', 'footprints', 'glue', ...PLUS_KINDS]),
    );
  });
});
