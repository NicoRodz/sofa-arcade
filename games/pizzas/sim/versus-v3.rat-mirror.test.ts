// VERSUS_V3 rat, the two rats under the mirror: from twin starts, with twin chefs, the rat of kitchen 0 does exactly what the rat of kitchen 1 does, seen through sigma.
// The rat has three tie-breaks that read a handedness or an order: the BFS (DIRS order between equal paths), the side of the jump (left of the heading first) and the angle
// of the burst (+30 first). Under a reflection (mirrorX, V1) each one picks the OTHER twin unless the view of kitchen 0 is given the canonical frame; a half turn (V3) keeps them.
import { describe, expect, it } from 'vitest';
import { MIRRORS, isoOf } from '../test/golden/mirror-bot';
import { addPlayer, createGame, tick, type Controls, type Game } from './overcooked';
import type { Rat } from './midround';

const TEAMS = [
  [1, 2],
  [3, 4],
].map((playerIds) => ({ playerIds }));
const NAMES = { v1: 'mirrorX', v3: 'rot180' } as const;
const KEYS = ['v1', 'v3'] as const;
const EPS = 1e-9;

function setup(key: (typeof KEYS)[number]) {
  const m = MIRRORS[key];
  const spawns = m.rows.flatMap((r, y) => [...r].flatMap((c, x): [number, number][] => (c === 'S' ? [[x, y]] : [])));
  const g = createGame({
    rows: m.rows,
    spawns,
    teams: TEAMS,
    sigma: NAMES[key],
    events: true,
    frost: true,
    versusV3: true,
    magnet: true,
    seed: 3,
  });
  Object.assign(g.mid!, { kind: 'rat', announceAt: 0, startAt: 0, queue: [] });
  TEAMS.forEach((t) => t.playerIds.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  tick(g, new Map());
  tick(g, new Map());
  const floor: [number, number][] = [];
  g.grid.forEach((row, y) =>
    row.forEach((t, x) => t.kind === 'floor' && g.kitchens!.comp[y]![x] === g.kitchens!.regions[1] && floor.push([x, y])),
  );
  return { g, iso: isoOf(m.sigma), floor };
}
const ratOf = (g: Game, team: number) => g.mid!.rats![team]!.rat;
const fresh = (g: Game, x: number, y: number): Rat => ({
  x,
  y,
  state: 'seek',
  item: null,
  from: -1,
  hole: [x | 0, y | 0],
  scared: false,
  idleMs: 0,
  born: g.time + 1e6,
});
const quiet = (g: Game, keep: number[]) => {
  for (const s of g.stations) s.item = null;
  for (const p of g.players.values()) {
    p.ghost = !keep.includes(p.id);
    p.vx = p.vy = 0;
    p.dashMs = 0;
    p.dashCd = 0;
  }
};
/** The two rats, kitchen 1's at (x, y) and kitchen 0's at its twin. */
function place(g: Game, iso: ReturnType<typeof isoOf>, x: number, y: number) {
  const sub = (t: number) => g.mid!.rats![t]!;
  sub(1).rat = fresh(g, x, y);
  const [ax, ay] = iso.point(x, y);
  sub(0).rat = fresh(g, ax, ay);
}
const same = (iso: ReturnType<typeof isoOf>, a: Rat | null, b: Rat | null, label: string) => {
  expect(!!a, `${label} both alive or both gone`).toBe(!!b);
  if (!a || !b) return;
  const [bx, by] = iso.point(b.x, b.y);
  expect(Math.abs(a.x - bx), `${label} x`).toBeLessThan(EPS);
  expect(Math.abs(a.y - by), `${label} y`).toBeLessThan(EPS);
  for (const k of ['dodgeMs', 'pantMs', 'evadeMs'] as const) expect(a[k] ?? 0, `${label} ${k}`).toBeCloseTo(b[k] ?? 0, 6);
};
/** Does a rat at (x, y) have two different first steps on a shortest path to the counter (an independent BFS from the goal tiles outwards)? */
function hasTie(g: Game, c: { tx: number; ty: number }, x: number, y: number): boolean {
  const D: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const floor = (a: number, b: number) => g.grid[b]?.[a]?.kind === 'floor';
  const dist = new Map<string, number>();
  const q: [number, number][] = D.map(([dx, dy]): [number, number] => [c.tx + dx, c.ty + dy]).filter(([a, b]) => floor(a, b));
  q.forEach(([a, b]) => dist.set(`${a},${b}`, 0));
  for (let i = 0; i < q.length; i++) {
    const [a, b] = q[i]!;
    for (const [dx, dy] of D)
      if (floor(a + dx, b + dy) && !dist.has(`${a + dx},${b + dy}`)) {
        dist.set(`${a + dx},${b + dy}`, dist.get(`${a},${b}`)! + 1);
        q.push([a + dx, b + dy]);
      }
  }
  const d = dist.get(`${x},${y}`);
  return d !== undefined && D.filter(([dx, dy]) => dist.get(`${x + dx},${y + dy}`) === d - 1).length >= 2;
}
const DIRS8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
].map(([x, y]) => {
  const l = Math.hypot(x!, y!);
  return [x! / l, y! / l] as [number, number];
});

