// F5: the shared pantry of V2 (design pizzas-modalidades-coop-versus §2): the two cheese crates on the barrier draw from ONE stock of 4,
// and one unit comes back every 6 s while it is below 4. Coop and the other versus maps are untouched.
import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from './round/events';
import { fixedMap } from './maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from './overcooked';
import { PANTRY_EVERY_MS, PANTRY_MAX } from './versus/versus';
import { startVersusRound } from './versus/lobby';
import { versusMap } from './versus/maps';
import { VERSUS_STYLES } from '@pichi/game-pizzas/manifest';
import { mulberry32 } from '@pichi/core/rng';

const V2 = versusMap('V2')!;
const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const spawns = [...V2.versus.spawns[0], ...V2.versus.spawns[1]];

function mk(o: { rows?: readonly string[]; shared?: boolean; teams?: number[][] } = {}) {
  const bus = new Emitter<GameEvents>();
  const log: { picked: number[]; refill: { t: number; stock: number }[]; invalid: number[] } = { picked: [], refill: [], invalid: [] };
  const g = createGame({
    rows: o.rows ?? V2.rows,
    spawns,
    difficulty: 'easy',
    seed: 3,
    bus,
    shared: o.shared === false ? undefined : V2.versus.shared,
    teams: (
      o.teams ?? [
        [1, 2],
        [3, 4],
      ]
    ).map((playerIds) => ({ playerIds })),
  });
  (
    o.teams ?? [
      [1, 2],
      [3, 4],
    ]
  ).forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  bus.on('itemPicked', (e) => log.picked.push(e.player));
  bus.on('interactInvalid', (e) => log.invalid.push(e.player));
  bus.on('pantryRefill', (e) => log.refill.push({ t: g.time, stock: e.stock }));
  return { g, log };
}
/** The chef stands next to the pantry crate of its own side, facing it, with empty hands. */
function atPantry(g: Game, id: number) {
  const p = g.players.get(id)!;
  p.x = p.team === 0 ? 6.5 : 9.5;
  p.y = 4.5;
  p.fx = p.team === 0 ? 1 : -1;
  p.fy = 0;
  p.vx = p.vy = 0;
  p.item = null;
}
const press = (g: Game, id: number) => {
  atPantry(g, id);
  tick(g, new Map([[id, { ...idle, a: 1 }]]));
};
const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map());
};

