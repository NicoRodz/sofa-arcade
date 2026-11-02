import { describe, expect, it } from 'vitest';
import { DOWN, LEFT, NONE, RIGHT, UP, quantizeStick, toMilli, type Dir } from '../sim';

const at = (deg: number, mag = 1000, prev: Dir = NONE) =>
  quantizeStick(Math.round(Math.cos((deg * Math.PI) / 180) * mag), Math.round(Math.sin((deg * Math.PI) / 180) * mag), prev); // y down: 90 deg = DOWN

describe('grid stick quantization', () => {
  it('the dead zone (0.3) is no direction, just outside it is one', () => {
    expect(quantizeStick(290, 0, NONE)).toBe(NONE);
    expect(quantizeStick(200, 200, NONE)).toBe(NONE); // magnitude 283 < 300
    expect(quantizeStick(310, 0, NONE)).toBe(RIGHT);
  });

  it('the four axes map to the four directions', () => {
    expect([at(0), at(90), at(180), at(270)]).toEqual([RIGHT, DOWN, LEFT, UP]);
  });

  it('from rest, the diagonal goes to the dominant axis', () => {
    expect(at(40)).toBe(RIGHT);
    expect(at(50)).toBe(DOWN);
  });

  it('hysteresis: the heading axis only flips 15 deg past the diagonal', () => {
    expect(at(55, 1000, RIGHT)).toBe(RIGHT); // already past 45 but inside the 15 deg band
    expect(at(58, 1000, RIGHT)).toBe(RIGHT);
    expect(at(62, 1000, RIGHT)).toBe(DOWN);
    expect(at(35, 1000, DOWN)).toBe(DOWN); // 55 deg from the vertical axis: still inside the band
    expect(at(28, 1000, DOWN)).toBe(RIGHT); // 62 deg from the vertical
    expect(at(118, 1000, DOWN)).toBe(DOWN);
    expect(at(152, 1000, DOWN)).toBe(LEFT);
  });

  it('a stick packet (float) becomes integer milli units, clamped', () => {
    expect(toMilli(0.3456)).toBe(346);
    expect(toMilli(-7)).toBe(-1000);
    expect(Number.isInteger(toMilli(0.123456))).toBe(true);
  });
});
