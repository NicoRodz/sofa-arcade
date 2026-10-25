// Magnetism (feel/magnet.ts), rule by rule. Each effect is checked against the same situation with the flag off (the control), so a green cannot come from an easy setup.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../difficulty';
import { DIRS, fixedMap, isFloor } from '../maps';
import { FOLD_MS } from '../recipes/defs';
import { createSchool } from '../tutorial/school';
import { Emitter, type GameEvents } from '../events';
import {
  RADIUS,
  REACH,
  REACH_SLACK,
  SPEED,
  TICK_MS,
  addPlayer,
  createGame,
  targetStation,
  tick,
  type Controls,
  type Game,
  type Player,
} from '../overcooked';
import { ASSIST_REACH_MULT } from '../assist';
import { chefHint } from '../hints';
import { addFloorItem } from '../floor';
import { BASE_REACH, CHEF_RADIUS, MAGNET_TUNING, magnetFor } from './magnet';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const MAP = fixedMap('1')!; // the open kitchen: crates, boards and ovens along the top row, counters on both sides
const round = (opts: Record<string, unknown> = {}, rows: readonly string[] = MAP.rows) => {
  const g = createGame({ mapId: MAP.id, rows, spawns: MAP.spawns, n: 2, seed: 3, ...opts });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
};
const put = (p: Player, x: number, y: number, fx: number, fy: number) => Object.assign(p, { x, y, fx, fy, vx: 0, vy: 0 });
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, c);
};
const at = (g: Game, tx: number, ty: number) => g.stations.find((s) => s.tx === tx && s.ty === ty)!;
const away = (g: Game) => put(g.players.get(2)!, 14.5, 7.5, 0, 1); // the other chef, out of the way

describe('the flag', () => {
  it("is off by default, on by option, and the constants it scales are the sim's", () => {
    expect(round().magnet).toBeNull();
    expect(round({ magnet: true }).magnet).toBe(MAGNET_TUNING.normal);
    expect(round({ magnet: 'strong' }).magnet).toBe(MAGNET_TUNING.strong);
    expect(round({ magnet: false }).magnet).toBeNull();
    expect(BASE_REACH).toBeCloseTo(REACH + REACH_SLACK, 9);
    expect(CHEF_RADIUS).toBe(RADIUS);
  });
  it('the lobby rule: Easy stronger, the rest normal, and the option can switch it off', () => {
    expect(magnetFor({}, 'normal')).toBe('normal');
    expect(magnetFor({}, 'hard')).toBe('normal');
    expect(magnetFor({}, 'easy')).toBe('strong');
    expect(magnetFor({ magnet: false }, 'easy')).toBe(false);
    expect(MAGNET_TUNING.strong.reachMult).toBeGreaterThan(MAGNET_TUNING.normal.reachMult);
  });
  it('quickens the stick (lower tau) but never adds inertia to a difficulty that is already instant', () => {
    expect(round({ magnet: true, difficulty: 'normal' }).params.tune.tauMs).toBeLessThan(TUNING.normal.tauMs);
    expect(round({ magnet: true, difficulty: 'normal' }).params.tune.tauMs).toBeGreaterThan(0); // the slide is still there
    expect(round({ magnet: true, difficulty: 'hard' }).params.tune.tauMs).toBe(0);
    expect(round({ magnet: true, difficulty: 'easy' }).params.tune.tauStopMs).toBe(0);
    expect(round({ difficulty: 'normal' }).params.tune).toBe(TUNING.normal); // flag off: the shared table, untouched
    expect(round({ magnet: true, difficulty: 'normal' }).params.tune.dashCdMs).toBeLessThan(TUNING.normal.dashCdMs);
  });
});

