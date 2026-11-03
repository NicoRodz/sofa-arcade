import { describe, expect, it } from 'vitest';
import { AIM_TICKS, SHOT_RANGE_UNITS, SHOT_UNITS_PER_TICK } from '../../sim';
import { give, hand, plus, press, put, shot, sround, stain, tick } from './shot-drive';

/** Team 0 body 0 at (5,0) facing right with a card; rival body 1 at (rx,0). The only open row is 0 (the F0 map). */
function lineUp(kind: 'glue' | 'swap' | 'dizzy', rx = 9, teams = [0, 1]) {
  const s = sround(teams);
  put(s, 0, 5, 0);
  put(s, 1, rx, 0);
  s.match.bodies[0]!.face = 0; // RIGHT (the round's seed may have put team 0 on the right)
  give(s, 0, kind);
  return s;
}

describe('aim: button 2 prepares 12 ticks, then the shot leaves along the heading', () => {
  it('the shot leaves on the 12th tick, not the 11th; the card stays in hand until then and `used` moves only at launch', () => {
    const s = lineUp('dizzy');
    tick(s, press(0));
    expect(shot(s).prep[0]).toBe(AIM_TICKS - 1);
    tick(s, {}, 10);
    expect(shot(s).shots).toHaveLength(0); // 11 ticks in
    expect(hand(s, 0)).toBe('dizzy');
    expect(s.match.sab!.used).toBe(0);
    tick(s);
    expect(shot(s).shots).toHaveLength(1); // the 12th
    expect(hand(s, 0)).toBeNull();
    expect(s.match.sab!.used).toBe(1);
    expect(shot(s).shots[0]).toMatchObject({ kind: 'dizzy', owner: 0, team: 0, dir: 0, x: 5 * 16 + 8, y: 8, left: SHOT_RANGE_UNITS });
  });
  it('a second press during the aim does nothing (no second aim, no second shot)', () => {
    const s = lineUp('dizzy');
    tick(s, press(0));
    tick(s, press(0), 3);
    expect(shot(s).prep[0]).toBe(AIM_TICKS - 4);
    tick(s, {}, 20);
    expect(shot(s).log.filter((e) => e.kind === 'launch')).toHaveLength(1);
  });
  it('the heading is read when the shot leaves: a body facing left shoots left', () => {
    const s = lineUp('dizzy');
    s.match.bodies[0]!.face = 2; // LEFT
    tick(s, press(0), AIM_TICKS);
    expect(shot(s).shots[0]).toMatchObject({ dir: 2 });
  });
  it('a stain during the aim cuts it: nothing flies and the card stays in hand without Rescue', () => {
    const s = lineUp('dizzy');
    tick(s, press(0), 5);
    s.match.pinatas.push({ id: 99, x: 5, y: 0, team: 1, owner: 1, fuse: 1, radius: 2 });
    tick(s);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(shot(s).prep[0]).toBe(0);
    expect(hand(s, 0)).toBe('dizzy');
    tick(s, {}, 40);
    expect(shot(s).shots).toHaveLength(0);
    expect(shot(s).log.some((e) => e.kind === 'cancel')).toBe(true);
  });
  it('a stained body cannot start an aim', () => {
    const s = lineUp('dizzy');
    stain(s, 0);
    tick(s, press(0));
    expect(shot(s).prep[0]).toBe(0);
  });
});

