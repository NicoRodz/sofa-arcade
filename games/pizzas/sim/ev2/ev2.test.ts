import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '../round/events';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '../overcooked';
import type { EventKind } from '../midround';
import { BOARD_RADIUS, HOLD_MS, pickSpot } from './state';
import { cakeRecipe } from './events';
import { chefHint } from '../hints';
import { aStation } from '../round/targeting';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Close = GameEvents['ev2:close'];

function room(o: { v2?: boolean | null; difficulty?: 'normal' | 'hard'; chefs?: number; recipes?: boolean } = {}) {
  const bus = new Emitter<GameEvents>();
  const closes: Close[] = [];
  const log: string[] = [];
  bus.on('ev2:close', (c) => closes.push(c));
  for (const k of ['ev2:mood', 'ev2:cake', 'interactInvalid', 'delivered', 'orderExpired'] as const) bus.on(k, () => log.push(k));
  const g = createGame({ events: true, eventsSeed: 7, ...(o.v2 === null ? {} : { eventsV2: o.v2 ?? true }), difficulty: o.difficulty ?? 'normal', recipes: o.recipes ?? false, bus });
  for (let i = 1; i <= (o.chefs ?? 1); i++) addPlayer(g, i, i - 1);
  while (g.countdown > 0 || !g.started) tick(g, new Map());
  return { g, closes, log };
}
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, c);
};
// the event of the round becomes `kind`, starting in 100 ms (the debug hook of the screen does the same)
function force(g: Game, kind: EventKind) {
  Object.assign(g.mid!, { kind, phase: 'wait', announceAt: g.time, startAt: g.time + 100, endAt: Infinity, dark: false, rat: null, queue: undefined });
}
const stand = (g: Game, id: number, tx: number, ty: number) => Object.assign(g.players.get(id)!, { x: tx + 0.5, y: ty + 0.5, vx: 0, vy: 0 });

describe('eventsV2: the flag', () => {
  it('is off by default and in versus; on only with events', () => {
    expect(room({ v2: false }).g.ev2).toBeUndefined();
    expect(createGame({ eventsV2: true }).ev2).toBeUndefined(); // no events, no presence
    expect(room().g.ev2).toBeDefined();
  });
  it('a round with the flag off plays tick for tick like a round that never heard of it', () => {
    const snap = (v2: boolean | null) => {
      const { g } = room({ v2 });
      for (const k of ['rush', 'birthday', 'blackout'] as const) {
        force(g, k);
        run(g, 16_000);
      }
      return JSON.stringify([g.time, g.teams.map((t) => [t.score, t.orders, t.expired])]);
    };
    expect(snap(false)).toBe(snap(null));
    expect(snap(true)).not.toBe(snap(null)); // and the flag does change the round (a suspicious green otherwise)
  });
});

describe('eventsV2: corte de luz', () => {
  it('the board is the free counter nearest to the centre, ties by (y, x)', () => {
    const { g } = room();
    const s = pickSpot(g)!;
    expect(g.stations[s.station]!.kind).toBe('counter');
    expect(pickSpot(g)).toEqual(s);
  });
  it('B held at the board for 2 s brings the light back: +60 and the card', () => {
    const { g, closes } = room();
    const before = g.teams[0]!.score;
    force(g, 'blackout');
    run(g, 200);
    expect(g.mid!.dark).toBe(true);
    const b = g.ev2!.board!;
    stand(g, 1, b.tx, b.ty + 1);
    run(g, 1000, new Map([[1, { ...idle, b: true }]]));
    expect(g.mid!.dark).toBe(true); // 1 s is not enough
    run(g, HOLD_MS.normal, new Map([[1, { ...idle, b: true }]]));
    expect(g.mid!.dark).toBe(false);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ kind: 'blackout', points: 60, ok: true });
    expect(g.teams[0]!.score).toBe(before + 60);
  });
  it('nobody holds it: the light comes back by itself with no prize', () => {
    const { g, closes } = room();
    const before = g.teams[0]!.score;
    force(g, 'blackout');
    run(g, 11_000);
    expect(g.mid!.dark).toBe(false);
    expect(closes[0]).toMatchObject({ kind: 'blackout', points: 0, ok: false });
    expect(g.teams[0]!.score).toBe(before);
  });
  it('Hard needs two chefs: one alone never gets it', () => {
    const { g, closes } = room({ difficulty: 'hard', chefs: 2 });
    force(g, 'blackout');
    run(g, 200);
    const b = g.ev2!.board!;
    stand(g, 1, b.tx, b.ty + 1);
    run(g, 6000, new Map([[1, { ...idle, b: true }]]));
    expect(g.mid!.dark).toBe(true);
    stand(g, 2, b.tx, b.ty + 1);
    const both = new Map([
      [1, { ...idle, b: true }],
      [2, { ...idle, b: true }],
    ]);
    run(g, HOLD_MS.hard + 100, both);
    expect(g.mid!.dark).toBe(false);
    expect(closes[0]!.points).toBe(30); // 6 s in: past the 5 s of the fast prize
  });
  it('the label of B at the board says Subir luz', () => {
    const { g } = room();
    force(g, 'blackout');
    run(g, 200);
    const b = g.ev2!.board!;
    stand(g, 1, b.tx, b.ty + 1);
    expect(Math.hypot(0.5 - 0.5, 1)).toBeLessThanOrEqual(BOARD_RADIUS);
    expect(chefHint(g, g.players.get(1)!).b).toBe('Subir luz');
  });
});