describe('target by score', () => {
  it('the station you stand under wins over the neighbour your facing leans to (the old probe picked the neighbour)', () => {
    for (const magnet of [false, true]) {
      const g = round({ magnet });
      away(g);
      put(g.players.get(1)!, 3.85, 1.35, 0.55, -0.84); // under the crate at (3,0) but near its right edge, looking up and a bit right
      const t = targetStation(g, g.players.get(1)!);
      expect(t && [t.tx, t.ty], `magnet ${magnet}`).toEqual(magnet ? [3, 0] : [4, 0]);
    }
  });
  it('reaches further than the plain rule (x1.3)', () => {
    const gap = 1.3; // body to the crate's edge
    const off = round(),
      on = round({ magnet: true });
    for (const g of [off, on]) {
      away(g);
      put(g.players.get(1)!, 3.5, 1 + gap + 0.0, 0, -1);
    }
    expect(targetStation(off, off.players.get(1)!)).toBeNull();
    expect(targetStation(on, on.players.get(1)!)?.kind).toBe('crate');
    put(on.players.get(1)!, 3.5, 1 + 1.6, 0, -1);
    expect(targetStation(on, on.players.get(1)!)).toBeNull(); // beyond x1.3 too
  });
  it('does not reach through a wall (the same crate with and without a wall tile in between)', () => {
    const rows = MAP.rows.map((r, y) => (y === 1 ? r.slice(0, 3) + '#' + r.slice(4) : r));
    const open = round({ magnet: true }),
      walled = round({ magnet: true }, rows);
    for (const g of [open, walled]) {
      away(g);
      put(g.players.get(1)!, 3.5, 2.3, 0, -1);
    } // 1.3 under the crate, a wall tile at (3,1) in the walled kitchen
    expect(targetStation(open, open.players.get(1)!)?.tx).toBe(3);
    expect(targetStation(walled, walled.players.get(1)!)).toBeNull();
  });
  it('a station behind the chef, or at its side beyond touching, is not the target', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 3.5, 1.9, 0, 1); // facing away from the crate row, 0.9 under it
    expect(targetStation(g, p)).toBeNull();
    put(p, 7.5, 1.5, 0, 1); // the same, looking down into the room: the whole row is behind
    expect(targetStation(g, p)).toBeNull();
  });
  it("another team's station is never the target", () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 3.5, 1.5, 0, -1);
    const s = at(g, 3, 0);
    expect(targetStation(g, p)).toBe(s);
    s.owner = 1;
    expect(targetStation(g, p)).not.toBe(s);
  });
});

describe('auto-orient and the pull', () => {
  it('Tomar turns the chef to the crate before taking', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 3.5, 1.5, 0.9, -0.44); // 64 degrees off
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('raw0');
    expect(p.fy).toBeLessThan(-0.99); // now looking straight at it
    expect(Math.abs(p.fx)).toBeLessThan(0.1);
  });
  it('Picar turns the chef to the board and the cut starts', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    const board = at(g, 7, 0);
    board.item = 'raw0';
    put(p, 7.5, 1.5, 0.8, -0.6);
    tick(g, new Map([[1, { ...idle, b: true }]]));
    expect(p.cutting).toBe(true);
    expect(p.fy).toBeLessThan(-0.99);
  });
  it('a slow chef beside a station turns to it by itself, gradually; a held stick keeps the last word; a fast one is left alone', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 7.5, 1.5, 0, 1); // looking down into the room, the row behind: nothing in the cone
    run(g, 200);
    expect(p.fy).toBeCloseTo(1, 5); // nothing to turn to
    put(p, 3.5, 1.5, 0.5, -0.5); // 45 degrees to the crate: in the cone
    const a0 = Math.abs(Math.atan2(p.fx, -p.fy)); // angle from "up"
    tick(g, new Map());
    const a1 = Math.abs(Math.atan2(p.fx, -p.fy));
    expect(a1).toBeLessThan(a0);
    expect(a1).toBeGreaterThan(0); // gradual, not a snap
    run(g, 300);
    expect(p.fy).toBeLessThan(-0.999);
    put(p, 3.5, 1.5, 0.5, -0.5);
    run(g, 120, new Map([[1, { ...idle, x: 0.7, y: -0.7 }]])); // the stick says 45 degrees: that stays (the chef is blocked by the crate row anyway)
    expect(p.fx).toBeGreaterThan(0.6);
    put(p, 3.5, 3, 0.5, -0.5);
    p.vx = 0;
    p.vy = -4; // fast and 1 tile from the row: no pull
    const f0 = [p.fx, p.fy];
    tick(g, new Map());
    expect([p.fx, p.fy]).toEqual(f0);
  });
  it('the control: without the flag nothing turns', () => {
    const g = round();
    away(g);
    const p = g.players.get(1)!;
    put(p, 3.5, 1.5, 0.5, -0.5);
    run(g, 400);
    expect([p.fx, p.fy]).toEqual([0.5, -0.5]);
  });
});

