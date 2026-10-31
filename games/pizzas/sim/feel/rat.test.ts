// The gentle rat (feel/rat.ts), each rule against the old rat in the same situation (flag off = the control).
import { describe, expect, it } from 'vitest';
import { fixedMap } from '../maps';
import { RAT_SPEED } from '../midround';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '../overcooked';
import { RAT_BONUS, RAT_GENTLE } from './rat';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const MAP = fixedMap('1')!;
type Log = { t: number; type: string; p: Record<string, unknown> }[];

/** A coop round of map 1 whose event is the rat at 3 s; `items` counters (by index in reading order) hold a raw tomato. */
function round(magnet: boolean, items: number[] = [], seed = 5) {
  const g = createGame({ mapId: MAP.id, rows: MAP.rows, spawns: MAP.spawns, n: 2, seed, events: true, magnet, hazardsV2: false });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  Object.assign(g.mid!, { kind: 'rat', startAt: 3000, announceAt: 0, endAt: Infinity, phase: 'wait', dark: false, rat: null });
  const counters = g.stations.filter((s) => s.kind === 'counter');
  for (const i of items) counters[i]!.item = 'raw1';
  const log: Log = [];
  for (const k of ['rat:appear', 'rat:steal', 'rat:scared', 'rat:gone', 'rat:target', 'rat:near'] as const)
    g.bus.on(k, ((p: never) => log.push({ t: g.time, type: k, p: p as Record<string, unknown> })) as never);
  for (const id of [1, 2]) Object.assign(g.players.get(id)!, { x: 14.5, y: 7.5 + (id - 1) * -0.01, fx: 0, fy: 1 }); // out of the way (the bottom right corner)
  return { g, log };
}
const step = (g: Game, n: number, c: Map<number, Controls> = new Map()) => {
  for (let i = 0; i < n; i++) tick(g, c);
};
const until = (g: Game, f: () => boolean, ms = 40_000, c: Map<number, Controls> = new Map()) => {
  const end = g.time + ms;
  while (!f() && g.time < end && !g.over) tick(g, c);
  return f();
};
const at = (log: Log, type: string) => log.filter((e) => e.type === type);
const appear = (g: Game) => until(g, () => !!g.mid!.rat, 5000);

describe('walks gentle', () => {
  it('70% of the old speed, in runs with a pause after each', () => {
    expect(RAT_GENTLE.speed / RAT_SPEED).toBeCloseTo(0.7, 5);
    const { g } = round(true, [3]);
    appear(g);
    const r = g.mid!.rat!;
    let max = 0,
      moving = 0,
      stopped = 0,
      longestStop = 0,
      run = 0;
    for (let i = 0; i < 240 && g.mid!.rat?.state === 'seek'; i++) {
      const [x, y] = [r.x, r.y];
      tick(g, new Map());
      const v = (Math.hypot(r.x - x, r.y - y) / TICK_MS) * 1000;
      max = Math.max(max, v);
      if (v > 0.01) {
        moving++;
        run = 0;
      } else {
        stopped++;
        run += TICK_MS;
        longestStop = Math.max(longestStop, run);
      }
    }
    expect(max).toBeLessThanOrEqual(RAT_GENTLE.speed + 0.01);
    expect(max).toBeGreaterThan(RAT_GENTLE.speed * 0.9);
    expect(longestStop).toBeGreaterThanOrEqual(RAT_GENTLE.pauseMs - 50); // it does stop
    expect(stopped).toBeGreaterThan(20);
    expect(moving).toBeGreaterThan(60);
    // the control: the old rat never pauses and goes at 2.4
    const old = round(false, [3]);
    appear(old.g);
    const o = old.g.mid!.rat!;
    let omax = 0,
      ostops = 0;
    for (let i = 0; i < 120 && old.g.mid!.rat?.state === 'seek'; i++) {
      const [x, y] = [o.x, o.y];
      tick(old.g, new Map());
      const v = (Math.hypot(o.x - x, o.y - y) / TICK_MS) * 1000;
      omax = Math.max(omax, v);
      if (v < 0.01) ostops++;
    }
    expect(omax).toBeGreaterThan(RAT_SPEED * 0.9);
    expect(ostops).toBeLessThan(5);
  });
  it('its path bends: the heading never jumps more than the turn rate allows', () => {
    const { g } = round(true, [20]);
    appear(g);
    const r = g.mid!.rat!;
    let last: number | null = null,
      worst = 0;
    for (let i = 0; i < 600 && g.mid!.rat?.state === 'seek'; i++) {
      tick(g, new Map());
      if (r.heading === undefined) continue;
      if (last !== null) {
        let d = Math.abs(r.heading - last);
        if (d > Math.PI) d = 2 * Math.PI - d;
        worst = Math.max(worst, d);
      }
      last = r.heading;
    }
    expect(last).not.toBeNull();
    expect(worst).toBeLessThanOrEqual(((RAT_GENTLE.turnDps * Math.PI) / 180) * (TICK_MS / 1000) + 1e-6);
  });
});

