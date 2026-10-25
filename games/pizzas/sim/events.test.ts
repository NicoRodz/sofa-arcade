import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, recipeBase, tick, type Controls, type Game, type Station } from './overcooked';
import { DIRS, isFloor } from './maps';
import { params } from '@pichi/core/difficulty';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Log = { type: keyof GameEvents; payload: unknown }[];

function setup(opts: Parameters<typeof createGame>[0] = {}) {
  const bus = new Emitter<GameEvents>();
  const log: Log = [];
  for (const type of [
    'itemPicked',
    'itemDropped',
    'interactInvalid',
    'chopStart',
    'chopStop',
    'chopDone',
    'potStart',
    'potReady',
    'orderNew',
    'orderWarning',
    'orderExpired',
    'delivered',
    'countdownTick',
    'roundStart',
    'roundEnd',
  ] as const)
    bus.on(type, (payload) => log.push({ type, payload }));
  const g = createGame({ ...opts, bus });
  addPlayer(g, 1, 0);
  return { g, log };
}
const warm = (g: Game, log: Log) => {
  tick(g, new Map());
  log.length = 0;
}; // flush roundStart and the initial orders
const types = (log: Log) => log.map((e) => e.type);
const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
const crate = (g: Game, t: number) => g.stations.find((s) => s.kind === 'crate' && s.crate === t)!;
function face(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  p.x = s.tx + dx + 0.5;
  p.y = s.ty + dy + 0.5;
  p.fx = -dx;
  p.fy = -dy;
}
const press = (g: Game) => tick(g, new Map([[1, { ...idle, a: 1 }]]));
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, c);
};
const hold = new Map([[1, { ...idle, b: true }]]);

describe('Emitter', () => {
  it('delivers to subscribers and stops after unsubscribe', () => {
    const e = new Emitter<GameEvents>();
    const seen: number[] = [];
    const off = e.on('orderNew', (p) => seen.push(p.order));
    e.emit('orderNew', { order: 1, recipe: 'marinara' });
    off();
    e.emit('orderNew', { order: 2, recipe: 'marinara' });
    expect(seen).toEqual([1]);
  });
});

describe('game events', () => {
  it('grab, drop, pick again and an invalid press', () => {
    const { g, log } = setup();
    warm(g, log);
    face(g, crate(g, 0));
    press(g);
    face(g, station(g, 'counter'));
    press(g);
    press(g);
    expect(log.map((e) => [e.type, e.payload])).toEqual([
      ['itemPicked', { player: 1, item: 'raw0', from: 'crate' }],
      ['itemDropped', { player: 1, item: 'raw0', at: 'counter' }],
      ['itemPicked', { player: 1, item: 'raw0', from: 'counter' }],
    ]);
    face(g, crate(g, 1));
    log.length = 0;
    press(g); // hands full
    expect(log).toEqual([{ type: 'interactInvalid', payload: { player: 1 } }]);
  });

  it('pressing A at nothing is silent', () => {
    const { g, log } = setup();
    const p = g.players.get(1)!;
    p.x = 5.5;
    p.y = 2.5;
    p.fx = 1;
    p.fy = 0;
    warm(g, log);
    press(g);
    expect(log).toEqual([]);
  });

  it('chopStart when B is held on a board, chopDone at the end, chopStop on release', () => {
    const { g, log } = setup();
    const board = station(g, 'board');
    const idx = g.stations.indexOf(board);
    face(g, crate(g, 0));
    press(g);
    face(g, board);
    press(g);
    log.length = 0;
    run(g, params('normal', 2).cutMs + 200, hold);
    run(g, 100);
    expect(log.map((e) => [e.type, e.payload])).toEqual([
      ['chopStart', { player: 1, station: idx }],
      ['chopDone', { player: 1, station: idx }],
      ['chopStop', { player: 1, station: idx }], // nothing left to cut
    ]);
  });

  it('chopStop fires when B is released mid-cut', () => {
    const { g, log } = setup();
    face(g, crate(g, 0));
    press(g);
    face(g, station(g, 'board'));
    press(g);
    log.length = 0;
    run(g, 300, hold);
    run(g, 100);
    expect(types(log)).toEqual(['chopStart', 'chopStop']);
  });

  it('oven: potStart with the second ingredient, potReady after the cooking time', () => {
    const { g, log } = setup();
    const pot = station(g, 'pot');
    for (const t of [0, 1]) {
      face(g, crate(g, t));
      press(g);
      face(g, station(g, 'board'));
      press(g);
      run(g, params('normal', 2).cutMs + 100, hold);
      press(g);
      face(g, pot);
      press(g);
    }
    expect(types(log).filter((t) => t === 'potStart')).toEqual(['potStart']);
    expect(types(log)).not.toContain('potReady');
    run(g, params('normal', 2).cookMs + 100);
    expect(log.filter((e) => e.type === 'potReady').map((e) => e.payload)).toEqual([{ station: g.stations.indexOf(pot) }]);
  });

  it('delivery reports points and tip', () => {
    const { g, log } = setup();
    const p = g.players.get(1)!;
    p.item = 'dish';
    face(g, station(g, 'window'));
    warm(g, log);
    press(g);
    expect(log).toHaveLength(1);
    const { points, tip } = log[0]!.payload as { points: number; tip: number };
    expect(log[0]!.type).toBe('delivered');
    expect(points).toBe(g.score);
    expect(points).toBe(recipeBase('marinara', g.params.tune) + tip);
  });

  it('orders: orderNew on creation and schedule, one warning under 10 s, orderExpired at the end', () => {
    const { g, log } = setup();
    const first = g.orders[0]!.id;
    expect(log.filter((e) => e.type === 'orderNew')).toHaveLength(1);
    run(g, params('normal', 2).orderTtlMs - 10_000 - 500);
    expect(types(log)).not.toContain('orderWarning');
    run(g, 1000);
    run(g, 3000);
    expect(log.filter((e) => e.type === 'orderWarning' && (e.payload as { order: number }).order === first)).toHaveLength(1);
    run(g, 10_000);
    expect(log.filter((e) => e.type === 'orderExpired').map((e) => e.payload)).toEqual([{ order: first }]);
  });

  it('countdown 3-2-1-go freezes the round clock, then roundStart; last 10 s tick; roundEnd once', () => {
    const { g, log } = setup({ countdownMs: COUNTDOWN_MS });
    run(g, COUNTDOWN_MS - 100);
    expect(g.time).toBe(0);
    expect(log.filter((e) => e.type === 'countdownTick').map((e) => (e.payload as { n: number }).n)).toEqual([3, 2, 1]);
    expect(types(log)).not.toContain('roundStart');
    run(g, 200);
    expect(log.filter((e) => e.type === 'countdownTick').map((e) => (e.payload as { n: number }).n)).toEqual([3, 2, 1, 0]);
    run(g, 100);
    expect(log.filter((e) => e.type === 'roundStart')).toHaveLength(1);
    expect(g.time).toBeGreaterThan(0);
    log.length = 0;
    run(g, g.params.roundMs + 500);
    const end = log.filter((e) => e.type === 'countdownTick').map((e) => e.payload as { n: number; kind: string });
    expect(end.map((e) => e.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(end.every((e) => e.kind === 'end')).toBe(true);
    expect(log.filter((e) => e.type === 'roundEnd')).toHaveLength(1);
    expect(types(log).at(-1)).toBe('roundEnd');
  });

  it('without a countdown the round starts on the first tick', () => {
    const { g, log } = setup();
    expect(types(log)).toEqual(['orderNew']);
    run(g, 100);
    expect(types(log)).toEqual(['orderNew', 'roundStart']);
  });
});