describe('the dash hugs the station', () => {
  const dashAt = (magnet: boolean) => {
    const g = round({ magnet });
    away(g);
    const p = g.players.get(1)!;
    put(p, 5.5, 5.5, 0, -1); // 5 tiles under the board row: the dash (2.1 tiles) would end well short of it, the hug (0.9) does not reach: use y so the gap after the dash is 0.6
    p.y = 1 + 0.35 + 2.1 + 0.6; // gap of 0.6 after a full dash
    p.x = 7.5;
    tick(g, new Map([[1, { ...idle, y: -1, b: true }]]));
    run(g, 500);
    return { g, p };
  };
  it('a dash that ends 0.6 tiles from a station goes on until it touches it; without the flag it stops short', () => {
    const on = dashAt(true),
      off = dashAt(false);
    expect(on.p.y - 1).toBeLessThan(CHEF_RADIUS + 0.03); // pressed against the board row (y of the edge = 1)
    expect(off.p.y - 1).toBeGreaterThan(CHEF_RADIUS + 0.4);
    expect(on.p.y).toBeGreaterThan(CHEF_RADIUS + 0.99); // never through it
  });
  it('and the hug never extends a dash twice or past its reach', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 7.5, 1 + 0.35 + 2.1 + 1.3, 0, -1); // 1.3 after the dash: beyond hugMax
    tick(g, new Map([[1, { ...idle, y: -1, b: true }]]));
    run(g, 400);
    expect(p.y - 1).toBeGreaterThan(CHEF_RADIUS + 1.0);
  });
  it('B along a counter row is still a dash (the stations beside the chef are not "in front")', () => {
    const g = round({ magnet: true });
    away(g);
    const p = g.players.get(1)!;
    put(p, 5.5, 1.5, 1, 0);
    tick(g, new Map([[1, { ...idle, x: 1, b: true }]]));
    expect(p.dashMs).toBeGreaterThan(0);
  });
});

describe("the phone's labels follow what the buttons will do", () => {
  it('beside a crate that only the magnet finds, A says what it takes and B still says Correr (the dash is free there)', () => {
    const off = round(),
      on = round({ magnet: true });
    for (const g of [off, on]) {
      away(g);
      put(g.players.get(1)!, 3.7, 1.95, 0.7, -0.7);
    } // 45 degrees, 0.95 under the crate: the old probe (0.8 ahead) falls short
    expect(targetStation(off, off.players.get(1)!)).toBeNull();
    expect(chefHint(off, off.players.get(1)!).a).not.toBe('Tomar masa');
    expect(chefHint(on, on.players.get(1)!).a).toBe('Tomar masa');
    expect(chefHint(on, on.players.get(1)!).b).toBe('Correr');
    tick(on, new Map([[1, { ...idle, x: 0.7, y: -0.7, b: true }]]));
    expect(on.players.get(1)!.dashMs).toBeGreaterThan(0); // and it is a dash, as the label said
  });
});

describe('rubbish beside a counter (hazards)', () => {
  const sab = (face: [number, number], magnet = true) => {
    const g = round({ magnet, hazards: true });
    away(g);
    addFloorItem(g, { tx: 6, ty: 7, item: 'trash', kind: 'trash', team: 0 });
    put(g.players.get(1)!, 5.5, 7.3, face[0], face[1]); // 0.7 above the counter row, rubbish one tile to the right
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    return g.players.get(1)!;
  };
  it('a janitor facing the rubbish picks it up although the magnet also finds the counter; facing the counter it uses the counter', () => {
    expect(sab([0.9, 0.44]).item).toBe('trash');
    expect(sab([0.1, 1]).item).toBeNull(); // the counter wins when it is what the chef faces
    const g = round({ magnet: true, hazards: true });
    away(g);
    put(g.players.get(1)!, 5.5, 7.3, 0.9, 0.44);
    expect(targetStation(g, g.players.get(1)!)?.kind).toBe('counter'); // the magnet does find a station here: the rubbish rule is what makes the pick-up work
  });
  it("and the phone says Recoger, not the counter's label", () => {
    const g = round({ magnet: true, hazards: true });
    away(g);
    addFloorItem(g, { tx: 6, ty: 7, item: 'trash', kind: 'trash', team: 0 });
    put(g.players.get(1)!, 5.5, 7.3, 0.9, 0.44);
    expect(chefHint(g, g.players.get(1)!).a).toBe('Recoger');
  });
});

