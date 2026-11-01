// The Pizza de la casa (Carta larga, map 27 Isla de hornos): a plate by stages. Base dough + sauce + cheese; ham before the oven, basil and portions after it; each upgrade is
// paid on top and adds 10 % to the tip. Everything is behind `upgradeOrders` / `sliceAfterBake`: with them off the round is the old one.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game, type Order, type Station } from './overcooked';
import { act } from './round/stations';
import { fixedMap } from './maps';
import { pickOrder } from './recipes/sim';
import { dishFor, isDish } from './recipes/defs';
import { casaExtras, casaMask } from './recipes/casa';
import { chefHint } from './phone/hints';
import { deliver } from './round/orders';
import type { Difficulty } from '@pichi/core/difficulty';

const make = (o: { difficulty?: Difficulty; upgrades?: boolean; slices?: boolean } = {}): Game => {
  const m = fixedMap('27')!;
  const g = createGame({
    rows: m.rows,
    mapId: '27',
    recipes: true,
    spawns: m.spawns,
    difficulty: o.difficulty ?? 'normal',
    upgradeOrders: o.upgrades ?? true,
    sliceAfterBake: o.slices ?? true,
    n: 4,
  });
  addPlayer(g, 1, 0, 0);
  return g;
};
const order = (recipe: Order['recipe'], o: Partial<Order> = {}): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe, ...o });
function face(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ].find(([dx, dy]) => g.grid[s.ty + dy!]?.[s.tx + dx!]?.kind === 'floor')!;
  Object.assign(p, { x: s.tx + dx! + 0.5, y: s.ty + dy! + 0.5, fx: -dx!, fy: -dy!, vx: 0, vy: 0 });
  return p;
}
const hold = (g: Game, ms: number) => {
  const c = new Map<number, Controls>([[1, { x: 0, y: 0, a: 0, b: true }]]);
  for (let t = 0; t < ms / (1000 / 60); t++) tick(g, c);
};
const idle = (g: Game, ms: number) => {
  for (let t = 0; t < ms / (1000 / 60); t++) tick(g, new Map());
};
const oven = (g: Game) => g.stations.find((s) => s.kind === 'pot')!;
const basil = (g: Game) => g.stations.find((s) => s.kind === 'crate' && s.crate === 4)!;
const board = (g: Game) => g.stations.find((s) => s.kind === 'board')!;
const bake = (g: Game, inputs: number[]) => {
  const s = oven(g);
  const p = face(g, s);
  for (const t of inputs) {
    p.item = (['cut0', 'cut1', 'cut2', 'cut3', 'cut4', 'cut5', 'sauce'] as const)[t]!;
    act(g, p, s);
  }
  return { s, p };
};

describe('the base and the oven', () => {
  it('dough, sauce and cheese come out as the casa plate; with the ham as the plate with the ham; the ham makes the oven take 1.15x longer', () => {
    const g = make();
    const { s, p } = bake(g, [0, 6, 2]);
    expect(s.inputs).toEqual([0, 6, 2]);
    idle(g, g.params.cookMs + 100);
    expect(s.done).toBe(true);
    p.item = 'plate';
    act(g, p, s);
    expect(p.item).toBe('dishH0');
    const h = make();
    const { s: s2, p: p2 } = bake(h, [0, 6, 2, 5]);
    idle(h, h.params.cookMs + 100);
    expect(s2.done, 'the ham: not ready at 1.0x').toBe(false);
    idle(h, h.params.cookMs * 0.15 + 100);
    expect(s2.done).toBe(true);
    p2.item = 'plate';
    act(h, p2, s2);
    expect(p2.item).toBe('dishH1');
  });
  it('with the flag off (or a card without the casa) the same oven gives the old sauce plate: dishFor ignores the cheese', () => {
    expect(dishFor([0, 6, 2], false)).toBe('dishN');
    const g = make({ upgrades: false });
    expect(g.rec?.recipes).not.toContain('casa');
    const { s, p } = bake(g, [0, 6, 2]);
    idle(g, g.params.cookMs + 100);
    p.item = 'plate';
    act(g, p, s);
    expect(p.item).toBe('dishN');
  });
});