describe('VERSUS_V3 rat, the two rats are twins', () => {
  it('the walk to a counter breaks a tie between equal paths the same way in both kitchens', () => {
    for (const key of KEYS) {
      const { g, iso, floor } = setup(key);
      const counters = g.stations.filter((s) => s.kind === 'counter' && s.owner === 1);
      let walks = 0,
        ties = 0;
      for (const c of counters)
        for (const [x, y] of floor) {
          quiet(g, []);
          const [tx, ty] = iso.tile(c.tx, c.ty);
          c.item = 'raw0';
          g.stations.find((s) => s.tx === tx && s.ty === ty)!.item = 'raw0';
          place(g, iso, x + 0.5, y + 0.5);
          if (Math.abs(x - c.tx) + Math.abs(y - c.ty) <= 1) continue;
          for (let i = 0; i < 14; i++) {
            tick(g, new Map());
            same(iso, ratOf(g, 0), ratOf(g, 1), `${key} ${x},${y} -> ${c.tx},${c.ty} t${i}`);
          }
          walks++;
          if (hasTie(g, c, x, y)) ties++;
          c.item = null;
        }
      expect(walks).toBeGreaterThan(100);
      expect(ties, `${key} walks with two equal shortest paths`).toBeGreaterThan(20);
    }
  });

  it('a chef dashing at the rat makes both rats jump to the twin side and pant alike', () => {
    for (const key of KEYS) {
      const { g, iso, floor } = setup(key);
      let jumps = 0;
      for (const [x, y] of floor)
        for (const [dx, dy] of DIRS8) {
          quiet(g, [1, 3]);
          place(g, iso, x + 0.5, y + 0.5);
          const [cx, cy] = [x + 0.5 - dx * 1.6, y + 0.5 - dy * 1.6];
          if (!g.grid[Math.floor(cy)]?.[Math.floor(cx)] || g.grid[Math.floor(cy)]![Math.floor(cx)]!.kind !== 'floor') continue;
          const [bx, by] = iso.point(cx, cy),
            [vx, vy] = iso.vec(dx, dy);
          Object.assign(g.players.get(3)!, { x: cx, y: cy, dashMs: 150, dashDx: dx, dashDy: dy });
          Object.assign(g.players.get(1)!, { x: bx, y: by, dashMs: 150, dashDx: vx, dashDy: vy });
          for (let i = 0; i < 40; i++) {
            tick(g, new Map());
            same(iso, ratOf(g, 0), ratOf(g, 1), `${key} ${x},${y} dir ${dx.toFixed(2)},${dy.toFixed(2)} t${i}`);
            if (i === 3 && (ratOf(g, 1)?.dodgeMs ?? 0) + (ratOf(g, 1)?.pantMs ?? 0) > 0) jumps++;
          }
        }
      expect(jumps, `${key} dodges`).toBeGreaterThan(20);
    }
  });

  it('a chef walking at the rat makes both rats bolt along twin angles', () => {
    for (const key of KEYS) {
      const { g, iso, floor } = setup(key);
      let bolts = 0;
      for (const [x, y] of floor)
        for (const [dx, dy] of DIRS8) {
          quiet(g, [1, 3]);
          place(g, iso, x + 0.5, y + 0.5);
          const [cx, cy] = [x + 0.5 - dx * 2.2, y + 0.5 - dy * 2.2];
          if (g.grid[Math.floor(cy)]?.[Math.floor(cx)]?.kind !== 'floor') continue;
          const [bx, by] = iso.point(cx, cy),
            [vx, vy] = iso.vec(dx, dy);
          Object.assign(g.players.get(3)!, { x: cx, y: cy });
          Object.assign(g.players.get(1)!, { x: bx, y: by });
          const c1: Controls = { x: dx, y: dy, a: 0, b: false },
            c0: Controls = { x: vx, y: vy, a: 0, b: false };
          for (let i = 0; i < 30; i++) {
            tick(
              g,
              new Map([
                [3, c1],
                [1, c0],
              ]),
            );
            same(iso, ratOf(g, 0), ratOf(g, 1), `${key} ${x},${y} dir ${dx.toFixed(2)},${dy.toFixed(2)} t${i}`);
            if ((ratOf(g, 1)?.evadeMs ?? 0) > 0) bolts++;
          }
        }
      expect(bolts, `${key} bolts`).toBeGreaterThan(20);
    }
  });
});