describe('the Carta del día and the school with the magnet', () => {
  // an oven loaded with dough and tomato, the chef beside it facing 50 degrees off the oven
  const folding = (magnet: boolean) => {
    const m9 = fixedMap('9')!;
    const g = createGame({ rows: m9.rows, mapId: '9', n: 2, seed: 5, recipes: true, magnet });
    addPlayer(g, 1, 0);
    const oven = g.stations.find((x) => x.kind === 'pot')!;
    oven.inputs = [0, 1];
    const [dx, dy] = DIRS.find(([x, y]) => isFloor(g.grid, oven.tx + x, oven.ty + y))!;
    const a = (50 * Math.PI) / 180,
      [fx, fy] = [-dx, -dy],
      c = Math.cos(a),
      sn = Math.sin(a);
    Object.assign(g.players.get(1)!, {
      x: oven.tx + dx + 0.5 + dx * 0.4,
      y: oven.ty + dy + 0.5 + dy * 0.4,
      fx: fx * c - fy * sn,
      fy: fx * sn + fy * c,
      vx: 0,
      vy: 0,
    }); // 0.9 from the oven's edge
    return { g, oven };
  };
  it('Picar at the oven folds the calzone although the chef is not looking straight at it; the old probe does not reach, and the label says Doblar', () => {
    const on = folding(true),
      off = folding(false);
    expect(targetStation(on.g, on.g.players.get(1)!)).toBe(on.oven);
    expect(targetStation(off.g, off.g.players.get(1)!)).toBeNull();
    expect(chefHint(on.g, on.g.players.get(1)!).b).toBe('Doblar');
    for (const { g } of [on, off]) for (let t = 0; t < FOLD_MS + 200; t += TICK_MS) tick(g, new Map([[1, { ...idle, b: true }]]));
    expect(on.oven.folded).toBe(true);
    expect(off.oven.folded).toBeUndefined();
    expect(on.g.players.get(1)!.fy ** 2 + on.g.players.get(1)!.fx ** 2).toBeGreaterThan(0.99); // faces the oven now (unit vector)
  });
  it('the school teaches with the magnet the lobby gives (Easy: strong)', () => {
    const sch = createSchool({ bus: new Emitter<GameEvents>(), send: () => {} });
    expect(sch.game.magnet).toBe(MAGNET_TUNING.strong);
    sch.dispose();
  });
});

describe('Ayudante and the magnet live together', () => {
  it('the Ayudante keeps its any-direction reach, and has a little more of it with the magnet (x1.7 instead of x1.5)', () => {
    const g = round({ magnet: true, assist: [1] });
    const p = g.players.get(1)!;
    away(g);
    expect(p.assist).toBe(true);
    const reach = BASE_REACH * (ASSIST_REACH_MULT + MAGNET_TUNING.normal.assistExtra);
    put(p, 3.5, 1 + reach - 0.05, 0, 1); // facing AWAY from the crate, at the edge of the Ayudante's reach
    expect(targetStation(g, p)?.kind).toBe('crate');
    put(p, 3.5, 1 + reach + 0.1, 0, 1);
    expect(targetStation(g, p)).toBeNull();
    const plain = round({ assist: [1] }); // control: the Ayudante without the magnet reaches less
    away(plain);
    put(plain.players.get(1)!, 3.5, 1 + reach - 0.05, 0, 1);
    expect(targetStation(plain, plain.players.get(1)!)).toBeNull();
  });
  it('the Ayudante still has no inertia, and a one-tap chop still goes on, with the magnet on', () => {
    const g = round({ magnet: true, assist: [1] });
    away(g);
    const p = g.players.get(1)!;
    put(p, 7.5, 1.5, 0, -1);
    at(g, 7, 0).item = 'raw0';
    tick(g, new Map([[1, { ...idle, b: true }]]));
    tick(g, new Map());
    expect(p.chopLatch).toBe(true);
    const speedAfter = (() => {
      put(p, 7.5, 4, 0, 1);
      p.chopLatch = false;
      tick(g, new Map([[1, { ...idle, x: 1 }]]));
      return p.vx;
    })();
    expect(speedAfter).toBeCloseTo(SPEED, 5);
  });
});
