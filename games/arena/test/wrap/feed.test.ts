import { describe, expect, it } from 'vitest';
import { cueOf } from '../../screen/match/hud/cues';
import { Feed, feedHash } from '../../screen/match/hud/feed';
import { paintTile } from '../../sim';
import { USE, blastAt, face, give, put, tick, wrapRound } from './wrap-drive';

/** A body soaks, then is stained loaded; another lands a tape: the feed must report the tape, the burst and (for a second sponge) the squeeze, each with its cue. */
function play() {
  const s = wrapRound([0, 1, 0, 1]);
  const feed = new Feed();
  const run = (inputs: Parameters<typeof tick>[1], n = 1) => {
    for (let k = 0; k < n; k++) {
      tick(s, inputs);
      feed.observe(s);
    }
  };
  for (const [x, y] of [11, 12, 13, 14, 15].map((x): [number, number] => [x, 0])) paintTile(s.match, x, y, 1, 0);
  put(s, 0, 13, 0);
  put(s, 1, 24, 14);
  put(s, 2, 1, 7);
  put(s, 3, 24, 12);
  face(s, 2, 0);
  give(s, 0, 'sponge');
  give(s, 2, 'tape');
  feed.observe(s); // the baseline
  run({ 0: USE, 2: USE }, 12);
  run({ 0: USE }); // squeeze at once
  give(s, 0, 'sponge');
  for (const [x, y] of [11, 12, 13].map((x): [number, number] => [x, 0])) paintTile(s.match, x, y, 1, 0);
  run({ 0: USE });
  blastAt(s, 13, 2, 1, 1);
  run({});
  return { s, feed };
}

describe('the TV feed reports the PR6 effects, once each, with a cue', () => {
  it('a tape landing, a squeeze and a burst, in the order they happened', () => {
    const { feed } = play();
    const wraps = feed.log.flatMap((e) => (e.type === 'wrap' ? [e.what] : []));
    expect(wraps).toEqual(['squeeze', 'tape', 'burst']);
    expect(feed.log.filter((e) => e.type === 'fired').map((e) => (e.type === 'fired' ? e.kind : ''))).toEqual([
      'sponge',
      'tape',
      'sponge',
      'sponge',
    ]);
    expect(
      feed
        .fresh()
        .map(cueOf)
        .filter((c) => c.startsWith('wrap-')),
    ).toEqual(['wrap-squeeze', 'wrap-tape', 'wrap-burst']);
    expect(feed.fresh()).toEqual([]);
  });
  it('is only a reader: the same inputs give the same log hash, and a log without the wrap entries hashes differently', () => {
    const a = feedHash(play().feed.log);
    expect(feedHash(play().feed.log)).toBe(a);
    expect(feedHash(play().feed.log.filter((e) => e.type !== 'wrap'))).not.toBe(a);
  });
});
