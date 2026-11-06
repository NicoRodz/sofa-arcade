// Campaign layer for 2: anchor (planted = infinite mass), edge assist and throw arc (plan §5.1). Every rule has its quick-match twin that must NOT show it.

import { describe, expect, it } from 'vitest';
import { TILE } from '../../constants';
import { hall, inp, level, of, pl, run, teleport, world } from '../testkit/testkit';
import { snapshot } from '../world';

const GROUND = 11;
const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
// A plateau (cols 1..14, top at row 8) over a chasm, the spawn on top and a floor on the last row: the cliff face is at x = 15 tiles.
function plateau(w = 30, h = 16): string[] {
  return Array.from({ length: h }, (_, y) => {
    const cs = ('#' + '.'.repeat(w - 2) + '#').split('');
    if (y >= 8) for (let x = 1; x <= 14; x++) cs[x] = '#';
    if (y === h - 1) cs.fill('#');
    if (y === 7) cs[2] = 'S';
    if (y === h - 2) cs[w - 3] = 'G';
    return cs.join('');
  });
}
const TOP = 7; // the row players stand in on the plateau

describe('dynamic 2: anchor (planted = infinite mass) and the slow slide', () => {
  // Slot 0 stands on the plateau 55 px from the edge, slot 1 steps off it and dangles from the rope.
  const hang = (planted: boolean, o: { campaign: boolean }) => {
    const w = world(level(plateau()), { mode: 'chain', ...(o.campaign ? camp() : {}) });
    teleport(w, 0, 13, TOP);
    teleport(w, 1, 16, 5);
    run(w, 5);
    if (planted) run(w, 1, B(0));
    const x0 = pl(w, 0).body.x;
    let taut = 0;
    run(w, 90, undefined, () => {
      if (w.ropes[0]!.links[0]!.taut) taut++;
    });
    return { w, dx: pl(w, 0).body.x - x0, taut };
  };
  it('the planted one does not move at all while its partner dangles from the rope', () => {
    const r = hang(true, { campaign: true });
    expect(pl(r.w, 0).planted).toBe(true);
    expect(Math.abs(r.dx)).toBeLessThan(0.01);
    expect(r.taut).toBeGreaterThan(50); // the rope really was taut: the zero above is not vacuous
    expect(pl(r.w, 1).mode).toBe('active');
  });
  it('the one that is not anchoring slides towards the edge at 0.5 tile/s (24 px/s), never faster', () => {
    const c = hang(false, { campaign: true });
    expect(c.taut).toBeGreaterThan(50);
    expect(c.dx).toBeGreaterThan(0.4 * TILE * (c.taut / 60) * 0.9); // it really slides...
    expect(c.dx).toBeLessThanOrEqual(0.5 * TILE * (c.taut / 60) + 0.5); // ...but never faster than 0.5 tile/s while the rope is taut
  });
  it('quick match keeps the old light anchor: a planted one is still dragged by the hanger (1/8 mass); the campaign one is not', () => {
    const q = hang(true, { campaign: false });
    expect(q.dx).toBeGreaterThan(1);
    expect(hang(true, { campaign: true }).dx).toBe(0);
  });
});

describe('edge assist (plan §5.1)', () => {
  // Slot 0 planted on the plateau, 6 tiles back; slot 1 hangs on the taut rope against the cliff face with its head 10 px below the ledge top.
  const setup = (o: { campaign: boolean }) => {
    const w = world(level(plateau()), { mode: 'chain', ...(o.campaign ? camp() : {}) });
    teleport(w, 0, 9, TOP);
    run(w, 5);
    run(w, 1, B(0));
    const p1 = pl(w, 1).body;
    p1.x = 15 * TILE + 0.5;
    p1.y = 8 * TILE + 10;
    p1.vx = 0;
    p1.vy = 0;
    p1.grounded = false;
    return w;
  };
  it('a hanger whose head reaches the ledge climbs on by itself (event, then it stands on the ledge); quick match leaves it hanging', () => {
    const w = setup({ campaign: true });
    const ev = run(w, 90);
    expect(of(ev, 'obst.edgeAssist')).toEqual([{ player: 1 }]);
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(Math.abs(pl(w, 1).body.y + 46 - 8 * TILE)).toBeLessThan(0.7); // feet on the plateau top
    expect(pl(w, 1).body.x + 34).toBeLessThanOrEqual(15 * TILE); // over the plateau
    const q = setup({ campaign: false });
    const evq = run(q, 90);
    expect(of(evq, 'obst.edgeAssist')).toEqual([]);
    expect(pl(q, 1).body.y + 46).toBeGreaterThan(8 * TILE + 20); // still hanging below the ledge
  });
  it('it is a hanger-only help: a free fall past the cliff (no rope) does not trigger it', () => {
    const w = world(level(plateau()), { mode: 'free', ...camp() });
    const p1 = pl(w, 1).body;
    p1.x = 15 * TILE + 0.5;
    p1.y = 6 * TILE;
    p1.vy = 100;
    p1.grounded = false;
    expect(of(run(w, 90), 'obst.edgeAssist')).toEqual([]);
  });
  it('a hanger far below the ledge (head 2 tiles under it) is not helped', () => {
    const w = setup({ campaign: true });
    pl(w, 1).body.y = 10 * TILE;
    expect(of(run(w, 1), 'obst.edgeAssist')).toEqual([]);
  });
});

describe('throw arc (plan §5.1)', () => {
  it('while carrying a teammate the snapshot gives the arc, and it ends where the real throw lands', () => {
    const w = world(level(hall(60)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 10, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x - 36;
    run(w, 5);
    expect(snapshot(w).players[0]!.arc).toBeNull(); // nothing in the hands
    run(w, 1, B(0));
    expect(pl(w, 0).holding?.kind).toBe('player');
    const arc = snapshot(w).players[0]!.arc!;
    expect(arc.length).toBeGreaterThan(5);
    expect(snapshot(w).players[1]!.arc).toBeNull();
    const end = arc[arc.length - 1]!;
    expect(Math.min(...arc.map((p) => p.y))).toBeLessThan(arc[0]!.y - 2 * TILE); // it goes up
    run(w, 1, B(0)); // throw
    for (let n = 0; n < 150 && (n < 3 || pl(w, 1).thrown > 0); n++) run(w, 1); // until it touches down (the slide after the landing is not part of the arc: with the A5 launch, x1.3, it is longer)
    const b = pl(w, 1).body;
    expect(Math.abs(b.x + 17 - end.x)).toBeLessThan(16);
    expect(Math.abs(b.y + 23 - end.y)).toBeLessThan(20);
  });
});
