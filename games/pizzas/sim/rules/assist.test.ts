// Ayudante (assist.ts): what the profile gives one chef, that it gives nothing to anybody else, and what it costs in the versus handicap.
// Every effect is checked against a control chef (same place, same inputs, no flag) so a green cannot come from the situation being easy.
import { describe, expect, it } from 'vitest';
import { WASH_MS } from '@pichi/core/difficulty';
import { SCENARIOS as GOLDEN, runGolden } from '../../test/golden/bot';
import { SPEED, dropPlayer, tick } from '../overcooked';
import { createVersusGame } from '../versus/lobby';
import { versusMap } from '../versus/maps';
import n4 from '../../test/golden/fixtures/coop-n4-map9-hard.json';
import { idle, duo, station, place, run } from './assist.kit';

describe('the flag is per chef and costs nothing when it is off', () => {
  it('a round that names an Ayudante nobody plays (or nobody at all) is the golden round, event for event', () => {
    const sc = GOLDEN.find((x) => x.name === n4.name)!;
    const want = runGolden(sc);
    const none = runGolden({ ...sc, assist: [] });
    const ghost = runGolden({ ...sc, assist: [99] });
    expect(none).toEqual(want);
    expect(ghost).toEqual(want);
    expect(want.events.length).toBeGreaterThan(500);
  });
  it('the same round with a real Ayudante is NOT the golden one (the control proves the flag does something) but still cooks and delivers', () => {
    const sc = GOLDEN.find((x) => x.name === n4.name)!;
    const with1 = runGolden({ ...sc, assist: [1] });
    expect(with1.events).not.toEqual(runGolden(sc).events);
    expect(with1.delivered).toBeGreaterThan(0);
  });
  it('only the chef that chose it carries the flag, and the roster knows', () => {
    const g = duo();
    expect(g.players.get(1)!.assist).toBe(true);
    expect(g.players.get(2)!.assist).toBeUndefined();
    expect('chopLatch' in g.players.get(2)!).toBe(false);
    expect(g.roster.map((r) => !!r.assist)).toEqual([true, false]);
  });
});

describe('no inertia', () => {
  it('on Normal (where the stick is smoothed) the Ayudante is at full speed after ONE tick, the control is still accelerating', () => {
    const g = duo('normal');
    const open = (id: number) => {
      const p = g.players.get(id)!;
      Object.assign(p, { x: 7.5 + id, y: 4.5, vx: 0, vy: 0 });
      return p;
    };
    const a = open(1),
      c = open(2);
    tick(
      g,
      new Map([
        [1, { x: 1, y: 0, a: 0, b: false }],
        [2, { x: 1, y: 0, a: 0, b: false }],
      ]),
    );
    expect(a.vx).toBeCloseTo(SPEED, 6);
    expect(c.vx, 'control').toBeLessThan(SPEED * 0.9);
    expect(c.vx).toBeGreaterThan(0);
  });
  it('and stops dead the tick the stick is released', () => {
    const g = duo('normal');
    const a = g.players.get(1)!,
      c = g.players.get(2)!;
    Object.assign(a, { x: 8.5, y: 4.5 });
    Object.assign(c, { x: 9.5, y: 4.5 });
    run(
      g,
      200,
      new Map([
        [1, { x: 1, y: 0, a: 0, b: false }],
        [2, { x: 1, y: 0, a: 0, b: false }],
      ]),
    );
    tick(
      g,
      new Map([
        [1, idle],
        [2, idle],
      ]),
    );
    expect(a.vx).toBe(0);
    expect(c.vx, 'control keeps sliding a moment').toBeGreaterThan(0);
  });
});

