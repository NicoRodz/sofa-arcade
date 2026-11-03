import { describe, expect, it } from 'vitest';
import { RESCUE_GLOW_TICKS, RESCUE_TICKS, STUN_TICKS, TRAIL_TICKS } from '../../sim';
import { blastAt, give, put, res, rround, stain, tick } from './rescue-drive';

// F0 map: row 7 is open in columns 0-5. Bodies: 0 and 2 on team 0, 1 on team 1.
const duo = () => {
  const s = rround([0, 1, 0]);
  put(s, 0, 3, 7);
  put(s, 2, 4, 7); // an orthogonal neighbour of body 0
  put(s, 1, 20, 3); // the rival, far away
  stain(s, 0);
  return s;
};

describe('rescue: a teammate in contact for 12 ticks in a row frees the stained body', () => {
  it('frees on the 12th tick of contact and not on the 11th, and clears the footprints that would follow', () => {
    const s = duo();
    tick(s, {}, 11);
    expect(s.match.bodies[0]!.stun).toBe(STUN_TICKS - 11);
    expect(res(s).contact[0]).toBe(11);
    tick(s);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(RESCUE_TICKS).toBe(12);
    expect(s.match.bodies[0]!.trail).toBe(0); // a natural end of the stain would start TRAIL_TICKS of rival footprints
    expect(res(s).log.filter((e) => e.kind === 'rescue')).toEqual([{ kind: 'rescue', tick: 11, body: 0, x: 3, y: 7, card: null }]);
  });
  it('without rescue a stain lasts its full STUN_TICKS and then leaves TRAIL_TICKS of footprints', () => {
    const s = rround([0, 1, 0], 5, { rescue: false });
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    tick(s, {}, STUN_TICKS);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(s.match.bodies[0]!.trail).toBe(TRAIL_TICKS);
    expect(s.match.res).toBeNull();
  });
  it('a teammate on the same tile counts too; both glow for RESCUE_GLOW_TICKS', () => {
    const s = duo();
    put(s, 2, 3, 7);
    tick(s, {}, RESCUE_TICKS);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(res(s).glow).toEqual([RESCUE_GLOW_TICKS, 0, RESCUE_GLOW_TICKS]);
    tick(s, {}, RESCUE_GLOW_TICKS);
    expect(res(s).glow).toEqual([0, 0, 0]);
  });
  it('a diagonal teammate, a rival and a stained teammate do not count', () => {
    for (const [what, move] of [
      ['diagonal', (s: ReturnType<typeof duo>) => put(s, 2, 4, 6)],
      ['two tiles away', (s: ReturnType<typeof duo>) => put(s, 2, 5, 7)],
      [
        'a rival next to it',
        (s: ReturnType<typeof duo>) => {
          put(s, 2, 20, 11);
          put(s, 1, 4, 7);
        },
      ],
      ['a stained teammate', (s: ReturnType<typeof duo>) => stain(s, 2)],
    ] as const) {
      const s = duo();
      move(s);
      tick(s, {}, RESCUE_TICKS + 3);
      expect(s.match.bodies[0]!.stun, what).toBeGreaterThan(0);
      expect(res(s).contact[0], what).toBe(0);
    }
  });
  it('contact must be unbroken: stepping away for one tick starts the count over', () => {
    const s = duo();
    tick(s, {}, 8);
    put(s, 2, 6, 7);
    tick(s);
    expect(res(s).contact[0]).toBe(0);
    put(s, 2, 4, 7);
    tick(s, {}, RESCUE_TICKS - 1);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    tick(s);
    expect(s.match.bodies[0]!.stun).toBe(0);
  });
  it('two rescuers free at the same tick as one (no second one is needed), and both glow', () => {
    const s = rround([0, 1, 0, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 3, 2, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    tick(s, {}, RESCUE_TICKS);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(res(s).glow).toEqual([RESCUE_GLOW_TICKS, 0, RESCUE_GLOW_TICKS, RESCUE_GLOW_TICKS]);
  });
  it('a rescue completing on the tick the stain would end wins: no footprints', () => {
    const s = duo();
    s.match.bodies[0]!.stun = 1;
    res(s).contact[0] = RESCUE_TICKS - 1;
    tick(s);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(s.match.bodies[0]!.trail).toBe(0);
  });
  it('a stain that is hit again the tick it ends starts its count from 0, not from the old one', () => {
    const s = duo();
    s.match.bodies[0]!.stun = 1;
    res(s).contact[0] = 10;
    blastAt(s, 1, 7); // two tiles to the left: it reaches body 0 (3, 7) and not its rescuer (4, 7)
    tick(s);
    expect(s.match.bodies[0]!.stun).toBe(STUN_TICKS);
    expect(res(s).contact[0]).toBe(0);
    tick(s);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0); // with the old count it would be 12 and free it one tick after the new stain
    expect(res(s).contact[0]).toBe(1);
  });
  it('a body already in its footprints stage (stun over) is not rescued: it plays the footprints out', () => {
    const s = duo();
    s.match.bodies[0]!.stun = 0;
    s.match.bodies[0]!.trail = 50;
    tick(s, {}, RESCUE_TICKS + 2);
    expect(s.match.bodies[0]!.trail).toBe(50 - RESCUE_TICKS - 2);
  });
});

describe('rescue with the chained blasts', () => {
  it('a second blast on a body that is still stained does not extend the stain or restart a rescue', () => {
    const s = duo();
    tick(s, {}, 6);
    blastAt(s, 3, 7, 1, 1); // rival blast over the stained body and its rescuer: the rescuer is stained too
    tick(s);
    expect(s.match.bodies[2]!.stun).toBe(STUN_TICKS); // the rescuer is caught: contact is gone
    expect(s.match.bodies[0]!.stun).toBe(STUN_TICKS - 7); // already stained: unchanged by the new blast
    tick(s);
    expect(res(s).contact[0]).toBe(0); // the next tick finds no free teammate next to it: the count starts over
    tick(s, {}, 30);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0); // nobody free next to it: no rescue
  });
  it('a body freed and caught by the next blast of a chain is stained again in full, its count at 0', () => {
    const s = duo();
    tick(s, {}, RESCUE_TICKS);
    expect(s.match.bodies[0]!.stun).toBe(0);
    blastAt(s, 3, 7, 1, 1);
    tick(s);
    expect(s.match.bodies[0]!.stun).toBe(STUN_TICKS);
    expect(res(s).contact[0]).toBe(0);
  });
  it('a stain cuts the roller and the Mareo charge as before, and drops nothing when the hand is empty', () => {
    const s = duo();
    s.match.bodies[0]!.stun = 0;
    s.match.sab!.roller[0] = 100;
    s.match.sab!.plus!.charge[0] = 20;
    blastAt(s, 3, 7);
    tick(s);
    expect(s.match.sab!.roller[0]).toBe(0);
    expect(s.match.sab!.plus!.charge[0]).toBe(0);
    expect(res(s).loot).toEqual([]);
    give(s, 0, null);
  });
});