describe('eventsV2: hora punta', () => {
  const serve = (g: Game) => {
    const t = g.teams[0]!;
    const o = t.orders.find((x) => x.red)!;
    const win = g.stations.find((s) => s.kind === 'window')!;
    const p = g.players.get(1)!;
    p.item = 'dishQ';
    o.recipe = 'margarita';
    stand(g, 1, win.tx, win.ty + 1);
    p.fx = 0;
    p.fy = -1;
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
  };
  it('the rush orders turn red and serving all of them is +20 each and +100', () => {
    const { g, closes } = room();
    force(g, 'rush');
    run(g, 200);
    const reds = g.teams[0]!.orders.filter((o) => o.red);
    expect(reds.length).toBeGreaterThanOrEqual(3);
    expect(g.ev2!.rush!.total).toBe(reds.length);
    const before = g.teams[0]!.score;
    for (let i = 0; i < reds.length; i++) serve(g);
    expect(closes.at(-1)).toMatchObject({ kind: 'rush', points: 20 * reds.length + 100, ok: true, title: '¡Servicio perfecto!' });
    expect(g.teams[0]!.score).toBeGreaterThan(before + 20 * reds.length + 100 - 1);
  });
  it('a red that expires costs the penalty twice and the close is "Clientes molestos"', () => {
    const { g, closes } = room();
    force(g, 'rush');
    run(g, 200);
    const n = g.ev2!.rush!.total;
    g.teams[0]!.score = 1000;
    for (const o of g.teams[0]!.orders) o.expiresAt = g.time + 50;
    run(g, 200);
    expect(closes.at(-1)).toMatchObject({ kind: 'rush', ok: false, title: 'Clientes molestos', points: 0 });
    expect(g.teams[0]!.score).toBe(1000 + (n + 0) * 2 * g.params.penalty + (g.teams[0]!.expired - n) * g.params.penalty + 0);
  });
});

describe('eventsV2: cumpleaños', () => {
  const dishOf = (r: string) => ({ marinara: 'dish', margarita: 'dishQ' })[r] ?? 'dish';
  function atWindow(g: Game, item: string) {
    const win = g.stations.find((s) => s.kind === 'window')!;
    const p = g.players.get(1)!;
    p.item = item as never;
    stand(g, 1, win.tx, win.ty + 1);
    p.fx = 0;
    p.fy = -1;
  }
  it('the cake is the card\'s most complex dish and starts with no candle', () => {
    const { g } = room({ recipes: true });
    force(g, 'birthday');
    run(g, 200);
    const cake = g.teams[0]!.orders.find((o) => o.cake)!;
    expect(cake.recipe).toBe(cakeRecipe(g));
    expect(g.ev2!.cake!.candled).toBe(false);
    expect(cake.expiresAt - g.time).toBeGreaterThan(70_000);
  });
  it('without the candle the dish is not served and the chef keeps it', () => {
    const { g, log } = room();
    force(g, 'birthday');
    run(g, 200);
    g.teams[0]!.orders = g.teams[0]!.orders.filter((o) => o.cake);
    const r = g.teams[0]!.orders[0]!.recipe;
    atWindow(g, dishOf(r));
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(g.players.get(1)!.item).toBe(dishOf(r));
    expect(log).toContain('interactInvalid');
  });
  it('A at the drawer lights the candle, then the cake pays 250 and the card names the chef', () => {
    const { g, closes } = room();
    force(g, 'birthday');
    run(g, 200);
    g.teams[0]!.orders = g.teams[0]!.orders.filter((o) => o.cake);
    const d = g.ev2!.cake!.drawer;
    stand(g, 1, d.tx, d.ty + 1);
    const p = g.players.get(1)!;
    Object.assign(p, { fx: 0, fy: -1 });
    expect(chefHint(g, p).a).toBe('Vela');
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(g.ev2!.cake!.candled).toBe(true);
    const before = g.teams[0]!.score;
    atWindow(g, dishOf(g.teams[0]!.orders[0]!.recipe));
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(closes.at(-1)).toMatchObject({ kind: 'birthday', points: 250, ok: true, by: 1 });
    expect(g.teams[0]!.score).toBe(before + 250);
  });
  it('an expired cake costs 50 and a balloon', () => {
    const { g, closes } = room();
    force(g, 'birthday');
    run(g, 200);
    g.teams[0]!.score = 500;
    for (const o of g.teams[0]!.orders) if (o.cake) o.expiresAt = g.time + 50;
    run(g, 200);
    expect(closes.at(-1)).toMatchObject({ kind: 'birthday', points: -50, ok: false, title: 'Torta vencida' });
  });
  it('aStation is unchanged near the drawer (the counter is still a counter)', () => {
    const { g } = room();
    force(g, 'birthday');
    run(g, 200);
    const d = g.ev2!.cake!.drawer;
    stand(g, 1, d.tx, d.ty + 1);
    Object.assign(g.players.get(1)!, { fx: 0, fy: -1 });
    expect(aStation(g, g.players.get(1)!)).toBe(g.stations[d.station]);
  });
});