describe('flight: integer units, hits on the first rival in the line', () => {
  it('a Mareo at 4 tiles hits on the exact tick (12 aim + 19 flight) and not one before', () => {
    const s = lineUp('dizzy');
    tick(s, press(0));
    tick(s, {}, 29); // 30 ticks in
    expect(plus(s).dizzy[1]).toBe(0);
    expect(shot(s).shots).toHaveLength(1);
    tick(s);
    expect(shot(s).shots).toHaveLength(0);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
    expect(shot(s).log.at(-1)).toMatchObject({ kind: 'hit', body: 0, target: 1 });
  });
  it('speed: each tick the shot moves SHOT_UNITS_PER_TICK whole units along its line', () => {
    const s = lineUp('dizzy', 20);
    tick(s, press(0), AIM_TICKS);
    const x0 = shot(s).shots[0]!.x;
    tick(s, {}, 5);
    expect(shot(s).shots[0]!.x - x0).toBe(5 * SHOT_UNITS_PER_TICK);
    expect(Number.isInteger(shot(s).shots[0]!.x)).toBe(true);
  });
  it('range: a rival 8 tiles away is out of reach (7 tiles), 6 tiles away is hit', () => {
    const far = lineUp('dizzy', 13); // 8 tiles
    tick(far, press(0), 120);
    expect(plus(far).dizzy[1]).toBe(0);
    expect(shot(far).shots).toHaveLength(0);
    expect(shot(far).log.at(-1)).toMatchObject({ kind: 'miss' });
    const near = lineUp('dizzy', 11); // 6 tiles
    tick(near, press(0), 120);
    expect(plus(near).dizzy[1]).toBeGreaterThan(0);
  });
  it('a teammate in the line is crossed; the rival behind it is hit', () => {
    const s = sround([0, 0, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 7, 0);
    put(s, 2, 10, 0);
    s.match.bodies[0]!.face = 0;
    give(s, 0, 'dizzy');
    tick(s, press(0), 120);
    expect(plus(s).dizzy[1]).toBe(0);
    expect(plus(s).dizzy[2]).toBeGreaterThan(0);
  });
  it('with two rivals in the same square the lowest index is hit', () => {
    const s = sround([0, 1, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 9, 0);
    put(s, 2, 9, 0);
    s.match.bodies[0]!.face = 0;
    give(s, 0, 'dizzy');
    tick(s, press(0), 120);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
    expect(plus(s).dizzy[2]).toBe(0);
  });
  it('a stained rival is crossed (it is already out), the next one is hit', () => {
    const s = sround([0, 1, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 8, 0);
    put(s, 2, 11, 0);
    s.match.bodies[0]!.face = 0;
    stain(s, 1);
    give(s, 0, 'dizzy');
    tick(s, press(0), 60); // the stain lasts 72 ticks
    expect(s.match.bodies[1]!.stun).toBeGreaterThan(0);
    expect(plus(s).dizzy[1]).toBe(0);
    expect(plus(s).dizzy[2]).toBeGreaterThan(0);
  });
  it('a rival with the Cambiazo immunity is crossed', () => {
    const s = lineUp('dizzy');
    plus(s).immune[1] = 500;
    tick(s, press(0), 120);
    expect(plus(s).dizzy[1]).toBe(0);
  });
  it('furniture stops it: the F0 map has a wall at (8,1); shooting down column 8 from (8,0) ends on the first tile', () => {
    const s = sround();
    put(s, 0, 8, 0);
    put(s, 1, 8, 5);
    s.match.bodies[0]!.face = 1; // DOWN
    give(s, 0, 'dizzy');
    tick(s, press(0), 120);
    expect(plus(s).dizzy[1]).toBe(0);
    expect(shot(s).log.at(-1)).toMatchObject({ kind: 'miss', x: 8, y: 0 });
  });
  it('a stain on the shooter after the shot left does not call it back', () => {
    const s = lineUp('dizzy');
    tick(s, press(0), AIM_TICKS + 3);
    stain(s, 0);
    tick(s, {}, 40);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
  });
  it('the round ending freezes the shot (nothing moves after the last tick)', () => {
    const s = lineUp('dizzy', 20);
    tick(s, press(0), AIM_TICKS + 2);
    s.grid.over = true;
    const x = shot(s).shots[0]!.x;
    tick(s, {}, 10);
    expect(shot(s).shots[0]!.x).toBe(x);
  });
});
