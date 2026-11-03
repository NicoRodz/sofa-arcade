import { describe, expect, it } from 'vitest';
import { elementsOf, floorCount, generateMap, isValidMap, mirrorTile, validateMap, v1Connection } from '../../map';
import { MOVE_WARN_TICKS, MOVE_WINDOW_TICKS, MOVE_PAIRS, type ManchazoState } from '../../sim';
import { fits } from '../../sim/grid/move';
import { play, put } from '../match-drive';
import { moveSeed, onlyPlus, plusRound, run, solidCopy } from './plus-drive';

const ev = (s: ManchazoState) => s.match.ev!;
const at = (s: ManchazoState, [x, y]: readonly [number, number]) => s.grid.map.solid[y * 27 + x]!;

describe('Mudanza: the alternatives are generated and validated with the seed', () => {
  it('on many map seeds (with and without the living map) the moved map passes V1-V7 in every state of the living parts, stays symmetric and keeps its floor', () => {
    let rounds = 0;
    for (const living of [false, true])
      for (let m = 5000; m < 5040; m++) {
        const s = plusRound(1, [0, 1], m, living);
        const moves = ev(s).plus!.moves;
        if (moves.length === 0) continue;
        rounds++;
        expect(moves).toHaveLength(MOVE_PAIRS);
        const base = generateMap(m, undefined, living);
        const solid = base.map.solid.slice();
        for (const { from, to } of moves)
          for (const f of [(t: readonly [number, number]) => t, mirrorTile]) {
            const [fx, fy] = f(from);
            const [tx, ty] = f(to);
            expect(solid[fy * 27 + fx]).toBe(1);
            expect(solid[ty * 27 + tx]).toBe(0);
            solid[fy * 27 + fx] = 0;
            solid[ty * 27 + tx] = 1;
          }
        const moved = { ...base.map, solid };
        expect(isValidMap(moved)).toBe(true);
        expect(validateMap(moved, elementsOf(base.living), false)).toEqual([]);
        expect(floorCount(moved)).toBe(floorCount(base.map));
        for (let y = 0; y < 15; y++) for (let x = 0; x < 27; x++) expect(solid[y * 27 + x]).toBe(solid[y * 27 + 26 - x]);
      }
    expect(rounds).toBeGreaterThan(20); // most seeds have valid moves
  });
  it('a pair can land before the other (one waits for a body): every subset of the moves keeps V1-V3 in every living state (seeds that cut tiles off with only one pair landed)', () => {
    for (const [m, living] of [
      [11767634, false],
      [8267436, true],
      [7602240, true],
      [7942757, true],
      [8370383, true],
    ] as const) {
      const base = generateMap(m, undefined, living);
      const moves = ev(plusRound(1, [0, 1], m, living)).plus!.moves;
      for (const sub of [[0], [1], [0, 1]]) {
        const solid = base.map.solid.slice();
        for (const { from, to } of sub.flatMap((k) => (moves[k] ? [moves[k]!] : [])))
          for (const f of [(t: readonly [number, number]) => t, mirrorTile]) {
            solid[f(from)[1] * 27 + f(from)[0]] = 0;
            solid[f(to)[1] * 27 + f(to)[0]] = 1;
          }
        const bad = validateMap({ ...base.map, solid }, elementsOf(base.living)).filter((v) => ['V1', 'V2', 'V3'].includes(v.id));
        expect(bad, `seed ${m} living ${living} subset ${sub}`).toEqual([]);
      }
    }
  });
  it('a round with no valid move keeps Mudanza out of the pool', () => {
    for (let m = 1; m < 200; m++) {
      const s = plusRound(1, [0, 1], m);
      if (ev(s).plus!.moves.length === 0) expect(ev(s).program.some((p) => p.kind === 'move')).toBe(false);
    }
  });
});

