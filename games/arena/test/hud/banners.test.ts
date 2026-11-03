import { describe, expect, it } from 'vitest';
import { ALL_KINDS } from '../../sim';
import { Banners, BANNER_TICKS, sabotageName } from '../../screen/match/hud/banners';
import { SABOTAGE_CUES, SWING_CUE, cueOf, playCues, setCueSink } from '../../screen/match/hud/cues';
import type { FeedEvent } from '../../screen/match/hud/feed';

const team = (t: number) => (t === 0 ? 'Naranja' : 'Azul');
const fired = (tick: number, t: number, slot: number, kind: 'dizzy' | 'roller' | 'tape' = 'dizzy'): FeedEvent => ({ type: 'fired', tick, body: slot, slot, team: t, kind });

describe('sabotage banners', () => {
  it('reads "AZUL 3 → MAREO" and lives exactly 60 ticks', () => {
    const b = new Banners(team);
    b.push([fired(100, 1, 2)]);
    expect(b.visible(100)[1]?.text).toBe('AZUL 3 → MAREO');
    expect(b.visible(100 + BANNER_TICKS - 1)[1]).not.toBeNull();
    expect(b.visible(100 + BANNER_TICKS)[1]).toBeNull();
    expect(b.visible(100)[0]).toBeNull();
  });

  it('never more than 2 on screen: one pill per team, the newest of a team when no swing ranks them', () => {
    const b = new Banners(team);
    b.push([fired(10, 0, 0), fired(12, 0, 1, 'roller'), fired(14, 0, 2, 'tape'), fired(15, 1, 3)]);
    const v = b.visible(20);
    expect(v.filter(Boolean)).toHaveLength(2);
    expect(v[0]?.kind).toBe('tape');
  });

  it('with several alive in a team the one with the biggest swing since it was played wins', () => {
    const b = new Banners(team);
    b.push([fired(10, 0, 0, 'roller'), fired(20, 0, 1, 'tape')]);
    b.push([{ type: 'swing', tick: 25, team: 0, pp: 4 }]);
    expect(b.visible(30)[0]?.kind).toBe('tape'); // both were alive: the swing counts for both, the newest wins the tie
    const c = new Banners(team);
    c.push([fired(10, 0, 0, 'roller')]);
    c.push([{ type: 'swing', tick: 15, team: 0, pp: 4 }]);
    c.push([fired(20, 0, 1, 'tape')]);
    expect(c.visible(30)[0]?.kind).toBe('roller'); // the swing happened before the tape was played: the roller keeps the pill
  });

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