describe('the shared pantry (V2)', () => {
  it('both crates on the barrier belong to nobody and hold one stock of 4 for the two teams', () => {
    const { g } = mk();
    const crates = g.stations.filter((s) => s.pantry);
    expect(crates.map((s) => [s.tx, s.ty, s.kind, s.crate, s.owner])).toEqual([
      [7, 4, 'crate', 2, null],
      [8, 4, 'crate', 2, null],
    ]);
    expect(g.pantry).toEqual({ stock: PANTRY_MAX, nextAt: Infinity });
    expect(PANTRY_MAX).toBe(4);
    expect(PANTRY_EVERY_MS).toBe(6000);
    expect(g.stations.filter((s) => !s.pantry).every((s) => s.owner === 0 || s.owner === 1)).toBe(true); // everything else stays with its kitchen
  });
  it('a take lowers the stock for BOTH teams: what team 0 takes is gone for team 1', () => {
    const { g, log } = mk();
    press(g, 1);
    press(g, 3); // one each
    expect(g.players.get(1)!.item).toBe('raw2');
    expect(g.players.get(3)!.item).toBe('raw2');
    expect(g.pantry!.stock).toBe(2);
    g.players.get(1)!.item = null;
    g.players.get(3)!.item = null;
    press(g, 2);
    press(g, 4); // two more empty it
    expect(g.pantry!.stock).toBe(0);
    expect(log.picked).toEqual([1, 3, 2, 4]);
    g.players.get(2)!.item = null;
    g.players.get(4)!.item = null;
    press(g, 1);
    press(g, 3); // nothing left for either
    expect(g.players.get(1)!.item).toBeNull();
    expect(g.players.get(3)!.item).toBeNull();
    expect(log.invalid).toEqual([1, 3]);
    expect(g.pantry!.stock).toBe(0);
  });
  it('one team can drain it alone: 4 takes in a row leave nothing for the rival', () => {
    const { g } = mk();
    for (let i = 0; i < 4; i++) {
      press(g, 1);
      g.players.get(1)!.item = null;
    }
    expect(g.pantry!.stock).toBe(0);
    press(g, 3);
    expect(g.players.get(3)!.item).toBeNull();
  });
  it('a unit comes back 6 s after the stock first dropped, then every 6 s, up to 4 and no further', () => {
    const { g, log } = mk();
    press(g, 1);
    g.players.get(1)!.item = null;
    const t0 = g.time; // the clock starts with the first take
    for (let i = 0; i < 2; i++) {
      press(g, 1);
      g.players.get(1)!.item = null;
    } // 4 -> 1
    run(g, PANTRY_EVERY_MS - 300);
    expect(g.pantry!.stock).toBe(1);
    run(g, 400);
    expect(g.pantry!.stock).toBe(2);
    expect(log.refill[0]!.t - t0).toBeGreaterThanOrEqual(PANTRY_EVERY_MS - 1);
    expect(log.refill[0]!.t - t0).toBeLessThan(PANTRY_EVERY_MS + 100);
    run(g, PANTRY_EVERY_MS * 3);
    expect(g.pantry!.stock).toBe(4); // capped
    expect(log.refill.map((r) => r.stock)).toEqual([2, 3, 4]);
    expect(g.pantry!.nextAt).toBe(Infinity); // full: the clock is stopped
  });
  it('the refill clock does not run while the stock is full: the first take after a long wait gives 6 s from the take, not an instant refill', () => {
    const { g, log } = mk();
    run(g, 20_000);
    expect(log.refill).toEqual([]);
    press(g, 1);
    expect(g.pantry!.stock).toBe(3);
    run(g, 3000);
    expect(g.pantry!.stock).toBe(3);
    run(g, 3200);
    expect(g.pantry!.stock).toBe(4);
  });
  it('the pantry is the only way to cheese on V2: no other crate gives it', () => {
    const { g } = mk();
    expect(g.stations.filter((s) => s.kind === 'crate' && s.crate === 2).map((s) => s.pantry)).toEqual([true, true]);
    expect(g.hasCheese).toBe(true);
  });
});

describe('the pantry only exists where the map declares it', () => {
  it('V1 and the other versus maps have no pantry: crates give for free, as before', () => {
    const r = mk({ rows: versusMap('V1')!.rows, shared: false });
    expect(r.g.pantry).toBeNull();
    expect(r.g.stations.some((s) => s.pantry)).toBe(false);
  });
  it('a coop round ignores a declared pantry', () => {
    const rows = fixedMap('1')!.rows;
    const y = rows.findIndex((r) => r.includes('3') || r.includes('1')),
      x = rows[y]!.search(/[13]/); // a real crate tile: declaring it shared must still do nothing in coop
    expect(rows[y]![x]).toMatch(/[13]/);
    const g = createGame({ rows, n: 2, shared: [[x, y]] });
    expect(g.pantry).toBeNull();
    expect(g.stations.some((s) => s.pantry)).toBe(false);
    expect(g.stations.find((s) => s.tx === x && s.ty === y)!.owner).toBe(0);
  });
  it("the lobby's start of a V2 round builds the pantry from the map", () => {
    const teams = [
      { id: 0, ...VERSUS_STYLES[0]!, playerIds: [1, 2] },
      { id: 1, ...VERSUS_STYLES[1]!, playerIds: [3, 4] },
    ];
    const round = startVersusRound({
      teams,
      choice: 'V2',
      difficulty: 'easy',
      seed: 1,
      modeOptions: {},
      slotOf: (id) => id,
      rand: mulberry32(1),
    });
    expect(round.map.id).toBe('V2');
    expect(round.game.pantry).toEqual({ stock: 4, nextAt: Infinity });
    const v1 = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'easy',
      seed: 1,
      modeOptions: {},
      slotOf: (id) => id,
      rand: mulberry32(1),
    });
    expect(v1.game.pantry).toBeNull();
  });
});
