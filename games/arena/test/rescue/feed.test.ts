// What the TV does with a rescue and a loot: the feed turns the sim's log into events, each event has its sound cue (setCueSink), the scene draws the ring, the glow and the cards, and a phone buzzes.
import { describe, expect, it } from 'vitest';
import { RESCUE_GLOW_TICKS, RESCUE_TICKS, STUN_TICKS } from '../../sim';
import { LOOT_CUES, RESCUE_CUE, cueOf, playCues, setCueSink } from '../../screen/match/hud/cues';
import { Feed, feedHash } from '../../screen/match/hud/feed';
import { createSabotageHints } from '../../screen/match/phone-hints';
import { drawLoot, drawRescue } from '../../screen/match/scene-rescue';
import { recorder } from '../art/recorder';
import { blastAt, give, put, res, rround, stain, tick } from './rescue-drive';

const frame = (rec: ReturnType<typeof recorder>) => ({ g: rec.proxy as never, x0: 0, y0: 0, px: 56 });

/** A drop, a rescue, a take: body 0 (team 0, holding a roller) is stained at (3, 7), freed by body 2, and a rival picks the card up. */
function story() {
  const s = rround([0, 1, 0]);
  const feed = new Feed();
  put(s, 0, 3, 7);
  put(s, 2, 5, 7);
  put(s, 1, 20, 3);
  give(s, 0, 'roller');
  blastAt(s, 1, 7); // two tiles to the left of body 0: it stains body 0 (3, 7) and not the teammate waiting at (5, 7)
  for (let k = 0; k < 400 && !s.grid.over; k++) {
    if (k === 1) put(s, 2, 4, 7); // the teammate walks up next to it
    if (k === 40) put(s, 1, 3, 7); // and the rival steps on the card
    tick(s);
    feed.observe(s);
  }
  return { s, feed };
}

describe('feed: rescue and loot events', () => {
  it('a drop, a rescue and a take, in order, with the body, slot and team', () => {
    const { feed } = story();
    const ev = feed.log.filter((e) => e.type === 'rescue' || e.type === 'loot');
    expect(ev.map((e) => (e.type === 'loot' ? `loot:${e.what}:${e.kind}` : e.type))).toEqual([
      'loot:drop:roller',
      'rescue',
      'loot:take:roller',
    ]);
    expect(ev[0]).toMatchObject({ body: 0, slot: 0, team: 0 });
    expect(ev[1]).toMatchObject({ body: 0, slot: 0, team: 0 });
    expect(ev[2]).toMatchObject({ body: 1, slot: 1, team: 1 });
  });
  it('replay: the same round gives the same feed hash, and a different round another', () => {
    expect(feedHash(story().feed.log)).toBe(feedHash(story().feed.log));
    expect(feedHash(story().feed.log)).not.toBe(feedHash([]));
  });
  it('without the flag the feed has no rescue and no loot', () => {
    const s = rround([0, 1, 0], 5, { rescue: false });
    const feed = new Feed();
    put(s, 0, 3, 7);
    give(s, 0, 'roller');
    blastAt(s, 1, 7);
    for (let k = 0; k < 30; k++) {
      tick(s);
      feed.observe(s);
    }
    expect(feed.log.filter((e) => e.type === 'rescue' || e.type === 'loot')).toEqual([]);
  });
});

describe('cues: one sound cue per event, through setCueSink', () => {
  it('the cue ids', () => {
    const { feed } = story();
    const cues = feed.log.filter((e) => e.type === 'rescue' || e.type === 'loot').map(cueOf);
    expect(cues).toEqual([LOOT_CUES.drop, RESCUE_CUE, LOOT_CUES.take]);
    expect([LOOT_CUES.drop, RESCUE_CUE, LOOT_CUES.take, LOOT_CUES.expire]).toEqual([
      'loot-drop',
      'rescue-free',
      'loot-take',
      'loot-expire',
    ]);
  });
  it('the sink gets each cue once, in order, and nothing when it is disconnected', () => {
    const { feed } = story();
    const got: string[] = [];
    setCueSink((cue) => void got.push(cue));
    playCues(feed.fresh().filter((e) => e.type === 'rescue' || e.type === 'loot'));
    setCueSink(null);
    playCues(feed.log);
    expect(got).toEqual(['loot-drop', 'rescue-free', 'loot-take']);
  });
});

describe('scene: the rescue ring, the glow and the cards on the floor', () => {
  it('a stained body with a teammate in contact draws the ring; none without contact, none when it is not stained', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    tick(s, {}, 6);
    const a = recorder();
    drawRescue(frame(a), s, 0, 100, 100);
    expect(a.calls.some((c) => c.startsWith('arc('))).toBe(true);
    expect(a.calls.join('|')).toContain(
      `arc(100.000,100.000,${(56 * 0.72).toFixed(3)},${(-Math.PI / 2).toFixed(3)},${(-Math.PI / 2 + (Math.PI * 2 * 6) / RESCUE_TICKS).toFixed(3)}`,
    );
    const b = recorder();
    drawRescue(frame(b), s, 1, 100, 100); // the rival: no contact, no glow
    expect(b.calls).toEqual([]);
  });
  it('after the rescue the freed body and its rescuer glow; the glow fades with its ticks', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    tick(s, {}, RESCUE_TICKS);
    const a = recorder();
    drawRescue(frame(a), s, 2, 100, 100);
    expect(a.calls.length).toBeGreaterThan(0);
    tick(s, {}, RESCUE_GLOW_TICKS);
    const b = recorder();
    drawRescue(frame(b), s, 2, 100, 100);
    expect(b.calls).toEqual([]);
    expect(STUN_TICKS).toBeGreaterThan(RESCUE_TICKS);
  });
  it('a card on the floor draws its plate and ring, and nothing is drawn without the flag or without loot', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 1, 20, 3);
    give(s, 0, 'fan');
    blastAt(s, 1, 7);
    tick(s);
    const a = recorder();
    drawLoot(frame(a), s);
    expect(a.calls.length).toBeGreaterThan(5);
    const none = recorder();
    drawLoot(frame(none), rround([0, 1]));
    expect(none.calls).toEqual([]);
    const off = recorder();
    drawLoot(frame(off), rround([0, 1], 5, { rescue: false }));
    expect(off.calls).toEqual([]);
    expect(res(s).loot).toHaveLength(1);
  });
});

describe('phone: a freed body and its rescuer buzz, a stained body is told what to do', () => {
  it('buzz big when the glow starts; the stained hint names the rescue', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    const sent: { t: string; playerId: number; kind?: string; a?: string | null }[] = [];
    const hints = createSabotageHints(
      (m) => void sent.push(m as never),
      (slot) => slot + 100,
    );
    stain(s, 0);
    tick(s);
    hints.sync(s, 1000);
    expect(sent.find((m) => m.t === 'hint' && m.playerId === 100)!.a).toContain('Manchado');
    tick(s, {}, RESCUE_TICKS);
    hints.sync(s, 2000);
    const buzzes = sent.filter((m) => m.t === 'buzz' && m.kind === 'big').map((m) => m.playerId);
    expect(buzzes.sort()).toEqual([100, 102]);
    hints.sync(s, 2100);
    expect(sent.filter((m) => m.t === 'buzz' && m.kind === 'big')).toHaveLength(2); // once, not every frame
  });
});
