import { describe, expect, it } from 'vitest';
import { Emitter, type GameEvents } from '../round/events';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '../overcooked';
import type { EventKind } from '../rules/midround';
import { BOARD_RADIUS, HOLD_MS, cakeLine, eventsV2Of, pickSpot } from './state';
import { cakeRecipe } from './events';
import { chefHint } from '../phone/hints';
import { ev2Bot } from './bot';
import { aStation } from '../round/targeting';
import { OIL, at, setTile } from '../mech/oil/state';
import { hz3Params } from '../hazards/hazard-v3';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Close = GameEvents['ev2:close'];

function room(o: { v2?: boolean | null; difficulty?: 'normal' | 'hard'; chefs?: number; recipes?: boolean; oil?: boolean } = {}) {
  const bus = new Emitter<GameEvents>();
  const closes: Close[] = [];
  const log: string[] = [];
  bus.on('ev2:close', (c) => closes.push(c));
  for (const k of ['ev2:mood', 'ev2:cake', 'interactInvalid', 'delivered', 'orderExpired'] as const) bus.on(k, () => log.push(k));
  const g = createGame({
    events: true,
    eventsSeed: 7,
    ...(o.v2 === null ? {} : { eventsV2: o.v2 ?? true }),
    difficulty: o.difficulty ?? 'normal',
    recipes: o.recipes ?? false,
    ...(o.oil ? { mech: { oil: true } } : {}),
    bus,
  });
  for (let i = 1; i <= (o.chefs ?? 1); i++) addPlayer(g, i, i - 1);
  while (g.countdown > 0 || !g.started) tick(g, new Map());
  return { g, closes, log };
}
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, c);
};
// the event of the round becomes `kind`, starting in 100 ms (the debug hook of the screen does the same)
function force(g: Game, kind: EventKind) {
  Object.assign(g.mid!, {
    kind,
    phase: 'wait',
    announceAt: g.time,
    startAt: g.time + 100,
    endAt: Infinity,
    dark: false,
    rat: null,
    queue: undefined,
  });
}
const stand = (g: Game, id: number, tx: number, ty: number) =>
  Object.assign(g.players.get(id)!, { x: tx + 0.5, y: ty + 0.5, vx: 0, vy: 0 });

