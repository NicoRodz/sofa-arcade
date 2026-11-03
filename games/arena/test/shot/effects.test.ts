import { describe, expect, it } from 'vitest';
import { DIZZY_TICKS, GLUE_FUSE_TICKS, IMMUNE_TICKS, FUSE_TICKS } from '../../sim';
import { give, plus, press, put, shot, sround, tick } from './shot-drive';

function duel(kind: 'glue' | 'swap' | 'dizzy', rx = 9) {
  const s = sround();
  put(s, 0, 5, 0);
  put(s, 1, rx, 0);
  s.match.bodies[0]!.face = 0;
  give(s, 0, kind);
  return s;
}
const FLY = 12 + 19; // aim + flight to a rival 4 tiles away

describe("Pegote: rides the rival it hits, in the shooter's colour, with at least the normal fuse", () => {
  it('a hit sticks a pinata to the rival: fuse max(120, normal) minus the tick it landed, shooter colour, 0 passes', () => {
    const s = duel('glue');
    tick(s, press(0), FLY);
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.pinatas[0]).toMatchObject({ mod: 'glue', stuck: 1, team: 0, owner: 0, fuse: GLUE_FUSE_TICKS - 1, passes: 0, lock: 0 });
    expect(GLUE_FUSE_TICKS).toBe(Math.max(FUSE_TICKS, 120));
    expect(GLUE_FUSE_TICKS).toBe(120);
  });
  it('it goes off where the rival stands after 120 ticks and stains it', () => {
    const s = duel('glue');
    tick(s, press(0), FLY + 118);
    expect(s.match.bodies[1]!.stun).toBe(0);
    tick(s);
    expect(s.match.bodies[1]!.stun).toBeGreaterThan(0);
  });
  it('a miss leaves a plain pinata (no card on it) on the tile where the shot stopped', () => {
    const s = duel('glue', 14); // 9 tiles: out of reach
    tick(s, press(0), 12 + 38);
    expect(shot(s).shots).toHaveLength(0);
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.pinatas[0]).toMatchObject({ x: 12, y: 0, team: 0, owner: 0 });
    expect(s.match.pinatas[0]!.mod).toBeUndefined();
  });
  it('a miss onto a tile that already holds a pinata makes none', () => {
    const s = duel('glue', 14);
    s.match.pinatas.push({ id: 90, x: 12, y: 0, team: 1, owner: 1, fuse: 9999, radius: 2 });
    tick(s, press(0), 12 + 38);
    expect(s.match.pinatas).toHaveLength(1);
  });
});

describe('Cambiazo: shooter and rival trade places, both immune for 0.5 s', () => {
  it('on the hit the two bodies swap tiles; a miss swaps nothing', () => {
    const s = duel('swap');
    tick(s, press(0), FLY);
    expect(s.grid.bodies[0]!.x).toBe(9 * 16 + 8);
    expect(s.grid.bodies[1]!.x).toBe(5 * 16 + 8);
    expect(plus(s).immune[0]).toBe(IMMUNE_TICKS);
    expect(plus(s).immune[1]).toBe(IMMUNE_TICKS);
    const far = duel('swap', 14);
    tick(far, press(0), 120);
    expect(far.grid.bodies[0]!.x).toBe(5 * 16 + 8);
    expect(far.grid.bodies[1]!.x).toBe(14 * 16 + 8);
  });
  it('a shooter stained while the shot flies loses the trade: nothing moves', () => {
    const s = duel('swap');
    tick(s, press(0), 12 + 5);
    s.match.bodies[0]!.stun = 72;
    tick(s, {}, 40);
    expect(s.grid.bodies[1]!.x).toBe(9 * 16 + 8);
    expect(shot(s).log.some((e) => e.kind === 'cancel')).toBe(true);
  });
});

describe("Mareo: the rival's stick is inverted for DIZZY_TICKS", () => {
  it('a hit sets 180 ticks', () => {
    const s = duel('dizzy');
    tick(s, press(0), FLY);
    expect(plus(s).dizzy[1]).toBe(DIZZY_TICKS);
    expect(DIZZY_TICKS).toBe(180);
  });
  it('the dizzy rival really steers backwards', () => {
    const s = duel('dizzy', 7);
    tick(s, press(0), 12 + 12);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
    const x = s.grid.bodies[1]!.x;
    tick(s, { 1: { sx: 1000, sy: 0, drop: false } }, 20);
    expect(s.grid.bodies[1]!.x).toBeLessThan(x); // right on the stick, left on the floor
  });
});
