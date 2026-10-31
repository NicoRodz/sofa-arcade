// Ayudante (assist.ts, hints.ts) together with the burning oven, the fire and the events: the one-tap chop becomes a one-tap extinguisher (the same latch), the contextual buttons
// know the fire, and the lobby options of both sides live in the same round. Rule: an Ayudante puts a fire out with ONE tap of B that goes on while it stays in front of it.
import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from './round/events';
import { DIRS, fixedMap, isFloor } from './maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Station } from './overcooked';
import { DOUSE_MS, FIRE_DELAY_MS, GRACE_MS } from './burn';
import { chefHint } from './hints';
import { LABEL_MAX, GAMES, modeOf } from '@pichi/catalog';
import { mulberry32 } from '@pichi/core/rng';
import { startVersusRound, syncTeams } from './versus/lobby';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
type Log = { [K in keyof GameEvents]?: { t: number }[] };
function mk(assist: number[]) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const g = createGame({ rows: fixedMap('11')!.rows, mapId: '11', n: 2, seed: 5, bus, burn: true, fire: true, assist });
  for (const k of ['fire:out', 'douseStart', 'douseStop'] as const)
    bus.on(k, (() => {
      (log[k] ??= []).push({ t: g.time });
    }) as never);
  addPlayer(g, 1, 0, 0);
  return { g, log };
}
const run = (g: Game, ms: number, c: Controls = idle) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map([[1, c]]));
};
function stand(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
function setFire(g: Game) {
  const oven = g.stations.find((s) => s.kind === 'pot')!;
  oven.inputs = [0, 1];
  oven.progress = 1;
  oven.done = true;
  oven.readyAt = g.time;
  run(g, GRACE_MS.normal + FIRE_DELAY_MS + 100);
  expect(oven.fire).toBeDefined();
  return oven;
}

describe('Ayudante and the fire', () => {
  it('one tap of B in front of the fire and it goes on by itself until it is out (a normal chef has to hold)', () => {
    const a = mk([1]);
    const oven = setFire(a.g);
    stand(a.g, oven);
    run(a.g, TICK_MS, { ...idle, b: true }); // the tap
    run(a.g, DOUSE_MS - 100); // B released
    expect(oven.fire).toBeDefined();
    run(a.g, 300);
    expect(oven.fire).toBeUndefined();
    expect(a.log['fire:out']).toHaveLength(1);
    expect(a.log.douseStart).toHaveLength(1);
    expect(a.log.douseStop).toHaveLength(1);
    const n = mk([]);
    const o2 = setFire(n.g);
    stand(n.g, o2);
    run(n.g, TICK_MS, { ...idle, b: true });
    run(n.g, DOUSE_MS + 200);
    expect(o2.fire).toBeDefined(); // not held: it did not go on
  });
  it('walking away with the stick ends it (the progress stays); the Ayudante never slips but burns its pizzas like everybody', () => {
    const a = mk([1]);
    const oven = setFire(a.g);
    stand(a.g, oven);
    run(a.g, TICK_MS, { ...idle, b: true });
    run(a.g, 1000);
    const part = oven.fire!;
    expect(part).toBeGreaterThan(900);
    const p = a.g.players.get(1)!;
    run(a.g, 400, { x: p.fx * -1, y: p.fy * -1, a: 0, b: false }); // away from it
    expect(a.log.douseStop).toHaveLength(1);
    expect(oven.fire!).toBeLessThan(part + 450);
    expect(oven.fire!).toBeGreaterThanOrEqual(part);
  });
});

describe('the contextual buttons know the fire', () => {
  it('on a burning station A is greyed "En llamas" and B reads "Apagar"; a burnt pizza comes out as "Sacar quemada"; every label fits the button', () => {
    const { g } = mk([]);
    const p = g.players.get(1)!;
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    oven.inputs = [0, 1];
    oven.progress = 1;
    oven.done = true;
    oven.readyAt = g.time;
    run(g, GRACE_MS.normal + 100);
    expect(oven.burnt).toBe(true);
    stand(g, oven);
    p.item = 'plate';
    expect(chefHint(g, p)).toMatchObject({ a: 'Sacar quemada', aIcon: 'oven' });
    p.item = null;
    run(g, FIRE_DELAY_MS);
    expect(oven.fire).toBeDefined();
    const h = chefHint(g, p);
    expect(h).toMatchObject({ a: 'En llamas', aOff: true, b: 'Apagar' });
    expect(h.bOff).toBeUndefined();
    for (const l of [h.a, h.b, 'Sacar quemada']) expect(l!.length).toBeLessThanOrEqual(LABEL_MAX);
  });
});

describe('both lobby options in one round', () => {
  it('a versus round with a chef on Ayudante and the events switched on has both: the Ayudante, the burning oven and the event', () => {
    const versus = modeOf(GAMES[0], 'versus');
    const teams = syncTeams(versus, null, [1, 2, 3, 4], 4, false)!;
    const r = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'hard',
      seed: 4,
      modeOptions: { events: true, sabotage: 'off' },
      slotOf: (id) => id - 1,
      rand: mulberry32(1),
      assist: [2],
    });
    expect([...r.game.assist]).toEqual([2]);
    expect(r.game.players.get(2)!.assist).toBe(true);
    expect(r.game.burn).toMatchObject({ fire: true });
    expect(r.game.mid).not.toBeNull();
  });
});
