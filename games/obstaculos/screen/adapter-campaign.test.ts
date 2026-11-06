// SimWorldView on the campaign entities of A5 and A6 (the real sim seen as a WorldView).

import { describe, expect, it } from 'vitest';
import { ObstSession, TILE, type LevelDef, type ObstEvent } from '../index';
import { SimWorldView } from './render/adapter';
import { checkWorldView } from './render/view';

const FRAME = 1000 / 60;
const play = (s: ObstSession, ms: number, each?: () => void) => {
  const out: ObstEvent[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    each?.();
    out.push(...s.advance(FRAME));
  }
  return out;
};

// Campaign A5 (dynamics 4-9) in the view: the enemies have no static twin, the pickaxe follows its holder, the target carries its clock, the wind phase is reported.
describe('SimWorldView: campaign A5 entities', () => {
  const rows = Array.from({ length: 16 }, (_, y) => {
    const cs = ('#' + '.'.repeat(38) + '#').split('');
    if (y >= 14) cs.fill('#');
    if (y === 13) {
      cs[2] = 'S';
      cs[36] = 'G';
      cs[10] = 'p';
    }
    if (y === 6) {
      cs[20] = 'a';
      cs[21] = 'a';
    }
    if (y >= 10 && y <= 13) cs[30] = y === 13 ? 'I' : 'A';
    return cs.join('');
  });
  const level: LevelDef = {
    id: 'a5',
    name: 'a5',
    biome: 'glacier',
    players: { min: 2, max: 2 },
    tether: 'freeOnly',
    stars: 1,
    parSec: 60,
    rows,
    params: { a: { kind: 'target', opens: 'A' }, A: { kind: 'gate' } },
    enemies: [{ x: 25, y: 13, range: 2 }],
    wind: { dir: 1, periodSec: 4, gustSec: 1 },
  };
  const mkc = () =>
    new ObstSession({
      mode: 'free',
      difficulty: 'normal',
      level: 0,
      seed: 1,
      slots: [0, 1],
      levels: [level],
      campaign: { world: 'glacier' },
    });
  it('the view lists the enemy, the pickaxe and the target, passes checkWorldView, and the enemy walks', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    v.sync();
    const by = (id: string) => v.entities.find((e) => e.id === id);
    expect(by('enemy0')?.kind).toBe('enemy');
    expect(by('pick0')?.kind).toBe('pickaxe');
    expect(by('obja')?.kind).toBe('target');
    const x0 = by('enemy0')!.x;
    play(s, 1000);
    v.sync();
    expect(by('enemy0')!.x).not.toBe(x0);
    expect(checkWorldView(v)).toEqual([]);
  });
  it("a player on the pickaxe takes it: held, with the holder's id; the target shows its clock once hit; the wind phase is reported", () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const p = s.world.players[0]!;
    p.body.x = 10 * TILE + 7;
    p.body.y = 14 * TILE - 46; // standing in the cell of the pickaxe
    play(s, 300);
    v.sync();
    const k = v.entities.find((e) => e.id === 'pick0')!;
    expect(k.on).toBe(true);
    expect(k.holder).toBe(0);
    const q = s.world.players[1]!;
    q.body.x = 20 * TILE + 7;
    q.body.y = 6 * TILE;
    q.body.vy = 0;
    play(s, 60);
    v.sync();
    const t = v.entities.find((e) => e.id === 'obja')!;
    expect(t.on).toBe(true);
    expect(t.value).toBeGreaterThan(0.5);
    expect(v.wind?.phase).toBeDefined();
    expect(checkWorldView(v)).toEqual([]);
  });
  it('the wind phase goes calm -> warn -> gust, with the direction and no zone', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const seen = new Set<string>();
    for (let t = 0; t < 270; t++) {
      s.advance(FRAME);
      v.sync();
      seen.add(v.wind!.phase);
    }
    expect([...seen].sort()).toEqual(['calm', 'gust', 'warn']);
    expect(v.wind).toMatchObject({ dir: 1, zone: null });
  });
  it('a quick-match session has no wind and no enemies in its view', () => {
    const s = new ObstSession({ mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level] });
    const v = new SimWorldView(s);
    play(s, 3500);
    v.sync();
    expect(v.wind).toBeNull();
    expect(v.entities.some((e) => e.kind === 'enemy')).toBe(false);
  });
});

