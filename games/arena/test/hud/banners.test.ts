import { describe, expect, it } from 'vitest';
import { ALL_KINDS } from '../../sim';
import { sabotageName } from '../../screen/match/hud/banners';
import { SABOTAGE_CUES, SWING_CUE, cueOf, playCues, setCueSink } from '../../screen/match/hud/cues';
import type { FeedEvent } from '../../screen/match/hud/feed';

const fired = (tick: number, t: number, slot: number, kind: 'dizzy' | 'roller' | 'tape' = 'dizzy'): FeedEvent => ({
  type: 'fired',
  tick,
  body: slot,
  slot,
  team: t,
  kind,
});

describe('sabotage banners', () => {
  it('every card has a name and a sound cue (the cue table is the future audio hook)', () => {
    for (const k of ALL_KINDS) {
      expect(sabotageName(k)).toBeTruthy();
      expect(SABOTAGE_CUES[k]).toMatch(/^sab-/);
    }
    expect(cueOf({ type: 'swing', tick: 0, team: 0, pp: 2 })).toBe(SWING_CUE);
  });

  it('the cue sink gets one cue per event; with none connected nothing happens', () => {
    const got: string[] = [];
    playCues([fired(1, 0, 0)]); // no sink: dropped
    setCueSink((c) => got.push(c));
    playCues([fired(1, 0, 0), { type: 'swing', tick: 2, team: 1, pp: 3 }]);
    setCueSink(null);
    playCues([fired(3, 0, 0)]);
    expect(got).toEqual(['sab-dizzy', 'score-swing']);
  });
});
