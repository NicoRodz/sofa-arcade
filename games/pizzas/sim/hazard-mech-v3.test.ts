// HAZARD_V3 mechanics of tanda 2 (PR-B part 2), one block each: the bridge mended by hand with B (120 ticks, not on Easy), the raft that holds two chefs, the Bandeja plate lost on oil (Hard only, in the ledger),
// the two real waves of map 22 (nothing reverts) and the rat of map 15 (in by one cave, out by the other, the same on every run).
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, TICK_MS, type Controls, type Game } from './overcooked';
import { fixedMap } from './maps';
import { chefHint } from './phone/hints';
import { patchMap } from './maps/hazard-patches';
import { mechFlagsOf } from './mech/ids';
import { wear, isBroken, mendProgress } from './mech/bridge/module';
import { OIL, setTile } from './mech/oil/state';
import { raftModule } from './mech/raft/module';
import { liveOf } from './mech/mutation/module';
import { applyRows } from './mech/mutation/ops';
import { ACTIVE_MS, ANNOUNCE_MS } from './rules/midround';
import { BRIDGE_ROWS } from '../test/mech/bridge/map';
import { RAFT_ROWS } from '../test/mech/raft/map';
import type { Difficulty } from '@pichi/core/difficulty';

const idle = new Map<number, Controls>();
const hold = (id: number, b = true) => new Map<number, Controls>([[id, { x: 0, y: 0, a: 0, b }]]);
const run = (g: Game, k: number, c: Map<number, Controls> = idle) => {
  for (let i = 0; i < k; i++) tick(g, c);
};
const put = (g: Game, id: number, x: number, y: number, fx = 1, fy = 0) =>
  Object.assign(g.players.get(id)!, { x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, fx, fy });
const events = (g: Game) => {
  const seen: { type: string; payload: unknown }[] = [];
  const bus = g.bus as unknown as { emit: (t: string, p: unknown) => void };
  const emit = bus.emit.bind(bus);
  bus.emit = (type, payload) => {
    seen.push({ type, payload });
    emit(type, payload);
  };
  return seen;
};

describe('HAZARD_V3 bridge: B mends it', () => {
  const B = 2 * 16 + 7; // the bridge at (7, 2)
  const make = (d: Difficulty, n = 1): Game => {
    const g = createGame({ rows: BRIDGE_ROWS, n, mech: { bridge: true }, hazardsV3: true, difficulty: d, countdownMs: 0 });
    for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
    run(g, 2);
    wear(g, B, 6);
    run(g, 2); // nobody on it: it breaks
    return g;
  };
  for (const d of ['normal', 'hard'] as const) {
    it(`${d}: holding B in front of the broken bridge mends it at tick 120, not at 119`, () => {
      const g = make(d);
      expect(isBroken(g, 7, 2)).toBe(true);
      put(g, 1, 6, 2);
      run(g, 119, hold(1));
      expect(isBroken(g, 7, 2), 'at 119').toBe(true);
      expect(mendProgress(g, B)).toBe(119);
      run(g, 1, hold(1));
      expect(isBroken(g, 7, 2), 'at 120').toBe(false);
      expect(g.mech!.bridge![B]).toEqual({ uses: 0, brokenUntil: 0 });
    });
  }
  it('letting go of B starts the count again', () => {
    const g = make('normal');
    put(g, 1, 6, 2);
    run(g, 100, hold(1));
    run(g, 1, hold(1, false));
    expect(mendProgress(g, B)).toBe(0);
    run(g, 119, hold(1));
    expect(isBroken(g, 7, 2)).toBe(true);
  });
  it('the phone of the chef in front of it reads "Reparar" on B (and only there, and not on Easy)', () => {
    const g = make('normal');
    put(g, 1, 6, 2);
    expect(chefHint(g, g.players.get(1)!).b).toBe('Reparar');
    put(g, 1, 3, 3);
    expect(chefHint(g, g.players.get(1)!).b).not.toBe('Reparar');
    const easy = make('easy');
    put(easy, 1, 6, 2);
    expect(chefHint(easy, easy.players.get(1)!).b).not.toBe('Reparar');
  });
  it('two chefs holding B mend it in half the time', () => {
    const g = make('normal', 2);
    put(g, 1, 6, 2);
    put(g, 2, 7, 1, 0, 1);
    run(
      g,
      59,
      new Map<number, Controls>([
        [1, { x: 0, y: 0, a: 0, b: true }],
        [2, { x: 0, y: 0, a: 0, b: true }],
      ]),
    );
    expect(isBroken(g, 7, 2)).toBe(true);
    run(
      g,
      1,
      new Map<number, Controls>([
        [1, { x: 0, y: 0, a: 0, b: true }],
        [2, { x: 0, y: 0, a: 0, b: true }],
      ]),
    );
    expect(isBroken(g, 7, 2)).toBe(false);
  });
  it('Easy does not mend by hand: B does nothing and the bridge waits its 1200 ticks', () => {
    const g = make('easy');
    put(g, 1, 6, 2);
    run(g, 300, hold(1));
    expect(isBroken(g, 7, 2)).toBe(true);
    expect(mendProgress(g, B)).toBe(0);
  });
});