describe('Mudanza in the round', () => {
  const setup = (living = false) => onlyPlus(plusRound(3, [0, 1, 0, 1], moveSeed(1000, living), living), 'move', 10);
  const park = (s: ManchazoState) => [0, 1, 2, 3].forEach((i) => put(s, i, 13, 7)); // all four on the middle line, away from the pieces

  it('is announced, jumps after 2 s: the old tiles open, the new close, both team halves alike, the floor total and the counts stay', () => {
    const s = setup();
    park(s);
    const { moves } = ev(s).plus!;
    const before = solidCopy(s);
    run(s, 11);
    expect(ev(s).log.map((a) => a.kind)).toEqual(['move']);
    run(s, MOVE_WARN_TICKS - 2);
    expect(solidCopy(s)).toEqual(before); // still warning
    run(s, 3);
    for (const { from, to } of moves)
      for (const f of [(t: readonly [number, number]) => t, mirrorTile]) {
        expect(at(s, f(from))).toBe(0);
        expect(at(s, f(to))).toBe(1);
      }
    expect(floorCount(s.grid.map)).toBe(s.match.paintable);
    expect(ev(s).plus!.fx).toBe(MOVE_PAIRS);
    expect(v1Connection(s.grid.map)).toBeNull(); // still one connected floor
    run(s, 400);
    expect(ev(s).active).toBeNull();
  });
  it('a paint on the destination is wiped and the counts follow (count = tiles painted)', () => {
    const s = setup();
    park(s);
    const { to } = ev(s).plus!.moves[0]!;
    s.match.paint[to[1] * 27 + to[0]] = 0; // as a pinata would have left it
    s.match.counts[0] = 1;
    run(s, 10 + MOVE_WARN_TICKS + 2);
    expect(s.match.paint[to[1] * 27 + to[0]]).toBe(-1);
    expect(s.match.counts[0]).toBe(0);
  });
  it('a pair whose destination holds a body or a pinata waits, and lands when it is free; the other pair is not held up', () => {
    const s = setup();
    park(s);
    const [a, b] = ev(s).plus!.moves;
    put(s, 0, a!.to[0], a!.to[1]);
    s.match.pinatas.push({ id: 99, x: b!.to[0], y: b!.to[1], team: 0, owner: -1, fuse: 1e6, radius: 2 });
    run(s, 10 + MOVE_WARN_TICKS + 30);
    expect(at(s, a!.to)).toBe(0);
    expect(at(s, b!.to)).toBe(0);
    expect(ev(s).plus!.move!.done).toEqual([0, 0]);
    put(s, 0, 13, 7); // the body steps away
    s.match.pinatas.length = 0; // the pinata went off
    run(s, 2);
    expect(at(s, a!.to)).toBe(1);
    expect(at(s, b!.to)).toBe(1);
  });
  it('after MOVE_WINDOW_TICKS a pair that never found its destination free stays put and the event ends', () => {
    const s = setup();
    park(s);
    const [a] = ev(s).plus!.moves;
    const before = solidCopy(s);
    for (let k = 0; k < 10 + MOVE_WARN_TICKS + MOVE_WINDOW_TICKS + 5; k++) {
      put(s, 0, a!.to[0], a!.to[1]);
      run(s, 1);
    }
    expect(at(s, a!.to)).toBe(0);
    expect(at(s, a!.from)).toBe(1);
    expect(ev(s).active).toBeNull();
    expect(solidCopy(s).filter((v, i) => v !== before[i]).length).toBe(4); // only the other pair moved (2 tiles out, 2 in... per member)
  });
  it('with the living map the base the screen and the pairs rebuild from follows the move', () => {
    const s = setup(true);
    park(s);
    const { from, to } = ev(s).plus!.moves[0]!;
    run(s, 10 + MOVE_WARN_TICKS + 2);
    expect(s.match.live!.base[from[1] * 27 + from[0]]).toBe(0);
    expect(s.match.live!.base[to[1] * 27 + to[0]]).toBe(1);
    run(s, 60 * 40); // the living parts keep changing: furniture never reverts, nobody ends inside a solid tile
    expect(at(s, to)).toBe(1);
    expect(s.grid.bodies.every((b) => fits(s.grid.map, b.x, b.y))).toBe(true);
  });
  it('whatever the players do nobody ends shut in: scripted rounds, many seeds, the floor stays one connected piece and every body stands on floor', () => {
    for (const [i, living] of [
      [0, false],
      [1, true],
      [2, false],
      [3, true],
    ] as const) {
      const s = plusRound(i + 2, [0, 1, 0, 1, 0, 1], moveSeed(2000 + i * 97, living), living);
      onlyPlus(s, 'move', 600);
      play(s, 40 + i, 60 * 60);
      expect(ev(s).plus!.fx).toBeGreaterThan(0);
      expect(v1Connection({ ...s.grid.map, solid: s.match.live ? s.match.live.base : s.grid.map.solid })).toBeNull();
      expect(s.grid.bodies.every((b) => fits(s.grid.map, b.x, b.y))).toBe(true);
    }
  });
});
