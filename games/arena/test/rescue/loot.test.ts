import { describe, expect, it } from 'vitest';
import { MAP_W, footprint, solidAt } from '../../map';
import { LOOT_LOCK_TICKS, LOOT_TICKS, cardOf, lootTile, type ManchazoState } from '../../sim';
import { blastAt, give, lootOf, put, res, rround, stain, tick } from './rescue-drive';

// Body 0 (team 0) is stained at (3, 7) by a rival blast; body 1 is a rival, body 2 a teammate. F0 map: row 7 is open in columns 0-5.
const setup = (card: Parameters<typeof give>[2] = 'roller') => {
  const s = rround([0, 1, 0]);
  put(s, 0, 3, 7);
  put(s, 1, 20, 3);
  put(s, 2, 20, 11);
  give(s, 0, card);
  blastAt(s, 3, 7);
  tick(s);
  return s;
};

describe('loot: a stained body drops its card', () => {
  it('the card in hand falls on the body tile, the hand empties and the TV log says so', () => {
    const s = setup();
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(s.match.sab!.held[0]).toBeNull();
    expect(lootOf(s)).toEqual([{ x: 3, y: 7, kind: 'roller', age: 0, owner: 0, from: -1 }]);
    expect(res(s).log).toEqual([{ kind: 'drop', tick: 0, body: 0, x: 3, y: 7, card: 'roller' }]);
  });
  it('a body without a card drops nothing; a second blast on a stained body drops nothing again', () => {
    const s = setup(null as never);
    expect(lootOf(s)).toEqual([]);
    const t = setup();
    blastAt(t, 3, 7);
    tick(t);
    expect(lootOf(t)).toHaveLength(1);
  });
  it('the card of the spawner it came from is remembered', () => {
    const s = rround([0, 1]);
    const k = 0;
    const p = s.match.sab!.pickups[k]!;
    put(s, 0, p.x, p.y);
    put(s, 1, 20, 3);
    tick(s);
    expect(s.match.sab!.held[0]).toBe(cardOf(s.match.sab!, { ...p, drawn: p.drawn - 1 }));
    expect(res(s).from[0]).toBe(k);
  });
});

describe('loot: who can pick it up and when', () => {
  it('the owner cannot at tick 119 and can at tick 120; anybody else can at once', () => {
    const s = setup();
    s.match.bodies[0]!.stun = 0; // let the owner stand on it (the lock is about the loot's age, not the stain)
    tick(s, {}, LOOT_LOCK_TICKS - 1);
    expect(lootOf(s)[0]!.age).toBe(LOOT_LOCK_TICKS - 1);
    expect(s.match.sab!.held[0]).toBeNull();
    tick(s);
    expect(s.match.sab!.held[0]).toBe('roller');
    expect(lootOf(s)).toEqual([]);
    expect(res(s).log.at(-1)).toMatchObject({ kind: 'take', body: 0, card: 'roller' });
    const t = setup();
    put(t, 1, 3, 7); // a rival walks onto it
    tick(t);
    expect(t.match.sab!.held[1]).toBe('roller');
  });
  it('a teammate can pick it up too, and a body with a full hand cannot', () => {
    const s = setup();
    put(s, 2, 3, 7);
    give(s, 2, 'fan');
    tick(s, {}, 5);
    expect(lootOf(s)).toHaveLength(1);
    give(s, 2, null);
    tick(s);
    expect(s.match.sab!.held[2]).toBe('roller');
  });
  it('two bodies on it in the same tick: nobody gets it; when one leaves, the other does', () => {
    const s = setup();
    put(s, 1, 3, 7);
    put(s, 2, 3, 7);
    tick(s, {}, 3);
    expect(lootOf(s)).toHaveLength(1);
    expect(s.match.sab!.held[1]).toBeNull();
    expect(s.match.sab!.held[2]).toBeNull();
    put(s, 2, 8, 0);
    tick(s);
    expect(s.match.sab!.held[1]).toBe('roller');
  });
  it('a stained body cannot pick anything up', () => {
    const s = setup();
    put(s, 2, 3, 7);
    stain(s, 2);
    tick(s);
    expect(lootOf(s)).toHaveLength(1);
  });
});

describe('loot: it goes back to its spawner', () => {
  const lost = (from: number) => {
    const s = setup();
    const a = s.match.sab!;
    const p = a.pickups[0]!;
    p.drawn = 1;
    p.wait = 300;
    lootOf(s)[0]!.kind = cardOf(a, { ...p, drawn: 0 });
    lootOf(s)[0]!.from = from;
    return { s, p };
  };
  it('present through tick 240, gone at 241; the empty spawner offers the same card again at once', () => {
    const { s, p } = lost(0);
    s.match.bodies[0]!.stun = 99999; // nobody picks it up
    tick(s, {}, LOOT_TICKS);
    expect(lootOf(s)).toHaveLength(1);
    expect(p.drawn).toBe(1);
    tick(s);
    expect(lootOf(s)).toEqual([]);
    expect(p.drawn).toBe(0);
    expect(p.wait).toBe(0);
    expect(res(s).log.at(-1)).toMatchObject({ kind: 'expire', body: 0 });
  });
  it('a spawner that already refilled keeps its card: the lost one is gone', () => {
    const { s, p } = lost(0);
    p.wait = 0;
    s.match.bodies[0]!.stun = 99999;
    tick(s, {}, LOOT_TICKS + 1);
    expect(lootOf(s)).toEqual([]);
    expect(p.drawn).toBe(1);
  });
  it('an armed card has no spawner to go back to', () => {
    const { s, p } = lost(-1);
    s.match.bodies[0]!.stun = 99999;
    tick(s, {}, LOOT_TICKS + 1);
    expect(p.wait).toBeGreaterThan(0);
  });
});

