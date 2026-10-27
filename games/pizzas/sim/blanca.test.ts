// The Pizza blanca (Carta larga, map 26): the bare dough bakes 0.6x, the bell rings, cheese and mushroom go in inside the window, the second bake is 1.0x;
// a window that runs out burns the base. Difficulty sets the window: 10 s / 6 s / 4 s.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Game, type Order, type Station } from './overcooked';
import { act } from './round/stations';
import { fixedMap } from './maps';
import { cookMsOf, pickOrder } from './recipes/sim';
import { BELL_MS, BASE_COOK_MULT } from './recipes/sauce';
import { dishFor } from './recipes/defs';
import { chefHint } from './hints';
import type { Difficulty } from '@pichi/core/difficulty';

const make = (difficulty: Difficulty = 'normal'): Game => {
  const m = fixedMap('26')!;
  const g = createGame({ rows: m.rows, mapId: '26', recipes: true, spawns: m.spawns, difficulty });
  addPlayer(g, 1, 0, 0);
  return g;
};
const oven = (g: Game) => g.stations.find((s) => s.kind === 'pot')! as Station;
const order = (recipe: Order['recipe']): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe });
const idle = (g: Game, ms: number) => {
  for (let t = 0; t < ms / (1000 / 60); t++) tick(g, new Map());
};
const load = (g: Game, s: Station, ...items: ('cut0' | 'cut1' | 'cut2' | 'cut4' | 'sauce')[]) => {
  const p = g.players.get(1)!;
  for (const item of items) {
    p.item = item;
    act(g, p, s);
  }
  return p;
};
const events = (g: Game) => {
  const log: string[] = [];
  g.bus.on('potReady', () => log.push('bell'));
  g.bus.on('oven:burnt', () => log.push('burnt'));
  return log;
};

describe('the Pizza blanca', () => {
  it('the bare dough bakes the base at 0.6x, then the bell rings and the window opens', () => {
    const g = make();
    const s = oven(g);
    const log = events(g);
    load(g, s, 'cut0');
    expect(s.stage).toBe('base');
    expect(cookMsOf(g, s)).toBeCloseTo(g.params.cookMs * BASE_COOK_MULT);
    idle(g, g.params.cookMs * BASE_COOK_MULT - 300);
    expect(s.stage).toBe('base');
    idle(g, 600);
    expect(s.stage).toBe('bell');
    expect(s.bellLeft).toBeLessThanOrEqual(BELL_MS.normal);
    expect(log).toEqual(['bell']);
  });
  it('cheese and mushroom inside the window start the second bake (1.0x); the plate that comes out is the white pizza and total oven time is 1.6x', () => {
    const g = make();
    const s = oven(g);
    const p = load(g, s, 'cut0');
    idle(g, g.params.cookMs * BASE_COOK_MULT + 200);
    load(g, s, 'cut2');
    expect(s.stage, 'one topping is not enough').toBe('bell');
    load(g, s, 'cut4');
    expect(s.stage).toBe('top');
    expect(cookMsOf(g, s)).toBeCloseTo(g.params.cookMs);
    idle(g, g.params.cookMs + 200);
    expect(s.done).toBe(true);
    expect(s.burnt).toBeUndefined();
    p.item = 'plate';
    act(g, p, s);
    expect(p.item).toBe('dishB');
    expect(s.stage, 'the oven is clean again').toBeUndefined();
    expect(dishFor([0, 2, 4], false)).toBe('dishB');
  });
  it('the window runs out and the base burns: 10 s on Easy, 6 s on Normal, 4 s on Hard', () => {
    expect(BELL_MS).toEqual({ easy: 10_000, normal: 6000, hard: 4000 });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const g = make(d);
      const s = oven(g);
      const p = load(g, s, 'cut0');
      const log = events(g);
      idle(g, g.params.cookMs * BASE_COOK_MULT + 200);
      expect(s.stage).toBe('bell');
      idle(g, BELL_MS[d] - 600);
      expect(s.burnt, `${d} still open`).toBeUndefined();
      idle(g, 800);
      expect(s.burnt, `${d} burnt`).toBe(true);
      expect(log).toContain('burnt');
      p.item = 'plate';
      act(g, p, s);
      expect(p.item, 'a burnt base is only good for the bin').toBe('burnt');
    }
  });
  it('a tomato or the sauce before the bell (or during it) turns it into an ordinary pizza: the Marinara chef who loads the dough first is not punished', () => {
    const g = make();
    const s = oven(g);
    load(g, s, 'cut0', 'cut1');
    expect(s.stage).toBeUndefined();
    expect(s.inputs).toEqual([0, 1]);
    expect(s.progress).toBe(0);
    idle(g, g.params.cookMs + 200);
    expect(s.done).toBe(true);
    expect(dishFor(s.inputs, false)).toBe('dish');
    const h = make();
    const t = oven(h);
    load(h, t, 'cut0');
    idle(h, h.params.cookMs * BASE_COOK_MULT + 200);
    load(h, t, 'sauce');
    expect(t.stage).toBeUndefined();
    expect(t.bellLeft).toBeUndefined();
  });
  it('the lights out stop the window; the button says it is the bell; the white plate serves only its own order (or a Marinara one)', () => {
    const g = make();
    const s = oven(g);
    const p = load(g, s, 'cut0');
    idle(g, g.params.cookMs * BASE_COOK_MULT + 200);
    p.item = null;
    Object.assign(p, { x: s.tx + 0.5, y: s.ty + 1.5, fx: 0, fy: -1 });
    g.mid = { dark: true } as Game['mid'];
    const left = s.bellLeft;
    idle(g, 3000);
    expect(s.bellLeft).toBe(left);
    expect(chefHint(g, p).a).toBe('¡Campanilla!');
    expect(pickOrder(g, [order('margfresca')], 'dishB')).toBe(-1);
    expect(pickOrder(g, [order('blanca')], 'dishB')).toBe(0);
    expect(pickOrder(g, [order('blanca')], 'dishQ')).toBe(-1);
  });
});
