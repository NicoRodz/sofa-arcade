// F6: which backbuffer a game gets. The rule that matters most: a game that did not opt in is 1 whatever the URL or the display says.
import { describe, expect, it } from 'vitest';
import { MIN_PHYSICAL_WIDTH, pickRenderScale, renderOverride } from './render-scale';

const tv4k = { screenWidth: 1920, dpr: 2 }; // a 4K TV set to "looks like 1080p"
const laptop = { screenWidth: 1440, dpr: 2 };

describe('pickRenderScale', () => {
  it('a game that did not opt in stays at 1, on a 4K display and with ?render=2', () => {
    expect(pickRenderScale({ want: 1, override: null, ...tv4k })).toBe(1);
    expect(pickRenderScale({ want: 1, override: 2, ...tv4k })).toBe(1);
  });

  it('an opted-in game goes to 2 only on a display with enough physical pixels', () => {
    expect(pickRenderScale({ want: 2, override: null, ...tv4k })).toBe(2);
    expect(pickRenderScale({ want: 2, override: null, screenWidth: 3840, dpr: 1 })).toBe(2);
    expect(pickRenderScale({ want: 2, override: null, ...laptop })).toBe(1);
    expect(pickRenderScale({ want: 2, override: null, screenWidth: 1920, dpr: 1 })).toBe(1);
    expect(MIN_PHYSICAL_WIDTH).toBe(3200);
  });

  it('?render= overrides the display for an opted-in game, both ways', () => {
    expect(pickRenderScale({ want: 2, override: 2, ...laptop })).toBe(2);
    expect(pickRenderScale({ want: 2, override: 1, ...tv4k })).toBe(1);
  });
});

describe('renderOverride', () => {
  it('reads ?render=1|2 and ignores anything else', () => {
    expect(renderOverride('?render=2')).toBe(2);
    expect(renderOverride('?room=A&render=1')).toBe(1);
    expect(renderOverride('?render=3')).toBeNull();
    expect(renderOverride('')).toBeNull();
  });
});
