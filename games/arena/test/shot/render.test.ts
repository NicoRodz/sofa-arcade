// What the TV does with the projectiles: the feed turns `sab.shot.log` into events, each has its sound cue, the scene draws the aim, the shot, what it did and the Pegote on its carrier, and a phone is told.
import { describe, expect, it } from 'vitest';
import { AIM_TICKS, MAX_PASSES, SHOT_LOG_KINDS, type ManchazoState } from '../../sim';
import { SHOT_CUES, cueOf, playCues, setCueSink } from '../../screen/match/hud/cues';
import { Feed, feedHash } from '../../screen/match/hud/feed';
import { createSabotageHints } from '../../screen/match/phone-hints';
import { aimLength, drawAim, drawGlueCarrier, drawShots } from '../../screen/match/scene-shot';
import { recorder } from '../art/recorder';
import { give, press, put, shot, sround, tick } from './shot-drive';

const frame = (rec: ReturnType<typeof recorder>) => ({ g: rec.proxy as never, x0: 0, y0: 0, px: 56 });
const drawn = (fn: (f: ReturnType<typeof frame>) => void) => {
  const r = recorder();
  fn(frame(r));
  return r.calls;
};
const pinata = (s: ManchazoState, stuck: number, passes: number, lock: number, fuse = 100) =>
  s.match.pinatas.push({ id: s.match.nextId++, x: 9, y: 14, team: 0, owner: 0, fuse, radius: 2, mod: 'glue', stuck, passes, lock });

/** Row 0 is open from side to side (the F0 map): body 0 at (5,0) facing right with `kind`, the rival 1 at (9,0). */
function duel(kind: 'glue' | 'swap' | 'dizzy' = 'glue') {
  const s = sround([0, 1]);
  put(s, 0, 5, 0);
  put(s, 1, 9, 0);
  s.match.bodies[0]!.face = 0;
  give(s, 0, kind);
  return s;
}

describe('feed and cues: the six moments of a shot', () => {
  it('launch then hit, with the shooter, its slot and team, and one cue each', () => {
    const s = duel('dizzy');
    const feed = new Feed();
    tick(s, press(0));
    feed.observe(s);
    for (let k = 0; k < 60; k++) tick(s), feed.observe(s);
    const ev = feed.log.filter((e) => e.type === 'shot');
    expect(ev.map((e) => e.type === 'shot' && e.what)).toEqual(['launch', 'hit']);
    expect(ev[0]).toMatchObject({ body: 0, slot: 0, team: 0, kind: 'dizzy' });
    expect(ev.map(cueOf)).toEqual([SHOT_CUES.launch, SHOT_CUES.hit]);
  });
  it('a clash, a miss, a cancel and a pass reach the feed with their own cue; every kind of the log has one', () => {
    expect(Object.keys(SHOT_CUES).sort()).toEqual([...SHOT_LOG_KINDS].sort());
    const clash = sround([0, 1]);
    put(clash, 0, 9, 0);
    put(clash, 1, 17, 0);
    clash.match.bodies[0]!.face = 0;
    clash.match.bodies[1]!.face = 2;
    give(clash, 0, 'dizzy');
    give(clash, 1, 'dizzy');
    const miss = duel('glue');
    put(miss, 1, 5, 14); // nobody in the line: the shot ends at its range
    const pass = sround([0, 1, 0]);
    [0, 1, 2].forEach((i, k) => put(pass, i, 3 + k * 4, 14));
    put(pass, 2, 10, 14);
    put(pass, 1, 9, 14);
    pinata(pass, 1, 0, 0);
    const kinds = new Set<string>();
    for (const [s, inputs] of [
      [clash, { ...press(0), ...press(1) }],
      [miss, press(0)],
      [duel('dizzy'), press(0)],
      [pass, press(1)],
    ] as const) {
      const feed = new Feed();
      for (let k = 0; k < 80; k++) tick(s, k === 0 ? inputs : {}), feed.observe(s);
      feed.log.forEach((e) => e.type === 'shot' && kinds.add(e.what));
    }
    const cancel = duel('glue');
    const feed = new Feed();
    cancel.match.sab!.shot!.log.push({ kind: 'cancel', tick: 0, body: 0, target: -1, x: 5, y: 0, card: 'glue' });
    feed.observe(cancel);
    feed.log.forEach((e) => e.type === 'shot' && kinds.add(e.what));
    expect([...kinds].sort()).toEqual([...SHOT_LOG_KINDS].sort());
  });
  it('the sink gets each shot cue once and the hash of the feed depends on the shot events', () => {
    const s = duel('swap');
    const feed = new Feed();
    tick(s, press(0));
    feed.observe(s);
    for (let k = 0; k < 60; k++) tick(s), feed.observe(s);
    const got: string[] = [];
    setCueSink((c) => void got.push(c));
    playCues(feed.fresh().filter((e) => e.type === 'shot'));
    setCueSink(null);
    expect(got).toEqual([SHOT_CUES.launch, SHOT_CUES.hit]);
    const h = feedHash(feed.log);
    expect(feedHash(feed.log.filter((e) => e.type !== 'shot'))).not.toBe(h);
  });
});

