import { describe, expect, it } from 'vitest';
import { LOOT_TICKS, RESCUE_TICKS, paintTile, type ManchazoInput, type ManchazoState } from '../../sim';
import { blastAt, give, lootOf, put, res, rround, stain, tick } from './rescue-drive';

const USE: ManchazoInput = { sx: 0, sy: 0, drop: false, use: true };

describe('rescue and the Hourglass: a stained body does not count in the circle, a freed one does', () => {
  const clockRound = (): ManchazoState => {
    const s = rround([0, 1, 0], 5, { events: true });
    const ev = s.match.ev!;
    ev.next = ev.program.length; // no scheduled event
    Object.assign(ev.clock, { phase: 'live', team: 0, row: 7, liveAt: 0, endsAt: 99999, charge: 0 });
    for (const [x, y] of [[12, 6], [13, 6], [14, 6], [12, 7], [13, 7], [14, 7], [12, 8], [13, 8], [14, 8]] as const) paintTile(s.match, x, y, 0, 0); // the circle in the loser's colour
    put(s, 0, 14, 8); // inside the circle, stained
    put(s, 2, 15, 8); // its teammate next to it, outside the circle
    put(s, 1, 22, 2);
    stain(s, 0);
    return s;
  };
  it('the charge stays at 0 while the only body of the losing team inside is stained, and runs once it is freed', () => {
    const s = clockRound();
    tick(s, {}, 11);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(s.match.ev!.clock.charge).toBe(0); // 11 ticks stained inside the circle: it does not count
    tick(s); // the 12th tick frees it before the clock reads the circle: it counts at once
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(s.match.ev!.clock.charge).toBeGreaterThan(0);
  });
  it('without the rescue the same body stays stained and the charge stays at 0 for the whole stain', () => {
    const s = clockRound();
    s.match.res = null;
    tick(s, {}, RESCUE_TICKS + 1);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(s.match.ev!.clock.charge).toBe(0);
  });
});

describe('rescue and Cambiazo / Mareo', () => {
  it('a Cambiazo that moves the rescuer away breaks the contact: the count starts over, and both get the swap immunity (no new stain, no loot)', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 5, 7); // the rival next to the rescuer: its nearest rival is body 2 (distance 1)
    stain(s, 0);
    tick(s, {}, 6);
    expect(res(s).contact[0]).toBe(6);
    give(s, 1, 'swap');
    tick(s, { 1: USE });
    expect(s.grid.bodies[2]!.x).toBe(5 * 16 + 8); // body 2 now stands where the rival was: two tiles from the stained body
    expect(res(s).contact[0]).toBe(0);
    expect(s.match.sab!.plus!.immune[2]).toBeGreaterThan(0);
    give(s, 2, 'fan');
    s.grid.bodies[2]!.x = 8 * 16 + 8;
    put(s, 2, 8, 7);
    s.match.sab!.plus!.immune[2] = 20;
    blastAt(s, 8, 7);
    tick(s);
    expect(s.match.bodies[2]!.stun).toBe(0); // immune: not stained
    expect(s.match.sab!.held[2]).toBe('fan'); // and nothing drops
    expect(lootOf(s)).toEqual([]);
  });
  it('a dizzy rescuer rescues (contact is position, not the stick) and the rescue does not cure the freed body of its own dizziness', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    s.match.sab!.plus!.dizzy[2] = 500;
    s.match.sab!.plus!.dizzy[0] = 500;
    tick(s, {}, RESCUE_TICKS);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(s.match.sab!.plus!.dizzy[0]).toBe(500 - RESCUE_TICKS);
  });
});

describe('rescue and loot follow the ticks, not the acts', () => {
  for (const phase of ['opening', 'scramble', 'final'] as const)
    it(`${phase}: 12 ticks to rescue, 240 ticks of loot, whatever the act`, () => {
      const s = rround([0, 1, 0], 5, { events: true, phases: true });
      s.match.ev!.next = s.match.ev!.program.length;
      s.match.ph!.phase = phase;
      put(s, 0, 3, 7);
      put(s, 2, 4, 7);
      put(s, 1, 20, 3);
      give(s, 0, 'roller');
      blastAt(s, 3, 7);
      blastAt(s, 4, 7);
      tick(s);
      expect(lootOf(s)).toHaveLength(1);
      // both bodies are stained: nobody frees anybody; free the teammate by hand and count from there
      s.match.bodies[2]!.stun = 0;
      tick(s, {}, RESCUE_TICKS - 1);
      expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
      tick(s);
      expect(s.match.bodies[0]!.stun).toBe(0);
      put(s, 0, 8, 0);
      put(s, 2, 8, 2); // everyone steps off the loot
      tick(s, {}, LOOT_TICKS - (s.grid.tick - 1)); // the loot fell at the end of tick 0: after tick N its age is N - 1
      expect(lootOf(s)).toHaveLength(1);
      expect(lootOf(s)[0]!.age).toBe(LOOT_TICKS);
      tick(s);
      expect(lootOf(s)).toEqual([]);
    });
});
