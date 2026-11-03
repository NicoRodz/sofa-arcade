import { describe, expect, it } from 'vitest';
import { FINAL_TICKS, PHASE_WARN_TICKS, openingTicks, stepManchazo } from '../../sim';
import { bannerOf } from '../../screen/match/event-banner';
import { Banners } from '../../screen/match/hud/banners';
import { PHASE_CUES, cueOf, playCues, setCueSink } from '../../screen/match/hud/cues';
import { Feed, feedHash, type FeedEvent } from '../../screen/match/hud/feed';
import { phaseRound, quietEvents } from '../phase/phase-drive';

const name = (t: number) => (t === 0 ? 'Naranja' : 'Azul');

/** A quiet 75 s round stepped with the feed reading it after each tick, as ManchazoRun does. */
function drive(teams: readonly number[] = [0, 1], upTo = 1e9) {
  const s = quietEvents(phaseRound(teams));
  const f = new Feed();
  while (!s.grid.over && s.grid.tick < upTo) {
    stepManchazo(s, new Map());
    f.observe(s);
  }
  return { s, f };
}
const phases = (f: Feed) => f.log.filter((e): e is Extract<FeedEvent, { type: 'phase' }> => e.type === 'phase');

describe('the TV announces the acts', () => {
  it('the feed logs each warning (120 ticks ahead) and each change once, with its tick', () => {
    const { s, f } = drive();
    const open = openingTicks(4500);
    const fin = s.grid.durationTicks - FINAL_TICKS;
    expect(phases(f)).toEqual([
      { type: 'phase', tick: open - PHASE_WARN_TICKS, phase: 'scramble', warn: true },
      { type: 'phase', tick: open, phase: 'scramble', warn: false },
      { type: 'phase', tick: fin - PHASE_WARN_TICKS, phase: 'final', warn: true },
      { type: 'phase', tick: fin, phase: 'final', warn: false },
    ]);
  });
  it('each one has its own sound cue and reaches the sink once (`setCueSink`), the warning apart from the change', () => {
    const { f } = drive();
    const heard: string[] = [];
    setCueSink((cue) => heard.push(cue));
    try {
      playCues(f.fresh());
      playCues(f.fresh()); // nothing new the second time
    } finally {
      setCueSink(null);
    }
    expect(heard).toEqual([PHASE_CUES.warn, PHASE_CUES.scramble, PHASE_CUES.warn, PHASE_CUES.final]);
    expect(new Set(heard).size).toBe(3);
    expect(cueOf(phases(f)[3]!)).toBe('phase-final');
  });
  it('the strip says ¡FINAL! for 3 s after the change, then the previous message is gone; before it, the warning', () => {
    const s = quietEvents(phaseRound());
    const fin = s.grid.durationTicks - FINAL_TICKS;
    const seen = (t: number) => {
      while (s.grid.tick <= t) stepManchazo(s, new Map());
      return bannerOf(s, name);
    };
    expect(seen(fin - PHASE_WARN_TICKS)?.title).toBe('FINAL EN 2 s');
    expect(seen(fin)).toMatchObject({ kind: 'phaseFinal', title: '¡FINAL!', team: -1, age: 1 });
    expect(seen(fin + 179)).toBeNull();
  });
  it('the pills of PR1 (one per team, for sabotages) ignore the phase events', () => {
    const { f } = drive();
    const b = new Banners(name);
    b.push(f.log);
    expect(b.visible(5000)).toEqual([null, null]);
  });
  it('replay: the same round gives the same feed hash; the mirrored round (teams swapped) logs the same acts at the same ticks', () => {
    const a = drive([0, 1, 0, 1]).f;
    const b = drive([0, 1, 0, 1]).f;
    expect(feedHash(a.log)).toBe(feedHash(b.log));
    const m = drive([1, 0, 1, 0]).f;
    expect(phases(m)).toEqual(phases(a));
    expect(feedHash(m.log)).toBe(feedHash(a.log));
  });
});
