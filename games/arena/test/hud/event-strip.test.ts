import { SAFE } from '@pichi/screen-kit/art';
import { describe, expect, it } from 'vitest';
import { FLOOR_BOTTOM, HUD, Y0 } from '../../screen/match/layout';
import { STRIP_FULL_TICKS, STRIP_SHRINK_TICKS, eventStrip } from '../../screen/match/hud/event-strip';

describe('the event banner strip: under the floor, short, then it shrinks', () => {
  it('sits in the bottom band: below the floor, inside the safe area', () => {
    const st = eventStrip(10, 300, 500)!;
    expect(st.y).toBeGreaterThanOrEqual(FLOOR_BOTTOM);
    expect(st.y + st.h).toBeLessThanOrEqual(SAFE.y + SAFE.h);
    expect(st.x).toBeGreaterThanOrEqual(HUD.strip!.x);
    expect(st.x + st.w).toBeLessThanOrEqual(HUD.strip!.x + HUD.strip!.w + 0.001);
  });

  it('is full for 1.5 s, then shrinks and fades, and is gone 14 ticks later', () => {
    expect(STRIP_FULL_TICKS).toBe(90);
    expect(eventStrip(STRIP_FULL_TICKS - 1, 300, 500)).toMatchObject({ alpha: 1, scale: 1 });
    const mid = eventStrip(STRIP_FULL_TICKS + STRIP_SHRINK_TICKS / 2, 300, 500)!;
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(mid.scale).toBeCloseTo(0.8);
    expect(eventStrip(STRIP_FULL_TICKS + STRIP_SHRINK_TICKS, 300, 500)).toBeNull();
    expect(eventStrip(-1, 300, 500)).toBeNull();
  });

  it('a long subtitle shrinks the line to fit the band instead of overflowing', () => {
    const st = eventStrip(0, 330, 1500)!;
    expect(st.scale).toBeLessThan(1);
    expect(st.w).toBeLessThanOrEqual(HUD.strip!.w + 0.001);
  });
});

describe('the sabotage layer never covers the board', () => {
  it('the team pills end above the floor and the strip starts below it', () => {
    for (const k of ['pillLeft', 'pillRight']) expect(HUD[k]!.y + HUD[k]!.h).toBeLessThanOrEqual(Y0);
    expect(HUD.strip!.y).toBeGreaterThanOrEqual(FLOOR_BOTTOM);
  });
});