describe('one-tap chopping', () => {
  const setup = (assist: number[]) => {
    const g = duo('normal', assist);
    const board = station(g, 'board');
    board.item = 'raw1';
    const [dx, dy] = place(g, 1, board); // (dx, dy): from the board to the chef
    return { g, board, p: g.players.get(1)!, cutMs: g.params.cutMs, into: [-dx, -dy] as const, side: [-dy, dx] as const };
  };
  const tap = { ...idle, bTaps: 1 };
  it('a tap starts the cut and it keeps going without holding B until the tomato is chopped; one chopDone, then it stops by itself', () => {
    const { g, board, p, cutMs } = setup([1]);
    const events: string[] = [];
    g.bus.on('chopStart', () => events.push('start'));
    g.bus.on('chopDone', () => events.push('done'));
    g.bus.on('chopStop', () => events.push('stop'));
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(true);
    run(g, cutMs / 2, new Map([[1, idle]])); // B is up the whole time
    expect(p.cutting, 'still chopping with B released').toBe(true);
    expect(board.progress).toBeGreaterThan(0.3);
    run(g, cutMs, new Map([[1, idle]]));
    expect(board.item).toBe('cut1');
    expect(p.cutting).toBe(false);
    expect(p.chopLatch).toBe(false);
    expect(events).toEqual(['start', 'done', 'stop']);
  });
  it('the control: the same tap does nothing for a normal chef (a cut needs B held)', () => {
    const { g, board, p } = setup([]);
    tick(g, new Map([[1, tap]]));
    run(g, 400, new Map([[1, idle]]));
    expect(p.cutting).toBe(false);
    expect(board.progress).toBe(0);
  });
  it('the stick ends it (walking away stops the chop); a light touch on the stick does not', () => {
    const { g, board, p } = setup([1]);
    tick(g, new Map([[1, tap]]));
    run(g, 100, new Map([[1, { x: 0.2, y: 0, a: 0, b: false }]]));
    expect(p.cutting, 'a drifting thumb does not cancel').toBe(true);
    const progress = board.progress;
    run(g, 100, new Map([[1, { x: -0.9, y: 0, a: 0, b: false }]]));
    expect(p.cutting).toBe(false);
    expect(board.progress).toBe(progress); // nothing was chopped while walking off
    expect(p.chopLatch).toBe(false);
    run(g, 300, new Map([[1, idle]]));
    expect(board.progress, 'and it does not resume by itself when the thumb comes back to rest').toBe(progress);
  });
  it('pushing the stick INTO the board (to be sure of facing it) is not walking away: it keeps chopping; sideways and away end it', () => {
    for (const [name, pick, keeps] of [
      ['into the board', (o: ReturnType<typeof setup>) => [o.into[0], o.into[1]], true],
      ['diagonal into it', (o: ReturnType<typeof setup>) => [0.8 * o.into[0] + 0.6 * o.side[0], 0.8 * o.into[1] + 0.6 * o.side[1]], true],
      ['sideways', (o: ReturnType<typeof setup>) => [o.side[0], o.side[1]], false],
      ['away', (o: ReturnType<typeof setup>) => [-o.into[0], -o.into[1]], false],
    ] as const) {
      const o = setup([1]);
      const [x, y] = pick(o);
      tick(o.g, new Map([[1, tap]]));
      run(o.g, 100, new Map([[1, { x: x!, y: y!, a: 0, b: false }]]));
      expect(o.p.cutting, name).toBe(keeps);
    }
  });
  it('a tap where there is nothing to cut starts nothing (no latch waiting to surprise a later station)', () => {
    const { g, board, p } = setup([1]);
    board.item = null;
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(false);
    expect(p.chopLatch).toBeFalsy();
    board.item = 'raw1';
    tick(g, new Map([[1, idle]]));
    expect(p.cutting, 'it had not latched').toBe(false);
  });
  it('taking the item off the board (A) ends it; the washing at a sink is the same one-tap', () => {
    const { g, board, p } = setup([1]);
    tick(g, new Map([[1, tap]]));
    run(g, 100, new Map([[1, idle]]));
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('raw1');
    expect(board.item).toBeNull();
    tick(g, new Map([[1, idle]]));
    expect(p.cutting).toBe(false);
    const g2 = duo('normal', [1]);
    const sink = station(g2, 'sink');
    sink.count = 2;
    place(g2, 1, sink);
    tick(g2, new Map([[1, tap]]));
    run(g2, WASH_MS + 300, new Map([[1, idle]]));
    expect(sink.clean, 'a plate was washed without holding B').toBeGreaterThanOrEqual(1);
  });
  it('a dropped phone stops its chop', () => {
    const g = createVersusGame({
      teams: [
        { id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1] },
        { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2] },
      ],
      map: (() => {
        const m = versusMap('V1')!;
        return { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma };
      })(),
      difficulty: 'normal',
      seed: 3,
      modeOptions: { sabotage: 'off' },
      slotOf: (i) => i - 1,
      assist: [1],
    });
    const p = g.players.get(1)!;
    const board = g.stations.find((s) => s.kind === 'board' && s.owner === 0)!;
    board.item = 'raw1';
    place(g, 1, board);
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(true);
    dropPlayer(g, 1);
    expect([p.cutting, p.chopLatch]).toEqual([false, false]);
  });
});