describe('scene: the aim, the shot in the air, what it did, the Pegote on its carrier', () => {
  it('the aim line follows the heading, is cut by a wall and shows only while aiming', () => {
    const s = duel('dizzy');
    expect(drawn((f) => drawAim(f, s))).toEqual([]);
    tick(s, press(0));
    const open = drawn((f) => drawAim(f, s));
    expect(open.some((c) => c.startsWith('lineBetween('))).toBe(true);
    expect(open.join('|')).toContain(
      `lineBetween(${(5.5 * 56).toFixed(3)},${(0.5 * 56).toFixed(3)},${(12.5 * 56).toFixed(3)},${(0.5 * 56).toFixed(3)})`,
    ); // from the tile centre, 7 tiles right
    expect(aimLength(s, 5, 0, 0)).toBe(7);
    expect(aimLength(s, 5, 0, 1)).toBe(2.5); // down: a wall in the third tile
    expect(aimLength(s, 5, 0, 2)).toBe(5.5); // left: the map's edge
    s.match.bodies[0]!.face = 1; // aiming down into the wall
    const wall = drawn((f) => drawAim(f, s)).join('|');
    expect(wall).toContain(
      `lineBetween(${(5.5 * 56).toFixed(3)},${(0.5 * 56).toFixed(3)},${(5.5 * 56).toFixed(3)},${(0.5 * 56 + 2.5 * 56).toFixed(3)})`,
    );
    expect(AIM_TICKS).toBe(12);
  });
  it('a shot in the air is drawn at its position with its card; with nothing in the air and no log, nothing', () => {
    const s = duel('glue');
    expect(drawn((f) => drawShots(f, s))).toEqual([]);
    tick(s, press(0), AIM_TICKS + 3);
    const p = shot(s).shots[0]!;
    const calls = drawn((f) => drawShots(f, s)).join('|');
    expect(calls).toContain(`strokeCircle(${((p.x * 56) / 16).toFixed(3)},${((p.y * 56) / 16).toFixed(3)},${(56 * 0.58).toFixed(3)})`);
  });
  it('a clash draws the starburst, a pass draws the arc from the passer to the receiver', () => {
    const s = sround([0, 1, 0]);
    put(s, 0, 8, 14);
    put(s, 1, 9, 14);
    put(s, 2, 10, 14);
    pinata(s, 1, 0, 0);
    tick(s, press(1));
    const calls = drawn((f) => drawShots(f, s)).join('|');
    const [a, b] = [s.grid.bodies[1]!, s.grid.bodies[0]!];
    expect(calls).toContain(
      `lineBetween(${((a.x * 56) / 16).toFixed(3)},${((a.y * 56) / 16).toFixed(3)},${((b.x * 56) / 16).toFixed(3)},${((b.y * 56) / 16).toFixed(3)})`,
    );
    const c = sround([0, 1]);
    shot(c).log.push({ kind: 'clash', tick: c.grid.tick, body: 0, target: -1, x: 13, y: 0, card: 'dizzy' });
    expect(drawn((f) => drawShots(f, c)).filter((x) => x.startsWith('lineBetween(')).length).toBe(8);
    c.grid.tick += 40; // long gone
    expect(drawn((f) => drawShots(f, c))).toEqual([]);
  });
  it('the Pegote on its carrier: one filled pip per pass, the fuse arc shrinks, the lock or the ready ring', () => {
    const pips = (calls: string[]) => calls.filter((c) => c.startsWith(`fillCircle(`) && c.endsWith(`,${(56 * 0.16).toFixed(3)})`)).length;
    for (let used = 0; used <= MAX_PASSES; used++) {
      const s = sround([0, 1]);
      pinata(s, 1, used, 0);
      expect(pips(drawn((f) => drawGlueCarrier(f, s, 1, 100, 100)))).toBe(used);
    }
    const s = sround([0, 1]);
    pinata(s, 1, 1, 30, 120);
    const full = drawn((f) => drawGlueCarrier(f, s, 1, 100, 100)).filter((c) => c.startsWith('arc('));
    s.match.pinatas[0]!.fuse = 60;
    s.match.pinatas[0]!.lock = 0;
    const half = drawn((f) => drawGlueCarrier(f, s, 1, 100, 100)).filter((c) => c.startsWith('arc('));
    const end = (c: string) => Number(c.split(',')[4]);
    expect(end(full[0]!)).toBeCloseTo(-Math.PI / 2 + Math.PI * 2, 2); // full fuse: the whole ring
    expect(end(half[0]!)).toBeCloseTo(-Math.PI / 2 + Math.PI, 2); // half
    expect(full).toHaveLength(2); // fuse + lock arc
    expect(half).toHaveLength(1); // no lock: the ready ring is a circle, not an arc
    expect(drawn((f) => drawGlueCarrier(f, s, 0, 100, 100))).toEqual([]); // not the carrier
    const old = sround([0, 1]);
    old.match.pinatas.push({ id: 9, x: 9, y: 14, team: 0, owner: 0, fuse: 100, radius: 2, mod: 'glue', stuck: 1 }); // a Pegote of the old rule: no passes
    expect(drawn((f) => drawGlueCarrier(f, old, 1, 100, 100))).toEqual([]);
  });
});

describe('phone: "Apuntando…" while aiming, "¡Te pegaron el Pegote!" with the Pegote on (and a buzz)', () => {
  it('hint and buzz, nothing else is sent to the protocol', () => {
    const s = duel('glue');
    const sent: { t: string; playerId: number; a?: string | null; kind?: string }[] = [];
    const hints = createSabotageHints(
      (m) => void sent.push(m as never),
      (slot) => slot + 100,
    );
    tick(s, press(0));
    hints.sync(s, 1000);
    expect(sent.find((m) => m.t === 'hint' && m.playerId === 100)!.a).toBe('Apuntando…');
    tick(s, {}, 60);
    pinata(s, 1, 0, 0);
    hints.sync(s, 2000);
    expect(sent.find((m) => m.t === 'hint' && m.playerId === 101 && m.a === '¡Te pegaron el Pegote!')).toBeTruthy();
    expect(sent.some((m) => m.t === 'buzz' && m.kind === 'big' && m.playerId === 101)).toBe(true);
    expect(new Set(sent.map((m) => m.t))).toEqual(new Set(['hint', 'buzz']));
  });
});
