import { describe, expect, it } from 'vitest';
import { GLUE_FUSE_TICKS, MAX_PASSES, PASS_LOCK_TICKS, PASS_MIN_FUSE, canPass, receiverOf } from '../../sim';
import { give, plus, press, put, sround, stain, tick } from './shot-drive';

/** Body 1 (team 1) carries a Pegote thrown by body 0 (team 0); body 2 (team 0) and body 3 (team 1) are around. */
function glued(teams = [0, 1, 0, 1]) {
  const s = sround(teams);
  [0, 1, 2, 3].forEach((i, k) => put(s, i, 3 + k * 6, 14 - 0)); // far apart on row 14 (open)
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
const glue = (s: ReturnType<typeof glued>) => s.match.pinatas[0]!;

describe('Pegote pass: B by the carrier, to a rival of it on its tile or an orthogonal neighbour', () => {
  it("passes to a rival one tile away: it rides the receiver, takes the passer's colour, owner and radius, lock 30, 1 pass", () => {
    const s = glued();
    put(s, 2, 10, 14); // teammate of the thrower, next to the carrier (a rival of the carrier)
    tick(s, press(1));
    expect(glue(s)).toMatchObject({ stuck: 2, team: 1, owner: 1, passes: 1, lock: 29, x: 10, y: 14 });
    expect(s.match.sab!.shot!.log.at(-1)).toMatchObject({ kind: 'pass', body: 1, target: 2 });
  });
  it('the same tile counts, a diagonal or two tiles away does not', () => {
    const same = glued();
    put(same, 2, 9, 14);
    expect(receiverOf(same, 1)).toBe(2);
    const diag = glued();
    put(diag, 2, 10, 13);
    expect(receiverOf(diag, 1)).toBe(-1);
    const two = glued();
    put(two, 2, 11, 14);
    expect(receiverOf(two, 1)).toBe(-1);
    tick(two, press(1));
    expect(glue(two).stuck).toBe(1); // nothing to pass to: B did nothing to the Pegote
  });
  it('never to a teammate of the carrier, to a stained body or to an immune one', () => {
    const s = glued();
    put(s, 3, 10, 14); // the carrier's own teammate
    expect(receiverOf(s, 1)).toBe(-1);
    put(s, 2, 8, 14);
    stain(s, 2);
    expect(receiverOf(s, 1)).toBe(-1);
    s.match.bodies[2]!.stun = 0;
    plus(s).immune[2] = 10;
    expect(receiverOf(s, 1)).toBe(-1);
  });
  it('the nearest receiver wins, same tile before a neighbour; a tie goes to the lowest index', () => {
    const s = sround([0, 1, 0, 0]);
    put(s, 1, 9, 14);
    put(s, 0, 10, 14);
    put(s, 2, 8, 14);
    put(s, 3, 9, 14);
    s.match.pinatas.push({ id: 0, x: 9, y: 14, team: 0, owner: 0, fuse: 100, radius: 2, mod: 'glue', stuck: 1, passes: 0, lock: 0 });
    expect(receiverOf(s, 1)).toBe(3); // on the same tile
    put(s, 3, 20, 14); // body 3 leaves: bodies 0 and 2 tie at distance 1
    expect(receiverOf(s, 1)).toBe(0);
  });
  it('cannot pass again for 30 ticks: B at tick 29 does nothing, at tick 30 passes back', () => {
    const s = glued();
    put(s, 2, 10, 14);
    tick(s, press(1));
    expect(glue(s).stuck).toBe(2);
    put(s, 1, 10, 14); // body 1, a rival of its new carrier, stands beside it
    tick(s, {}, 28); // lock now 1 (literal: 30 ticks in all)
    expect(canPass(s, 2)).toBe(false);
    tick(s, press(2));
    expect(glue(s).stuck).toBe(2); // refused at lock 1 (the press tick still counted down)
    tick(s);
    expect(canPass(s, 2)).toBe(true);
    tick(s, press(2));
    expect(glue(s)).toMatchObject({ stuck: 1, passes: 2 });
  });
  it('at most MAX_PASSES passes: the last carrier keeps it', () => {
    const s = glued();
    put(s, 2, 10, 14);
    put(s, 3, 9, 14);
    for (let n = 1; n <= MAX_PASSES; n++) {
      const carrier = glue(s).stuck!;
      const other = carrier === 1 || carrier === 3 ? 2 : 1; // a rival of the carrier beside it
      put(s, other, s.grid.bodies[carrier]!.x >> 4, 14);
      tick(s, press(carrier));
      expect(glue(s).passes).toBe(n);
      tick(s, {}, PASS_LOCK_TICKS);
    }
    const last = glue(s).stuck!;
    expect(canPass(s, last)).toBe(false);
    tick(s, press(last));
    expect(glue(s).passes).toBe(MAX_PASSES);
    expect(glue(s).stuck).toBe(last);
    expect(MAX_PASSES).toBe(3);
  });
  it('a Pegote about to go off gets PASS_MIN_FUSE ticks on a pass; a longer fuse is kept', () => {
    const s = glued();
    put(s, 2, 10, 14);
    glue(s).fuse = 10;
    tick(s, press(1));
    expect(glue(s).fuse).toBe(PASS_MIN_FUSE - 1); // one tick of burn the same tick
    const t = glued();
    put(t, 2, 10, 14);
    tick(t, press(1));
    expect(glue(t).fuse).toBe(99);
    expect(GLUE_FUSE_TICKS).toBeGreaterThan(PASS_MIN_FUSE);
  });
  it('a stained carrier cannot pass; and with a passable Pegote and a rival beside, B passes instead of playing the card in hand', () => {
    const s = glued();
    put(s, 2, 10, 14);
    stain(s, 1);
    tick(s, press(1));
    expect(glue(s).stuck).toBe(1);
    const t = glued();
    put(t, 2, 10, 14);
    give(t, 1, 'dizzy');
    tick(t, press(1));
    expect(glue(t).stuck).toBe(2);
    expect(t.match.sab!.held[1]).toBe('dizzy'); // the card was not touched
    expect(t.match.sab!.shot!.prep[1]).toBe(0);
  });
  it('without a Pegote of the new rule B plays the card (an old glue pinata has no `passes`)', () => {
    const s = glued();
    delete glue(s).passes;
    put(s, 2, 10, 14);
    tick(s, press(1));
    expect(glue(s).stuck).toBe(1);
  });
  it("end to end: the pass puts the blast on the receiver, in the passer's colour", () => {
    const s = glued();
    put(s, 2, 10, 14);
    tick(s, press(1));
    put(s, 2, 10, 14);
    put(s, 1, 3, 14); // the passer walks off
    tick(s, {}, 100);
    expect(s.match.bodies[2]!.stun).toBeGreaterThan(0); // body 2 (team 0) is stained by team 1's colour
    expect(s.match.bodies[1]!.stun).toBe(0);
    expect(s.match.paint[14 * 27 + 10]).toBe(1);
  });
});