describe('eventsV2: the flag', () => {
  it('is off by default and in versus; on only with events', () => {
    expect(room({ v2: false }).g.ev2).toBeUndefined();
    expect(createGame({ eventsV2: true }).ev2).toBeUndefined(); // no events, no presence
    expect(room().g.ev2).toBeDefined();
  });
  it('the lobby reads it as on unless the option says false (the juntada plays the events with presence)', () => {
    expect(eventsV2Of(undefined)).toBe(true);
    expect(eventsV2Of({})).toBe(true);
    expect(eventsV2Of({ events: true })).toBe(true);
    expect(eventsV2Of({ eventsV2: false })).toBe(false);
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
  it("the cake is the card's most complex dish and starts with no candle", () => {
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
    expect(cakeLine('normal')).toContain(String(closes.at(-1)!.points)); // the banner promises what the card pays
    expect(cakeLine('hard')).toBe('Torta de 350');
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

describe('eventsV2: bots', () => {
  const drive = (g: Game, until: () => boolean, ms: number, ids: number[]) => {
    for (let t = 0, n = 0; t < ms && !until(); t += TICK_MS, n++) {
      const c = new Map<number, Controls>();
      ids.forEach((id, rank) => c.set(id, ev2Bot(g, g.players.get(id)!, rank, n) ?? idle));
      tick(g, c);
    }
  };
  it('a bot walks to the board, holds B and the light is back within 8 s of the start', () => {
    const { g, closes } = room();
    force(g, 'blackout');
    drive(g, () => !!closes.length, 12_000, [1]);
    expect(closes[0]).toMatchObject({ kind: 'blackout', ok: true });
    expect(g.ev2!.restoredAt! - g.mid!.startAt).toBeLessThan(8000);
  });
  it('two Hard bots do it together', () => {
    const { g, closes } = room({ difficulty: 'hard', chefs: 2 });
    force(g, 'blackout');
    drive(g, () => !!closes.length, 15_000, [1, 2]);
    expect(closes[0]).toMatchObject({ kind: 'blackout', ok: true });
  });
  it('a bot with free hands lights the candle', () => {
    const { g } = room();
    force(g, 'birthday');
    run(g, 200);
    drive(g, () => g.ev2!.cake!.candled, 15_000, [1]);
    expect(g.ev2!.cake!.by).toBe(1);
  });
});

describe('eventsV2: derrame', () => {
  const spillRoom = () => {
    const r = room({ oil: true });
    force(r.g, 'spill');
    run(r.g, 200); // the event starts and throws the patches
    return r;
  };
  const patches = (g: Game) => g.ev2!.spill!.tiles;
  const wipe = (g: Game, idx: number) => setTile(g, idx, 0, 0); // what a chef's B does when the wiping run is done (mech/oil/module.ts tickTiles)
  it('keeps the patches and the plazo of the spill', () => {
    const { g } = spillRoom();
    const k = g.ev2!.spill!;
    expect(k.tiles.length).toBe(hz3Params(g).oil.spillPatches);
    expect(k.dryTicks).toBe(hz3Params(g).oil.spillDry);
    expect(k.tiles.every((i) => at(g, i) === OIL)).toBe(true);
  });
  it('every patch wiped before it dries: +60 and "Cocina reluciente" on the card, once', () => {
    const { g, closes } = spillRoom();
    const before = g.teams[0]!.score;
    for (const i of patches(g).slice(1)) wipe(g, i);
    run(g, 3500); // the event is over (3 s) and one patch is still there: nothing yet
    expect(g.mid!.phase).toBe('done');
    expect(closes).toHaveLength(0);
    wipe(g, patches(g)[0]!);
    run(g, 100);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ kind: 'spill', points: 60, ok: true, title: 'Cocina reluciente' });
    expect(g.teams[0]!.score).toBe(before + 60);
    run(g, 5000);
    expect(closes).toHaveLength(1);
  });
  it('a chef wiping the last patch with B closes it (the real wipe, not a poke at the floor)', () => {
    const { g, closes } = spillRoom();
    const [last, ...rest] = patches(g).reverse() as [number, ...number[]];
    for (const i of rest) wipe(g, i);
    const tx = last % 16,
      ty = Math.floor(last / 16);
    const spot = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].find(([dx, dy]) => g.grid[ty + dy!]?.[tx + dx!]?.kind === 'floor')!;
    stand(g, 1, tx + spot[0]!, ty + spot[1]!);
    Object.assign(g.players.get(1)!, { fx: -spot[0]!, fy: -spot[1]! });
    run(g, 3000, new Map([[1, { ...idle, b: true }]]));
    expect(at(g, last)).not.toBe(OIL);
    expect(closes.at(-1)).toMatchObject({ kind: 'spill', points: 60, ok: true });
  });
  it('the oil dries first: no prize and a card that says so', () => {
    const { g, closes } = spillRoom();
    const before = g.teams[0]!.score;
    for (const i of patches(g).slice(1)) wipe(g, i);
    run(g, (hz3Params(g).oil.spillDry / 60) * 1000 + 2000);
    expect(patches(g).every((i) => at(g, i) === 0)).toBe(true); // it dried by itself: reads as clean to the floor, but too late
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ kind: 'spill', points: 0, ok: false, title: 'El aceite se secó solo' });
    expect(g.teams[0]!.score).toBe(before);
  });
  it('a round without eventsV2 plays the spill as before: no state, no card', () => {
    const { g, closes } = room({ oil: true, v2: false });
    force(g, 'spill');
    run(g, 200);
    for (let i = 0; i < 128; i++) setTile(g, i, 0, 0);
    run(g, 1000);
    expect(g.ev2).toBeUndefined();
    expect(closes).toHaveLength(0);
  });
});