describe('SimWorldView: campaign A6 entities (lantern, crystals, elastic ring, sinker, geyser)', () => {
  const rows = Array.from({ length: 16 }, (_, y) => {
    const cs = ('#' + '.'.repeat(38) + '#').split('');
    if (y >= 14) cs.fill('#');
    if (y === 13) {
      cs[2] = 'S';
      cs[36] = 'G';
      cs[8] = 'l';
      cs[30] = 'E';
      cs[22] = 'Y';
    }
    if (y === 5) cs[16] = 'u';
    if (y === 6) cs[16] = 'o';
    if (y === 9) {
      cs[12] = 'D';
      cs[13] = 'D';
      cs[14] = 'D';
    }
    return cs.join('');
  });
  const level: LevelDef = {
    id: 'a6',
    name: 'a6',
    biome: 'mine',
    players: { min: 2, max: 2 },
    tether: 'any',
    stars: 1,
    parSec: 60,
    rows,
    params: { D: { kind: 'sinker', travel: 3 }, E: { kind: 'geyser', periodSec: 4 } },
  };
  const mkc = () =>
    new ObstSession({ mode: 'free', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level], campaign: { world: 'mine' } });
  it('the view lists the lantern, the sinker, the geyser and an elastic ring after the plain one; passes checkWorldView; the darkness has a light on the lantern', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    v.sync();
    const by = (id: string) => v.entities.find((e) => e.id === id);
    expect(by('lantern0')?.kind).toBe('lantern');
    expect(by('objD')?.kind).toBe('sinker');
    expect(by('objE')?.kind).toBe('geyser');
    expect(by('ring0')?.label).toBe('');
    expect(by('ring1')?.label).toBe('elastic');
    expect(v.dark).toMatchObject({ radius: 4 * TILE });
    expect(v.dark!.lights).toHaveLength(1);
    expect(checkWorldView(v)).toEqual([]);
  });
  it('whoever steps on the lantern holds it (the light follows); standing on the rock sinks it (value grows); the geyser phase goes 0 -> 0.5 -> 1', () => {
    const s = mkc();
    const v = new SimWorldView(s);
    play(s, 3300);
    const p = s.world.players[0]!,
      q = s.world.players[1]!;
    p.body.x = 8 * TILE + 7;
    p.body.y = 14 * TILE - 46;
    play(s, 120);
    v.sync();
    expect(v.entities.find((e) => e.id === 'lantern0')).toMatchObject({ on: true, holder: 0 });
    expect(v.dark!.lights[0]!.x).toBeCloseTo(p.body.x + 17, 0);
    q.body.x = 12 * TILE + 7;
    q.body.y = 9 * TILE - 46;
    q.body.vy = 0;
    play(s, 1500);
    v.sync(); // 1.5 s on the rock = 0.75 tile down of 3
    expect(v.entities.find((e) => e.id === 'objD')!.value).toBeGreaterThan(0.15);
    const seen = new Set<number>();
    for (let t = 0; t < 280; t++) {
      s.advance(FRAME);
      v.sync();
      seen.add(v.entities.find((e) => e.id === 'objE')!.value);
    }
    expect([...seen].sort()).toEqual([0, 0.5, 1]);
  });
  it('a quick-match session shows none of it: no dark, no elastic ring link', () => {
    const s = new ObstSession({ mode: 'chain', difficulty: 'normal', level: 0, seed: 1, slots: [0, 1], levels: [level] });
    const v = new SimWorldView(s);
    play(s, 3500);
    v.sync();
    expect(v.dark).toBeNull();
    expect(v.ropes[0]!.links[0]!.elastic).toBe(false);
  });
});