describe('loot: a card in progress when the stain lands', () => {
  it('an armed Pegote with an empty hand falls as a card, and the pinata is no longer armed', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 1, 20, 3);
    put(s, 2, 20, 11);
    s.match.sab!.armed[0] = 'glue';
    blastAt(s, 3, 7);
    tick(s);
    expect(s.match.sab!.armed[0]).toBeNull();
    expect(lootOf(s)).toEqual([{ x: 3, y: 7, kind: 'glue', age: 0, owner: 0, from: -1 }]);
  });
  it('hand and armed together: the hand falls and the armed mark stays (one loot per stain)', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 1, 20, 3);
    put(s, 2, 20, 11);
    s.match.sab!.armed[0] = 'turpentine';
    give(s, 0, 'fan');
    blastAt(s, 3, 7);
    tick(s);
    expect(s.match.sab!.armed[0]).toBe('turpentine');
    expect(lootOf(s).map((l) => l.kind)).toEqual(['fan']);
  });
  it('a sponge that soaked paint falls as a clean card: the soak is lost, nobody squeezes it', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 1, 20, 3);
    put(s, 2, 20, 11);
    give(s, 0, 'sponge');
    s.match.sab!.plus!.sponge[0] = 200;
    s.match.sab!.plus!.soaked[0] = 7;
    blastAt(s, 3, 7);
    tick(s);
    expect(s.match.sab!.plus!.sponge[0]).toBe(0);
    expect(s.match.sab!.plus!.soaked[0]).toBe(0);
    expect(lootOf(s).map((l) => l.kind)).toEqual(['sponge']);
  });
  it('a Pegote already stuck on the stained body keeps riding it (rescue does not unglue it)', () => {
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 2, 4, 7);
    put(s, 1, 20, 3);
    stain(s, 0);
    s.match.pinatas.push({ id: 9, x: 3, y: 7, team: 1, owner: 1, fuse: 100, radius: 2, mod: 'glue', stuck: 0 });
    tick(s, {}, 12);
    expect(s.match.bodies[0]!.stun).toBe(0);
    expect(s.match.pinatas[0]).toMatchObject({ stuck: 0, fuse: 88 });
  });
});

describe('loot: where it lands', () => {
  const tileOf = (s: ManchazoState, x: number, y: number, team = 0) => lootTile(s, res(s), x, y, team);
  it('on the body tile when that is valid', () => {
    const s = rround([0, 1]);
    expect(tileOf(s, 3, 7)).toEqual([3, 7]);
  });
  it('never on a wall: from a solid tile it moves to the nearest floor', () => {
    const s = rround([0, 1]);
    expect(solidAt(s.grid.map, 6, 7)).toBe(true);
    const [x, y] = tileOf(s, 6, 7);
    expect(solidAt(s.grid.map, x, y)).toBe(false);
    expect(Math.abs(x - 6) + Math.abs(y - 7)).toBe(1);
  });
  it('never on a spawner, never on another loot', () => {
    const s = rround([0, 1]);
    const p = s.match.sab!.pickups[0]!;
    expect(tileOf(s, p.x, p.y)).not.toEqual([p.x, p.y]);
    res(s).loot.push({ x: 3, y: 7, kind: 'fan', age: 0, owner: 0, from: -1 });
    expect(tileOf(s, 3, 7)).not.toEqual([3, 7]);
  });
  it('never under a living part: a floor tile a brush or a sofa may close or sweep is skipped', () => {
    const s = rround([0, 1], 5, { mapSeed: 5150, living: true, classicMap: true });
    const open = s.match.live!.pairs.flatMap((p) => footprint(p.spec)).filter(([x, y]) => !solidAt(s.grid.map, x, y));
    expect(open.length).toBeGreaterThan(0); // the test means something: there are open tiles of living parts
    for (const [x0, y0] of open) {
      const [x, y] = tileOf(s, x0, y0);
      expect(open.some(([ox, oy]) => ox === x && oy === y)).toBe(false);
      expect(solidAt(s.grid.map, x, y)).toBe(false);
    }
  });
  it('ties go to the team side: team 0 takes the lower column, team 1 the higher (a mirror agrees)', () => {
    const s = rround([0, 1]);
    // the left-right mirror of the pickup-free, wall-free surroundings of (13, 0) is itself: the two candidates (12, 0) / (14, 0) tie
    res(s).loot.push({ x: 13, y: 0, kind: 'fan', age: 0, owner: 0, from: -1 });
    const a = tileOf(s, 13, 0, 0);
    const b = tileOf(s, 13, 0, 1);
    expect(a[0] + b[0]).toBe(MAP_W - 1); // mirror images of each other
    expect(a[1]).toBe(b[1]);
    expect(a[0]).toBeLessThan(b[0]);
  });
  it('a loot whose tile a Mudanza shuts slides to the nearest valid tile', () => {
    const s = rround([0, 1, 0]);
    put(s, 1, 20, 3);
    put(s, 2, 20, 11);
    put(s, 0, 24, 14);
    res(s).loot.push({ x: 4, y: 7, kind: 'fan', age: 0, owner: 0, from: -1 });
    s.grid.map.solid[7 * MAP_W + 4] = 1; // the move lands on it
    tick(s);
    const l = lootOf(s)[0]!;
    expect(solidAt(s.grid.map, l.x, l.y)).toBe(false);
    expect(Math.abs(l.x - 4) + Math.abs(l.y - 7)).toBe(1);
  });
});