describe('gives you time', () => {
  it('never steals in its first second, even standing next to a counter with an item; the old rat does at once', () => {
    for (const magnet of [true, false]) {
      const { g, log } = round(magnet, [3]);
      appear(g);
      const s = g.stations.filter((x) => x.kind === 'counter')[3]!;
      const r = g.mid!.rat!;
      Object.assign(r, { x: s.tx + 0.5, y: s.ty + 1.5 }); // right below the counter: adjacent
      step(g, 40);
      if (magnet) expect(at(log, 'rat:steal')).toHaveLength(0);
      else expect(at(log, 'rat:steal')).toHaveLength(1);
      step(g, 40);
      expect(at(log, 'rat:steal')).toHaveLength(1); // the gentle one takes it once the second is over
      if (magnet) expect(at(log, 'rat:steal')[0]!.t - at(log, 'rat:appear')[0]!.t).toBeGreaterThanOrEqual(RAT_GENTLE.graceMs);
    }
  });
  it('does not leave before 12 s: with nothing to steal it waits 14 s (the old rat left at 10 s)', () => {
    const gentle = round(true),
      old = round(false);
    for (const { g } of [gentle, old]) until(g, () => !g.mid!.rat && g.mid!.phase === 'done', 40_000);
    const life = (l: Log) => at(l, 'rat:gone')[0]!.t - at(l, 'rat:appear')[0]!.t;
    expect(life(gentle.log)).toBeGreaterThanOrEqual(RAT_GENTLE.minStayMs);
    expect(life(old.log)).toBeLessThan(RAT_GENTLE.minStayMs);
  });
  it('a rat that stole stays at the counter gnawing until 12 s, so a chef still has time to scare it and get the item back', () => {
    const { g, log } = round(true, [3]);
    until(g, () => at(log, 'rat:steal').length === 1, 20_000);
    const born = at(log, 'rat:appear')[0]!.t;
    expect(at(log, 'rat:steal')[0]!.t - born).toBeLessThan(RAT_GENTLE.minStayMs - 1000); // it stole early...
    until(g, () => g.time - born >= 11_500, 20_000);
    expect(g.mid!.rat).not.toBeNull(); // ...and is still there at 11.5 s
    expect(g.mid!.rat!.item).toBe('raw1');
    until(g, () => at(log, 'rat:gone').length === 1, 30_000);
    expect(at(log, 'rat:gone')[0]!.t - born).toBeGreaterThanOrEqual(RAT_GENTLE.minStayMs);
  });
});