describe('HAZARD_V3 raft: two chefs fit, the third waits', () => {
  const RAFT_X = 6;
  const make = (d: Difficulty): Game => {
    const g = createGame({ rows: RAFT_ROWS, n: 3, mech: { raft: true }, hazardsV3: true, difficulty: d, countdownMs: 0 });
    for (let i = 1; i <= 3; i++) addPlayer(g, i, i - 1, i - 1);
    return g;
  };
  const onRaft = (g: Game) => [...g.players.values()].filter((p) => Math.floor(p.x) === RAFT_X && Math.floor(p.y) === 4).length;
  for (const d of ['normal', 'hard'] as const) {
    it(`${d}: the first two step on, the third is stopped on the shore`, () => {
      const g = make(d);
      put(g, 1, 6, 5, 0, -1); // below the raft: pushing up steps onto it
      put(g, 2, 6, 3, 0, 1); // above it
      put(g, 3, 5, 4, 1, 0); // on the shore at its west
      const up = new Map<number, Controls>([
        [1, { x: 0, y: -1, a: 0, b: false }],
        [2, { x: 0, y: 1, a: 0, b: false }],
      ]);
      run(g, 12, up);
      expect(onRaft(g)).toBe(2);
      run(g, 12, new Map([[3, { x: 1, y: 0, a: 0, b: false }]]));
      expect(onRaft(g)).toBe(2);
      expect(Math.floor(g.players.get(3)!.x)).toBe(5);
    });
  }
  it('the gate of the tile: with two chefs on it a third is refused on Normal and Hard, but not on Easy (legacy, no limit)', () => {
    const canEnter = (d: Difficulty) => {
      const g = make(d);
      put(g, 1, 6, 4);
      put(g, 2, 6, 4);
      put(g, 3, 5, 4);
      return raftModule.canEnter!(g, 6, 4, 'e' as never, g.players.get(3)!);
    };
    expect([canEnter('easy'), canEnter('normal'), canEnter('hard')]).toEqual([true, false, false]);
  });
});

