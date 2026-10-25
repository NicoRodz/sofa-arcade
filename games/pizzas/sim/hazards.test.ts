// Sabotage S1: the generic floor hazards of the sim (rubbish that makes a chef slip, the item that falls, the pick-up). Pure logic, no sabotage
// rules yet (those are sabotage.test.ts): rubbish is put on the floor by hand with addFloorItem.
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '@pichi/core/difficulty';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { addFloorItem } from './floor';
import { fixedMap } from './maps';
import { SPEED, TICK_MS, addPlayer, createGame, dropPlayer, tick, type Controls, type Game, type Item } from './overcooked';
import { SLIP, controlLostMs } from './sabotage-config';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const ROWS_1 = fixedMap('1')!.rows; // an open kitchen: floor from column 1 to 14, counters on the walls

type Seen = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K]; x: number; y: number }[] };
function mk(o: { difficulty?: Difficulty; hazards?: boolean; n?: number; slipDrops?: boolean; spoilRaw?: boolean } = {}) {
  const bus = new Emitter<GameEvents>();
  const seen: Seen = {};
  const g = createGame({
    rows: ROWS_1,
    n: 2,
    difficulty: o.difficulty ?? 'normal',
    hazards: o.hazards ?? true,
    slipDrops: o.slipDrops,
    spoilRaw: o.spoilRaw,
    bus,
  });
  for (const k of ['chef:slip', 'chef:recover', 'trash:picked', 'trash:decayed', 'dash', 'bump'] as const) {
    bus.on(k, ((p: never) => {
      const c = [...g.players.values()][0]!;
      ((seen[k] ??= []) as unknown[]).push({ t: g.time, p, x: c.x, y: c.y });
    }) as never);
  }
  for (let i = 1; i <= (o.n ?? 1); i++) addPlayer(g, i, i - 1, i - 1);
  return { g, seen };
}
const put = (g: Game, id: number, x: number, y: number, fx = 1, fy = 0) => {
  const p = g.players.get(id)!;
  Object.assign(p, { x, y, fx, fy, vx: 0, vy: 0 });
  return p;
};
const trash = (g: Game, tx: number, ty: number, ttlMs?: number) =>
  addFloorItem(g, { tx, ty, item: 'trash', kind: 'trash', team: 0, by: 1, ttlMs });
const step = (g: Game, ms: number, c: Controls | ((id: number) => Controls) = idle, ids = [1]) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS)
    tick(g, new Map(ids.map((id): [number, Controls] => [id, typeof c === 'function' ? c(id) : c])));
};
const walkRight: Controls = { x: 1, y: 0, a: 0, b: false };
/** Walks right along row 4 from x = 2.5 over a banana-skin on tile 6 and reports the slide (where it started, where it ended, when). */
function slideOnce(difficulty: Difficulty, o: { dash?: boolean; stick?: Controls } = {}) {
  const { g, seen } = mk({ difficulty });
  const p = put(g, 1, 2.5, 4.5);
  trash(g, 6, 4);
  if (o.dash) {
    step(g, 600, walkRight);
    p.x = 4.8;
    tick(g, new Map([[1, { ...walkRight, b: true }]]));
  } // a dash press with free hands and nothing in front
  for (let i = 0; i < 400 && !seen['chef:slip']; i++) tick(g, new Map([[1, walkRight]]));
  const start = { x: seen['chef:slip']![0]!.x, y: seen['chef:slip']![0]!.y, t: g.time };
  const stick = o.stick ?? walkRight;
  for (let i = 0; i < 400 && !seen['chef:recover']; i++) tick(g, new Map([[1, stick]]));
  return { g, seen, p, start, end: { x: p.x, y: p.y, t: g.time } };
}

describe('hazards off (the default): nothing new runs', () => {
  it('a game made without `hazards` has the flag down and rubbish on the floor does nothing', () => {
    const plain = createGame({ rows: ROWS_1, n: 2 });
    expect(plain.hazards).toBe(false);
    expect(plain.floor).toEqual([]);
    const { g, seen } = mk({ hazards: false });
    put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    step(g, 2500, walkRight);
    expect(seen['chef:slip']).toBeUndefined();
    expect(g.players.get(1)!.slip).toBeUndefined();
    expect(g.players.get(1)!.x).toBeGreaterThan(8); // it walked straight over the tile
    expect(g.floor).toHaveLength(1); // and nothing decays or is picked up either
  });
  it('A with empty hands next to rubbish picks nothing up when hazards are off', () => {
    const { g } = mk({ hazards: false });
    put(g, 1, 5.5, 4.5);
    trash(g, 6, 4);
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(g.players.get(1)!.item).toBeNull();
    expect(g.floor).toHaveLength(1);
  });
  it('the sim draws no random number for hazards: the order queue of a hazards round is the one of a plain round', () => {
    const run = (hazards: boolean) => {
      const { g } = mk({ hazards });
      trash(g, 6, 4);
      put(g, 1, 2.5, 4.5);
      step(g, 20_000, walkRight);
      return JSON.stringify(g.teams[0]!.orders.map((o) => [o.recipe, o.expiresAt]));
    };
    expect(run(true)).toBe(run(false));
  });
});

