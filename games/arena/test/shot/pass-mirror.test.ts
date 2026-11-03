import { describe, expect, it } from 'vitest';
import { MAP_W } from '../../map';
import { MAX_PASSES, canPass, receiverOf, type ManchazoState } from '../../sim';
import { plus, press, put, shot, sround, tick } from './shot-drive';

/**
 * A Pegote ping-pongs between bodies 1 (team 1) and 0 (team 0) while body 2 (team 0) is as near to the carrier as body 0 is, on its other side: the tie between two
 * receivers is broken by body index, never by which one is on the left. `flip` plays the mirror image (teams swapped, every x reflected).
 */
function setup(flip: boolean): ManchazoState {
  const s = sround(flip ? [1, 0, 1, 0] : [0, 1, 0, 1]);
  const at = (i: number, tx: number, ty: number) => put(s, i, flip ? MAP_W - 1 - tx : tx, ty);
  at(0, 8, 14);
  at(1, 9, 14);
  at(2, 10, 14);
  at(3, 20, 14);
  s.match.pinatas.push({
    id: s.match.nextId++,
    x: 9,
    y: 14,
    team: 0,
    owner: 0,
    fuse: 100,
    radius: 2,
    mod: 'glue',
    stuck: 1,
    passes: 0,
    lock: 0,
  });
  return s;
}
const carrier = (s: ManchazoState) => s.match.pinatas.find((p) => p.mod === 'glue')?.stuck ?? -1;
/** The carrier presses B whenever it may; returns the carriers in order. */
function pingPong(s: ManchazoState, ticks: number, each: (t: number) => void) {
  const carriers: number[] = [carrier(s)];
  for (let t = 0; t < ticks; t++) {
    const c = carrier(s);
    tick(s, c >= 0 && canPass(s, c) ? press(c) : {});
    if (carrier(s) !== carriers.at(-1)) carriers.push(carrier(s));
    each(t);
  }
  return carriers;
}

describe('Pegote pass: the mirror', () => {
  it('a tie between two receivers goes to the lowest body index, on either side of the map (literal)', () => {
    for (const flip of [false, true]) {
      const s = setup(flip);
      expect(receiverOf(s, 1)).toBe(0); // body 0 and body 2 are both a tile from the carrier
    }
  });
  it('a chain of passes in the mirror image is the same chain: carriers, Pegote, log, paint and counts', () => {
    const [a, b] = [setup(false), setup(true)];
    const seen: number[][] = [[], []];
    const run = (s: ManchazoState, n: number) => pingPong(s, 150, () => seen[n]!.push(s.match.pinatas[0]?.fuse ?? -1));
    const [ca, cb] = [run(a, 0), run(b, 1)];
    expect(cb).toEqual(ca);
    expect(ca.slice(0, 4)).toEqual([1, 0, 1, 0]); // 1 -> 0 -> 1 -> 0 (three passes, then it rides its last carrier)
    expect(shot(a).log.filter((e) => e.kind === 'pass')).toHaveLength(MAX_PASSES);
    expect(seen[1]).toEqual(seen[0]); // the fuse counts down the same
    expect(shot(b).log.map((e) => [e.kind, e.tick, e.body, e.target, MAP_W - 1 - e.x, e.y, e.card])).toEqual(
      shot(a).log.map((e) => [e.kind, e.tick, e.body, e.target, e.x, e.y, e.card]),
    );
    expect(plus(b).dizzy).toEqual(plus(a).dizzy);
    expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
    expect(a.match.counts[0]! + a.match.counts[1]!).toBeGreaterThan(0); // the Pegote went off and painted something
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < MAP_W; x++) {
        const pa = a.match.paint[y * MAP_W + x]!;
        expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
      }
  });
});