describe('HAZARD_V3 raft of map 31: a 1-tile lane, two chefs ride it and the third stays ashore', () => {
  const make = (d: Difficulty): Game => {
    const m = patchMap(fixedMap('31')!, d);
    const g = createGame({
      rows: m.rows,
      mapId: '31',
      mech: mechFlagsOf(m.mechanics),
      hazardsV3: true,
      difficulty: d,
      n: 3,
      countdownMs: 0,
    });
    for (let i = 1; i <= 3; i++) addPlayer(g, i, i - 1, i - 1);
    return g;
  };
  const east = (id: number) => new Map<number, Controls>([[id, { x: 1, y: 0, a: 0, b: false }]]);
  for (const d of ['normal', 'hard'] as const) {
    it(`${d}: chefs 1 and 2 board the docked raft one behind the other, chef 3 is stopped at the shore`, () => {
      const g = make(d);
      for (let i = 0; i < 2000 && !(g.mech!.raft![0]!.pos === 0 && g.mech!.raft![0]!.wait >= 85); i++) run(g, 1);
      expect(g.mech!.raft![0]!.pos).toBe(0); // docked: its tile is (6, 4), next to the shore tile (5, 4)
      g.mech!.raft![0]!.wait = 1e6; // keep it docked for the whole test
      const aboard = () => [1, 2, 3].filter((id) => Math.floor(g.players.get(id)!.x) === 6 && Math.floor(g.players.get(id)!.y) === 4);
      put(g, 1, 5, 4);
      put(g, 2, 4, 4);
      put(g, 3, 9, 7); // out of the way
      for (let i = 0; i < 80; i++) tick(g, new Map([...east(1), ...east(2)]));
      expect(aboard()).toEqual([1, 2]); // two bodies of 0.7 on a tile of 1: they share it without shoving
      put(g, 3, 4, 4);
      run(g, 200, east(3));
      expect(aboard()).toEqual([1, 2]);
      expect(g.players.get(3)!.x).toBeGreaterThan(5.5); // it did get to the edge of the dock
      expect(g.players.get(3)!.x).toBeLessThan(6);
    });
  }
});

describe('HAZARD_V3 Bandeja on oil (map 28): the plate is lost on Hard only, and the ledger says so', () => {
  const make = (d: Difficulty): Game => {
    const m = patchMap(fixedMap('28')!, d);
    const g = createGame({
      rows: m.rows,
      mapId: '28',
      mech: mechFlagsOf(m.mechanics),
      hazardsV3: true,
      difficulty: d,
      n: 2,
      countdownMs: 0,
    });
    for (let i = 1; i <= 2; i++) addPlayer(g, i, i - 1, i - 1);
    g.teams[0]!.orders.push({ id: 900, expiresAt: 1e9, warned: false, recipe: 'bandeja', parts: ['marinara', 'marinara', 'marinara'] });
    return g;
  };
  /** Chef 1 holds a plate of the open Bandeja and steps onto an oil tile. */
  const slip = (d: Difficulty) => {
    const g = make(d);
    const ev = events(g);
    const [tx, ty] = [3, 5];
    setTile(g, ty * 16 + tx, OIL, 0);
    put(g, 1, tx - 1, ty);
    g.players.get(1)!.item = 'dish';
    run(g, 1);
    put(g, 1, tx, ty);
    run(g, 2);
    return { g, ev };
  };
  it('Hard: the pizza is gone (no item on the floor), the event fires and hazard:tray-loss is in the ledger', () => {
    const { g, ev } = slip('hard');
    expect(g.players.get(1)!.item).toBeNull();
    expect(ev.filter((e) => e.type === 'mech:trayLoss')).toHaveLength(1);
    expect(g.ledger!.count['hazard:tray-loss']).toBe(1);
    expect(g.ledger!.count['hazard:oil-drop']).toBeUndefined();
    expect(g.floor.filter((f) => f.kind === 'dropped')).toHaveLength(0);
  });
  it('Normal: the chef keeps the plate and nothing is booked as a tray loss', () => {
    const { g, ev } = slip('normal');
    expect(g.players.get(1)!.item).toBe('dish');
    expect(ev.filter((e) => e.type === 'mech:trayLoss')).toHaveLength(0);
    expect(g.ledger!.count['hazard:tray-loss']).toBeUndefined();
  });
});