describe('the slip: distance and time by difficulty', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}: ${SLIP[d].dist} tiles (+-0.05) and ${controlLostMs(d)} ms without control`, () => {
      const r = slideOnce(d);
      expect(r.end.x - r.start.x).toBeGreaterThan(SLIP[d].dist - 0.05);
      expect(r.end.x - r.start.x).toBeLessThan(SLIP[d].dist + 0.05);
      expect(Math.abs(r.end.y - r.start.y)).toBeLessThan(1e-9); // it slid along its velocity, not toward the stick it kept pushing
      expect(r.end.t - r.start.t).toBeGreaterThanOrEqual(controlLostMs(d) - TICK_MS);
      expect(r.end.t - r.start.t).toBeLessThanOrEqual(controlLostMs(d) + TICK_MS);
      expect(r.seen['chef:slip']![0]!.p).toMatchObject({ chef: 1, dist: SLIP[d].dist, dropped: null });
      expect(r.seen['chef:recover']![0]!.p.wall).toBe(false);
    });
  }
  it('the stick is ignored while it slides: pushing the opposite way does not bring it back', () => {
    const r = slideOnce('normal', { stick: { x: -1, y: 0, a: 0, b: false } });
    expect(r.end.x - r.start.x).toBeGreaterThan(2.45);
  });
  it('the slide decelerates: more than half of the distance is covered in the first half of the time', () => {
    const { g, seen } = mk();
    const p = put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:slip']; i++) tick(g, new Map([[1, walkRight]]));
    const x0 = p.x;
    step(g, SLIP.normal.slideMs / 2, idle);
    expect((p.x - x0) / SLIP.normal.dist).toBeGreaterThan(0.7); // 2s - s^2 at s = 1/2 is 3/4
    expect((p.x - x0) / SLIP.normal.dist).toBeLessThan(0.8);
  });
  it('after getting up the speed is 0 and the stick works again', () => {
    const r = slideOnce('easy');
    expect([r.p.vx, r.p.vy]).toEqual([0, 0]);
    expect(r.p.slip).toBeNull();
    const x = r.p.x;
    step(r.g, 300, { x: -1, y: 0, a: 0, b: false });
    expect(r.p.x).toBeLessThan(x - 0.5);
  });
});

describe('the slip: dash, wall, buffered B', () => {
  it('a chef that enters dashing slides 0.5 tile farther', () => {
    const r = slideOnce('normal', { dash: true });
    expect(r.seen['dash']).toHaveLength(1);
    expect(r.end.x - r.start.x).toBeGreaterThan(SLIP.normal.dist + 0.5 - 0.05);
    expect(r.end.x - r.start.x).toBeLessThan(SLIP.normal.dist + 0.5 + 0.05);
    expect(r.seen['chef:slip']![0]!.p.dist).toBe(3);
  });
  it('a wall stops the slide dead; the time without control is the same', () => {
    const { g, seen } = mk();
    const p = put(g, 1, 6.5, 4.5, -1, 0);
    trash(g, 3, 4);
    const goLeft: Controls = { x: -1, y: 0, a: 0, b: false };
    for (let i = 0; i < 400 && !seen['chef:slip']; i++) tick(g, new Map([[1, goLeft]]));
    const t0 = g.time;
    for (let i = 0; i < 400 && !seen['chef:recover']; i++) tick(g, new Map([[1, idle]]));
    expect(p.x).toBeGreaterThan(1.3);
    expect(p.x).toBeLessThan(1.4); // the counter column 0 is solid: it stops with its radius against it
    expect(seen['chef:recover']![0]!.p.wall).toBe(true);
    expect(g.time - t0).toBeGreaterThanOrEqual(controlLostMs('normal') - TICK_MS);
  });
  it('B pressed while sliding does nothing then, but it is remembered and dashes as soon as the chef is up', () => {
    const { g, seen } = mk();
    put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:slip']; i++) tick(g, new Map([[1, walkRight]]));
    step(g, controlLostMs('normal') - 100, idle);
    expect(seen['dash']).toBeUndefined();
    tick(g, new Map([[1, { ...idle, b: true }]])); // 100 ms before getting up (the buffer is 150)
    tick(g, new Map([[1, idle]]));
    expect(seen['dash']).toBeUndefined();
    for (let i = 0; i < 12; i++) tick(g, new Map([[1, idle]]));
    expect(g.players.get(1)!.slip).toBeNull();
    expect(seen['dash']).toHaveLength(1);
  });
});

describe('immunity and no chains', () => {
  it('the rubbish stays after the slip, a second banana-skin on the way does not trigger, and the immunity covers the way back', () => {
    const { g, seen } = mk({ difficulty: 'normal' });
    const p = put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    trash(g, 8, 4); // inside the slide (it starts near x = 6.15 and ends near 8.65)
    for (let i = 0; i < 400 && !seen['chef:recover']; i++) tick(g, new Map([[1, walkRight]]));
    expect(seen['chef:slip']).toHaveLength(1); // the slide went through the second one without a new slip
    expect(g.floor).toHaveLength(2); // both are still there
    // walk back over both within the immunity: nothing
    step(g, 900, { x: -1, y: 0, a: 0, b: false });
    expect(p.x).toBeLessThan(6.5);
    expect(seen['chef:slip']).toHaveLength(1);
  });
  it('when the immunity is over entering again slips again', () => {
    const { g, seen } = mk({ difficulty: 'hard' });
    const p = put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:recover']; i++) tick(g, new Map([[1, walkRight]]));
    expect(seen['chef:slip']).toHaveLength(1);
    expect(p.immuneUntil! - g.time).toBeCloseTo(SLIP.hard.immuneMs, -1); // 1.2 s of immunity after getting up
    step(g, SLIP.hard.immuneMs + 100, idle);
    put(g, 1, 4.5, 4.5);
    for (let i = 0; i < 400 && (seen['chef:slip']?.length ?? 0) < 2; i++) tick(g, new Map([[1, walkRight]]));
    expect(seen['chef:slip']).toHaveLength(2);
  });
  it('standing on the tile when the rubbish lands does not trigger; leaving and entering again does', () => {
    const { g, seen } = mk();
    const p = put(g, 1, 6.5, 4.5);
    trash(g, 6, 4); // lands under the chef
    step(g, 1000, idle);
    expect(seen['chef:slip']).toBeUndefined();
    step(g, 700, { x: -1, y: 0, a: 0, b: false }); // out
    step(g, 700, walkRight); // and in again
    expect(seen['chef:slip']).toHaveLength(1);
    void p;
  });
  it('the slider that bumps into another chef pushes it at half its speed, and the other one never slips from it', () => {
    const { g, seen } = mk({ n: 2 });
    const a = put(g, 1, 2.5, 4.5),
      b = put(g, 2, 7.2, 4.5);
    trash(g, 6, 4);
    // chef 2 stands still ahead of the slide path, outside the trash tile
    for (let i = 0; i < 400 && !seen['chef:recover']; i++)
      tick(
        g,
        new Map([
          [1, walkRight],
          [2, idle],
        ]),
      );
    expect(seen['bump']?.length).toBeGreaterThanOrEqual(1);
    expect(seen['chef:slip']).toHaveLength(1);
    expect(seen['chef:slip']![0]!.p.chef).toBe(1);
    expect(b.x).toBeGreaterThan(7.2); // it was moved
    expect(b.slip).toBeFalsy();
    void a;
  });
});

describe('the item that falls', () => {
  const slipWith = (item: Item, o: Parameters<typeof mk>[0] = {}) => {
    const { g, seen } = mk(o);
    const p = put(g, 1, 2.5, 4.5);
    p.item = item;
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:slip']; i++) tick(g, new Map([[1, walkRight]]));
    return { g, p, seen };
  };
  it("Normal: it falls intact on the tile where the slide began, as a floor item of the chef's team", () => {
    const { g, p, seen } = slipWith('dishQ', { difficulty: 'normal' });
    expect(p.item).toBeNull();
    const dropped = g.floor.find((f) => f.kind === 'dropped')!;
    expect(dropped).toMatchObject({ item: 'dishQ', tx: 6, ty: 4, team: 0 });
    expect(seen['chef:slip']![0]!.p.dropped).toBe('dishQ');
  });
  it('slipDrops off (Suave on Fácil): it only slips and keeps what it carries', () => {
    const { g, p } = slipWith('dishQ', { difficulty: 'easy', slipDrops: false });
    expect(p.item).toBe('dishQ');
    expect(g.floor.filter((f) => f.kind === 'dropped')).toHaveLength(0);
  });
  it('spoilRaw (Caos): a raw ingredient that falls is rubbish now; a cut one or a pizza is not touched', () => {
    expect(slipWith('raw1', { spoilRaw: true }).g.floor.find((f) => f.kind === 'dropped')).toMatchObject({ item: 'trash' });
    expect(slipWith('cut1', { spoilRaw: true }).g.floor.find((f) => f.kind === 'dropped')).toMatchObject({ item: 'cut1' });
    expect(slipWith('dish', { spoilRaw: true }).g.floor.find((f) => f.kind === 'dropped')).toMatchObject({ item: 'dish' });
    expect(slipWith('raw1', { spoilRaw: false }).g.floor.find((f) => f.kind === 'dropped')).toMatchObject({ item: 'raw1' });
  });
  it('the dropped item is picked up with A by a chef of the team (nearest, in front or underfoot), and it makes nobody slip', () => {
    const { g, seen } = mk({ n: 2 });
    put(g, 1, 2.5, 4.5).item = 'dish';
    put(g, 2, 9.5, 6.5);
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:recover']; i++)
      tick(
        g,
        new Map([
          [1, walkRight],
          [2, idle],
        ]),
      );
    const q = put(g, 2, 5.5, 4.5, 1, 0); // next to the tile where the dish fell (tile 6)
    tick(g, new Map([[2, { ...idle, a: 1 }]]));
    expect(q.item).toBe('dish');
    expect(seen['trash:picked']!.map((e) => e.p.kind)).toEqual(['dropped']);
    expect(g.floor.map((f) => f.kind)).toEqual(['trash']); // the banana-skin is still there
  });
  it('rubbish is picked up as the item "trash" and can be binned; hands must be empty and it has to be close', () => {
    const { g } = mk();
    const p = put(g, 1, 5.5, 4.5, 1, 0);
    const f = trash(g, 6, 4);
    p.item = 'raw0';
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(g.floor).toHaveLength(1); // busy hands: nothing
    p.item = null;
    p.immuneUntil = 1e9; // (not to slip on it, it is next to it)
    put(g, 1, 3.5, 4.5); // too far
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBeNull();
    put(g, 1, 5.5, 4.5, 1, 0);
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('trash');
    expect(g.floor.find((x) => x.id === f.id)).toBeUndefined();
    const bin = g.stations.find((s) => s.kind === 'trash') ?? null;
    expect(bin).toBeNull(); // map 1 has no bin: the rules for binning rubbish live with the sabotage counters (S2)
  });
});

describe('decay, drops and determinism', () => {
  it('a banana-skin with a time to live disappears by itself (trash:decayed); one with none stays', () => {
    const { g, seen } = mk();
    put(g, 1, 12.5, 6.5);
    trash(g, 3, 3, 2000);
    trash(g, 4, 3);
    step(g, 1900, idle);
    expect(g.floor).toHaveLength(2);
    step(g, 200, idle);
    expect(g.floor).toHaveLength(1);
    expect(seen['trash:decayed']).toHaveLength(1);
    expect(seen['trash:decayed']![0]!.p).toMatchObject({ team: 0, tile: [3, 3] });
  });
  it('a chef whose phone drops while it slides stops sliding (a ghost has no body)', () => {
    const { g, seen } = mk({ n: 2 });
    const p = put(g, 1, 2.5, 4.5);
    trash(g, 6, 4);
    for (let i = 0; i < 400 && !seen['chef:slip']; i++)
      tick(
        g,
        new Map([
          [1, walkRight],
          [2, idle],
        ]),
      );
    expect(p.slip).toBeTruthy();
    // dropPlayer only exists in versus; the coop chef has no roster entry: it is refused, the slide just goes on
    expect(dropPlayer(g, 1)).toBe(true);
    expect(p.slip).toBeNull();
    expect(p.ghost).toBe(true);
  });
  it('same seed, same inputs: the same state (hash of chefs and floor), twice', () => {
    const run = () => {
      const { g } = mk({ n: 2, difficulty: 'hard' });
      put(g, 1, 2.5, 4.5).item = 'dish';
      put(g, 2, 3.5, 6.5);
      trash(g, 6, 4);
      trash(g, 9, 6, 8000);
      for (let i = 0; i < 1500; i++)
        tick(
          g,
          new Map<number, Controls>([
            [1, i % 400 < 200 ? walkRight : { x: -1, y: 0, a: i % 7 === 0 ? 1 : 0, b: i % 90 === 0 }],
            [2, { x: 1, y: 0, a: 0, b: false }],
          ]),
        );
      return JSON.stringify([[...g.players.values()].map((p) => [p.x, p.y, p.item, p.slip, p.immuneUntil]), g.floor, g.time]);
    };
    expect(run()).toBe(run());
    expect(SPEED).toBeGreaterThan(0);
  });
});