describe('easier to scare, and it pays', () => {
  const chefAt = (g: Game, dist: number, o: { dashing?: boolean; item?: string | null; speed?: number } = {}) => {
    const r = g.mid!.rat!,
      p = g.players.get(1)!;
    Object.assign(p, {
      x: r.x + dist,
      y: r.y,
      fx: -1,
      fy: 0,
      vx: -(o.speed ?? 0),
      vy: 0,
      item: o.item ?? null,
      dashMs: o.dashing ? 120 : 0,
      dashDx: -1,
      dashDy: 0,
      dashCd: o.dashing ? g.params.tune.dashCdMs - 60 : 0,
    });
  };
  const scaredBy = (magnet: boolean, dist: number, o: Parameters<typeof chefAt>[2]) => {
    const { g, log } = round(magnet, []);
    appear(g);
    step(g, 2);
    chefAt(g, dist, o);
    tick(g, new Map());
    return { scared: at(log, 'rat:scared').length === 1, g, log };
  };
  it('a dash 1.3 tiles away scares the gentle rat and not the old one (radius 1.5 against 1.1)', () => {
    expect(scaredBy(true, 1.3, { dashing: true }).scared).toBe(true);
    expect(scaredBy(false, 1.3, { dashing: true }).scared).toBe(false);
    expect(scaredBy(true, 1.7, { dashing: true }).scared).toBe(false); // still has an edge
  });
  it('a dash that ended 150 ms ago still counts (within 1.9 tiles); one that ended long ago does not', () => {
    const recent = (magnet: boolean, sinceEnd: number) => {
      const { g, log } = round(magnet, []);
      appear(g);
      step(g, 2);
      const t = g.params.tune;
      chefAt(g, 1.7, {});
      Object.assign(g.players.get(1)!, { dashMs: 0, dashCd: t.dashCdMs - t.dashMs - sinceEnd });
      tick(g, new Map());
      return at(log, 'rat:scared').length === 1;
    };
    expect(recent(true, 150)).toBe(true);
    expect(recent(true, 400)).toBe(false);
    expect(recent(false, 150)).toBe(false);
  });
  it('a chef that simply runs into it scares it, even carrying; standing still next to it does not; the old rat ignores it', () => {
    expect(scaredBy(true, 0.5, { speed: 3, item: 'raw0' }).scared).toBe(true);
    expect(scaredBy(true, 0.5, { speed: 0, item: 'raw0' }).scared).toBe(false);
    expect(scaredBy(false, 0.5, { speed: 3, item: 'raw0' }).scared).toBe(false);
  });
  it('scaring it pays RAT_BONUS to the team (and the event says so); the old rat pays nothing; the stolen item still goes back', () => {
    const on = round(true, [3]);
    until(on.g, () => at(on.log, 'rat:steal').length === 1, 20_000);
    const before = on.g.score;
    chefAt(on.g, 1.0, { dashing: true });
    tick(on.g, new Map());
    expect(on.g.score - before).toBe(RAT_BONUS);
    expect(at(on.log, 'rat:scared')[0]!.p).toMatchObject({ returned: true, bonus: RAT_BONUS });
    expect(on.g.stations.filter((s) => s.kind === 'counter')[3]!.item).toBe('raw1');
    const off = scaredBy(false, 0.9, { dashing: true });
    expect(off.scared).toBe(true);
    expect(off.g.score).toBe(0);
    expect(at(off.log, 'rat:scared')[0]!.p).not.toHaveProperty('bonus');
  });
});

describe('telegraphs', () => {
  it('says which counter it goes for, once, and when it is about to arrive', () => {
    const { g, log } = round(true, [3]);
    until(g, () => at(log, 'rat:steal').length === 1, 20_000);
    expect(at(log, 'rat:target')).toHaveLength(1);
    expect(at(log, 'rat:near')).toHaveLength(1);
    const station = g.stations.indexOf(g.stations.filter((s) => s.kind === 'counter')[3]!);
    expect(at(log, 'rat:target')[0]!.p).toEqual({ station });
    expect(at(log, 'rat:near')[0]!.p).toEqual({ station });
    expect(at(log, 'rat:target')[0]!.t).toBeLessThanOrEqual(at(log, 'rat:near')[0]!.t);
    expect(at(log, 'rat:near')[0]!.t).toBeLessThan(at(log, 'rat:steal')[0]!.t);
    const old = round(false, [3]);
    until(old.g, () => at(old.log, 'rat:steal').length === 1, 20_000);
    expect(at(old.log, 'rat:target')).toHaveLength(0); // the old rat never warned
  });
});
