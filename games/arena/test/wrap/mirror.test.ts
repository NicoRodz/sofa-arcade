import { describe, expect, it } from 'vitest';
import { MAP_W } from '../../map';
import { createManchazo, hashManchazo, type ManchazoState } from '../../sim';
import { playUses } from '../sabotage-plus/plus-drive';
import { countsAgree, put, wrap } from './wrap-drive';

const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];

/** Every 15 ticks the next body gets a tape or a sponge (by body index, so a run and its mirror get the same), when its hand is empty. Remembers what ran and checks the counts. */
function feed(seen: Set<string>) {
  return (s: ManchazoState) => {
    const a = s.match.sab!;
    const n = s.grid.bodies.length;
    if (s.grid.tick % 15 === 0) {
      const k = s.grid.tick / 15;
      const i = k % n;
      if (a.held[i] === null && s.match.bodies[i]!.stun === 0) a.held[i] = k % 3 === 0 ? 'tape' : 'sponge';
    }
    const w = wrap(s);
    if (w.strips.length) seen.add('strip');
    for (const e of w.log) seen.add(e.kind);
    if (s.grid.tick % 100 === 0) expect(countsAgree(s)).toBe(true);
  };
}

const gather = (s: ManchazoState, flip: boolean) => s.grid.bodies.forEach((_b, i) => put(s, i, flip ? 26 - (10 + i) : 10 + i, 0));

describe('mirror with the sponge v2 and the packing tape: swapping the teams swaps everything', () => {
  for (const [name, teams] of CASES)
    it(`${name}: paint, strips, soak clocks, bursts and squeezes mirror; the counts agree with the floor`, () => {
      const slots = teams.map((_t, i) => i);
      const seen = new Set<string>();
      for (const rs of [101, 202, 303, 404, 505, 606]) {
        const mk = (ts: number[]) => createManchazo({ slots, teams: ts, seed: 4, sabotage: true, sabotagePlus: true, sabotageV2: true });
        const a = mk(teams);
        const b = mk(teams.map((t) => 1 - t));
        gather(a, false);
        gather(b, true);
        playUses(a, rs, 2400, false, 30, feed(seen));
        playUses(b, rs, 2400, true, 30, feed(new Set()));
        const [wa, wb] = [wrap(a), wrap(b)];
        for (const k of ['soak', 'prep', 'fx'] as const) expect(wb[k]).toEqual(wa[k]);
        const strips = (w: typeof wa, flip: boolean) =>
          w.strips.map((t) =>
            [
              t.owner,
              flip ? 1 - t.team : t.team,
              t.left,
              t.tiles
                .map((i) => (flip ? 26 - (i % MAP_W) : i % MAP_W) + 100 * Math.floor(i / MAP_W))
                .sort()
                .join('/'),
            ].join(),
          );
        expect(strips(wb, true)).toEqual(strips(wa, false));
        const log = (w: typeof wa, flip: boolean) => w.log.map((e) => [e.kind, e.tick, e.body, flip ? 26 - e.x : e.x, e.y, e.n].join());
        expect(log(wb, true)).toEqual(log(wa, false));
        expect(b.match.sab!.plus!.soaked).toEqual(a.match.sab!.plus!.soaked);
        expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
        for (let y = 0; y < 15; y++)
          for (let x = 0; x < MAP_W; x++) {
            const pt = a.match.paint[y * MAP_W + x]!;
            expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pt < 0 ? pt : 1 - pt);
          }
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
      expect([...seen].sort(), 'the runs landed tapes and squeezed sponges, so the mirror checks something').toEqual(
        expect.arrayContaining(['squeeze', 'strip', 'tape']),
      );
    });
  it('the stains cut sponges: across all the runs at least one burst happened somewhere (the bursts are not dead code)', () => {
    const seen = new Set<string>();
    for (const rs of [101, 202, 303, 404, 505, 606, 707, 808]) {
      const s = createManchazo({ slots: [0, 1, 2, 3], teams: [0, 1, 0, 1], seed: 4, sabotage: true, sabotagePlus: true, sabotageV2: true });
      gather(s, false);
      playUses(s, rs, 2400, false, 30, feed(seen));
    }
    expect(seen.has('burst')).toBe(true);
  });
});