describe('the upgrades after the oven', () => {
  it('basil on a casa plate adds the basil to its mask, once; a plate that is not a casa does not take it', () => {
    const g = make();
    const s = basil(g);
    const p = face(g, s);
    p.item = 'dishH1';
    act(g, p, s);
    expect(p.item).toBe('dishH3');
    act(g, p, s);
    expect(p.item, 'the basil only once').toBe('dishH3');
    expect(chefHint(g, p).a, 'nothing left to add').toBe('Pizza lista');
    p.item = 'dish';
    act(g, p, s);
    expect(p.item).toBe('dish');
    expect(chefHint(g, p).a).toBe('Pizza lista');
    p.item = 'dishH0';
    expect(chefHint(g, p).a).toBe('Albahaca');
    expect(make({ upgrades: false }).rec?.recipes).not.toContain('casa');
  });
  it('portions: a casa plate goes on a board, B held 1 s cuts it, a sliced plate cannot be cut again; flag off: the board refuses it', () => {
    const g = make();
    const s = board(g);
    const p = face(g, s);
    p.item = 'dishH2';
    act(g, p, s);
    expect(s.item).toBe('dishH2');
    expect(chefHint(g, p).b).toBe('Porciones');
    hold(g, 700);
    expect(s.item, 'not yet').toBe('dishH2');
    hold(g, 500);
    expect(s.item).toBe('dishH6');
    act(g, p, s);
    expect(p.item).toBe('dishH6');
    act(g, p, s);
    expect(p.item, 'a sliced plate does not go back on the board: nothing left to cut').toBe('dishH6');
    expect(s.item).toBeNull();
    const off = make({ slices: false });
    const q = face(off, board(off));
    q.item = 'dishH0';
    act(off, q, board(off));
    expect(q.item).toBe('dishH0');
  });
});

describe('the payment: the base, the upgrades and the tip', () => {
  const pay = (g: Game, item: 'dishH0' | 'dishH7') => {
    const p = g.players.get(1)!;
    g.teams[0]!.orders = [order('casa', { expiresAt: g.time + g.params.orderTtlMs })];
    p.item = item;
    const before = g.score;
    deliver(g, p);
    return { gain: g.score - before, tips: g.tips };
  };
  it('the base is 120 and a plate with every upgrade is 205; the tip of the full plate is 30 % larger than the bare one (+10 % per upgrade)', () => {
    const a = pay(make(), 'dishH0');
    const b = pay(make(), 'dishH7');
    expect(a.gain - a.tips).toBe(120);
    expect(b.gain - b.tips).toBe(205);
    expect(a.tips).toBe(Math.round(120 * 0.5));
    expect(b.tips).toBe(Math.round(205 * 0.5 * 1.3));
    expect(casaExtras('normal', 'dishH7')).toEqual({ points: 85, tip: 1.3, bonus: 1 });
  });
  it('Difficult takes only a casa with two upgrades and pays it x1.5; the other levels take any casa', () => {
    const hard = make({ difficulty: 'hard' });
    expect(pickOrder(hard, [order('casa')], 'dishH1')).toBe(-1);
    expect(pickOrder(hard, [order('casa')], 'dishH3')).toBe(0);
    expect(pickOrder(make(), [order('casa')], 'dishH0')).toBe(0);
    expect(pickOrder(make({ difficulty: 'easy' }), [order('casa')], 'dishH0')).toBe(0);
    const f = pay(hard, 'dishH7');
    expect(f.gain).toBe(Math.round((205 + Math.round(205 * 0.5 * 1.3)) * 1.5));
  });
});

describe('exact matching', () => {
  it('a casa plate serves only a casa order, and no other plate serves a casa order', () => {
    const g = make();
    for (const m of [0, 3, 7] as const) {
      const item = `dishH${m}` as const;
      expect(isDish(item)).toBe(true);
      expect(pickOrder(g, [order('marinara'), order('margarita')], item), `casa ${m} is not a Marinara`).toBe(-1);
      expect(pickOrder(g, [order('marinara'), order('casa')], item)).toBe(1);
      expect(casaMask(item)).toBe(m);
    }
    for (const item of ['dish', 'dishQ', 'dishN', 'dishNB', 'dishQB', 'dishC'] as const)
      expect(pickOrder(g, [order('casa')], item), item).toBe(-1);
  });
});