describe('HAZARD_V3 map 22: two real waves, nothing reverts', () => {
  const make = (d: Difficulty): { g: Game; m: ReturnType<typeof patchMap> } => {
    const m = patchMap(fixedMap('22')!, d);
    const g = createGame({
      rows: m.rows,
      mapId: '22',
      mech: mechFlagsOf(m.mechanics),
      mutation: m.mutation,
      hazardsV3: true,
      difficulty: d,
      n: 4,
      countdownMs: 0,
    });
    for (let i = 1; i <= 4; i++) addPlayer(g, i, i - 1, i - 1);
    return { g, m };
  };
  for (const d of ['normal', 'hard'] as const) {
    it(`${d}: the rows follow wave 1 at 60 s and wave 2 at 120 s, and stay there`, () => {
      const { g, m } = make(d);
      const ev = events(g);
      const mu = m.mutation!;
      const w1 = applyRows(m.rows, mu.ops);
      const w2 = applyRows(w1, mu.then!.ops);
      expect(w2.join('|')).not.toBe(w1.join('|'));
      run(g, mu.at - 1);
      expect(liveOf(g)!.rows.join('|')).toBe(m.rows.join('|'));
      run(g, 2);
      expect(liveOf(g)!.rows.join('|')).toBe(w1.join('|'));
      run(g, mu.then!.at - liveOf(g)!.tick - 1);
      expect(liveOf(g)!.rows.join('|'), 'just before wave 2').toBe(w1.join('|'));
      run(g, 2);
      expect(liveOf(g)!.rows.join('|')).toBe(w2.join('|'));
      run(g, 3 * mu.at); // long after: still wave 2, never the first layout back
      expect(liveOf(g)!.rows.join('|')).toBe(w2.join('|'));
      expect(ev.filter((e) => e.type === 'mutate:apply')).toHaveLength(2);
      expect(ev.filter((e) => e.type === 'mutate:warn')).toHaveLength(2);
    });
  }
});

describe('HAZARD_V3 map 15: the rat comes in by one cave and leaves by the other', () => {
  const play = (seed: number) => {
    const m = patchMap(fixedMap('15')!, 'normal');
    const g = createGame({
      rows: m.rows,
      mapId: '15',
      mech: mechFlagsOf(m.mechanics),
      caves: m.caves,
      hazardsV3: true,
      difficulty: 'normal',
      n: 3,
      seed,
      events: true,
      hazardsV2: false,
      countdownMs: 0,
    });
    for (let i = 1; i <= 3; i++) addPlayer(g, i, i - 1, i - 1);
    const startAt = 3000;
    Object.assign(g.mid!, {
      kind: 'rat',
      startAt,
      announceAt: startAt - ANNOUNCE_MS,
      endAt: Infinity,
      phase: 'wait',
      dark: false,
      rat: null,
    });
    const ev = events(g);
    let last = { x: 0, y: 0 };
    let hole: [number, number] | null = null;
    for (let t = 0; t < startAt + ACTIVE_MS.rat && !ev.some((e) => e.type === 'rat:gone'); t += TICK_MS) {
      tick(g, idle);
      if (g.mid!.rat) {
        last = { x: g.mid!.rat.x, y: g.mid!.rat.y };
        hole = g.mid!.rat.hole;
      }
    }
    const appear = ev.find((e) => e.type === 'rat:appear')!.payload as { at: [number, number] };
    return { appear: appear.at, hole, last, gone: ev.some((e) => e.type === 'rat:gone'), caves: m.caves! };
  };
  it('enters by one cave, leaves by the other one (it is gone standing on it)', () => {
    const r = play(5);
    expect(r.gone).toBe(true);
    const key = (c: readonly number[]) => c.join(',');
    expect(r.caves.map(key)).toContain(key(r.appear));
    expect(r.caves.map(key)).toContain(key(r.hole!));
    expect(key(r.appear)).not.toBe(key(r.hole!));
    expect([Math.floor(r.last.x), Math.floor(r.last.y)]).toEqual(r.hole);
  });
  it('is deterministic: the same seed gives the same entry and exit, and the draw uses both caves across seeds', () => {
    expect(play(5)).toEqual(play(5));
    const entries = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => play(s).appear.join(',')));
    expect(entries.size).toBe(2);
  });
});
