// VERSUS_V3 rat: the pieces the mirror run does not pin by itself (a tie between two equal paths or two equal counters, an enemy chef, the cave pick), one at a time.
import { describe, expect, it } from 'vitest';
import { MIRRORS, isoOf } from '../test/golden/mirror-bot';
import { SIGMAS } from './symmetry';
import { MAP_H, MAP_W } from './maps';
import { addPlayer, createGame, tick, type Game } from './overcooked';
import { caves } from './feel/rat-versus';
import { mulberry32 } from '@pichi/core/rng';

const TEAMS = [[1, 2], [3, 4]].map((playerIds) => ({ playerIds }));
const NAMES = { v1: 'mirrorX', v3: 'rot180' } as const;

/** A round in which the rat event starts on the next tick: both rats are out, `bait` says which counters hold something. */
function rats(key: keyof typeof MIRRORS) {
  const m = MIRRORS[key];
  const spawns = m.rows.flatMap((r, y) => [...r].flatMap((c, x): [number, number][] => (c === 'S' ? [[x, y]] : [])));
  const g = createGame({ rows: m.rows, spawns, teams: TEAMS, sigma: NAMES[key], events: true, frost: true, versusV3: true, magnet: true, seed: 3 });
  Object.assign(g.mid!, { kind: 'rat', announceAt: 0, startAt: 0, queue: [] });
  TEAMS.forEach((t) => t.playerIds.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  tick(g, new Map());
  tick(g, new Map());
  return { g, iso: isoOf(m.sigma), m };
}
const rat = (g: Game, team: number) => g.mid!.rats![team]!.rat!;
const clear = (g: Game) => {
  for (const s of g.stations) s.item = null;
  g.players.clear();
};

describe('VERSUS_V3 rat, piece by piece', () => {
  it('each rat comes in by a cave of its own kitchen, and the two caves are twins', () => {
    for (const key of ['v1', 'v3'] as const) {
      const { g, iso } = rats(key);
      const [a, b] = [rat(g, 0), rat(g, 1)];
      for (const [t, r] of [[0, a], [1, b]] as const) expect(g.kitchens!.comp[r.hole[1]]![r.hole[0]], `${key} team ${t}`).toBe(g.kitchens!.regions[t]);
      expect(iso.tile(...a.hole)).toEqual(b.hole);
      expect(caves(g, 0).map((p) => iso.tile(...p))).toEqual(caves(g, 1)); // the same list, in the same order, from both sides
    }
  });

  it('the cave comes from a sub-stream: the events stream does not move', () => {
    const { g } = rats('v1');
    const fresh = createGame({ rows: MIRRORS.v1.rows, teams: TEAMS, sigma: 'mirrorX', events: true, frost: true, versusV3: true, magnet: true, seed: 3 });
    expect(g.mid!.rng()).toBe(fresh.mid!.rng()); // the rats drew nothing from it
    expect(mulberry32(1)()).not.toBe(undefined);
  });

  it('a chef of the other kitchen cannot scare my rat, even standing on top of it', () => {
    const { g } = rats('v1');
    for (const s of g.stations) s.item = null;
    const [a] = [rat(g, 0)];
    const enemy = [...g.players.values()].find((p) => p.team === 1)!;
    for (const p of g.players.values()) if (p !== enemy) p.ghost = true;
    Object.assign(enemy, { x: a.x, y: a.y, dashMs: 150 });
    tick(g, new Map());
    expect(rat(g, 0).scared).toBe(false);
  });

  it('a counter of the other kitchen is not a target', () => {
    const { g } = rats('v1');
    clear(g);
    g.stations.filter((s) => s.kind === 'counter' && s.owner === 1).forEach((s) => (s.item = 'raw0'));
    for (let i = 0; i < 30; i++) tick(g, new Map());
    expect(rat(g, 0).target).toBeUndefined(); // its own kitchen has nothing: it waits
    expect(rat(g, 1).target).toBeDefined();
  });

  it('a tie between two equal counters goes to the twin counter, and equal paths to the twin first step', () => {
    for (const key of ['v1', 'v3'] as const) {
      const { g, iso } = rats(key);
      clear(g);
      const counters = g.stations.filter((s) => s.kind === 'counter' && s.owner === 1);
      const floor = [...Array(MAP_H * MAP_W).keys()].map((i): [number, number] => [i % MAP_W, Math.floor(i / MAP_W)]).filter(([x, y]) => g.kitchens!.comp[y]![x] === g.kitchens!.regions[1]);
      let checked = 0;
      for (const [x, y] of floor) {
        const tied = counters.filter((c, i) => counters.some((d, j) => j !== i && Math.hypot(c.tx - x, c.ty - y) === Math.hypot(d.tx - x, d.ty - y)));
        if (tied.length < 2 || checked >= 4) continue;
        checked++;
        for (const s of g.stations) s.item = null;
        for (const c of tied) {
          c.item = 'raw0';
          const [tx, ty] = iso.tile(c.tx, c.ty);
          g.stations.find((s) => s.tx === tx && s.ty === ty)!.item = 'raw0';
        }
        const [b, a] = [rat(g, 1), rat(g, 0)];
        Object.assign(b, { x: x + 0.5, y: y + 0.5, target: undefined, near: false, state: 'seek', born: g.time + 1e6 }); // `born` ahead: it only chooses, it never grabs
        const [ax, ay] = iso.point(b.x, b.y);
        Object.assign(a, { x: ax, y: ay, target: undefined, near: false, state: 'seek', born: g.time + 1e6 });
        tick(g, new Map());
        const twin = (i: number) => g.stations.findIndex((s) => [s.tx, s.ty].join() === iso.tile(g.stations[i]!.tx, g.stations[i]!.ty).join());
        expect(a.target, `${key} at ${x},${y}`).toBe(twin(b.target!));
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('equal-length paths: the first steps are twins (the search tries the directions through sigma)', () => {
    for (const key of ['v1', 'v3'] as const) {
      const { g, iso } = rats(key);
      clear(g);
      const sigma = SIGMAS[NAMES[key]];
      const counters = g.stations.filter((s) => s.kind === 'counter' && s.owner === 1);
      let checked = 0;
      for (const c of counters) {
        const [dx, dy] = [c.tx, c.ty];
        // floor tiles of the kitchen two or more columns and rows from the counter, in an open area: several shortest paths
        const starts = [...Array(MAP_H * MAP_W).keys()]
          .map((i): [number, number] => [i % MAP_W, Math.floor(i / MAP_W)])
          .filter(([x, y]) => g.kitchens!.comp[y]![x] === g.kitchens!.regions[1] && Math.abs(x - dx) >= 2 && Math.abs(y - dy) >= 2);
        for (const [sx, sy] of starts) {
          if (checked >= 6) continue;
          for (const s of g.stations) s.item = null;
          c.item = 'raw0';
          const [tx, ty] = iso.tile(c.tx, c.ty);
          g.stations.find((s) => s.tx === tx && s.ty === ty)!.item = 'raw0';
          const [b, a] = [rat(g, 1), rat(g, 0)];
          Object.assign(b, { x: sx + 0.5, y: sy + 0.5, heading: undefined, pauseMs: 0, runMs: 0, target: undefined, born: -1e6 });
          const [ax, ay] = iso.point(b.x, b.y);
          Object.assign(a, { x: ax, y: ay, heading: undefined, pauseMs: 0, runMs: 0, target: undefined, born: -1e6 });
          for (let i = 0; i < 20; i++) tick(g, new Map());
          const [mx, my] = iso.point(b.x, b.y);
          expect(Math.abs(a.x - mx) + Math.abs(a.y - my), `${key} from ${sx},${sy} to ${dx},${dy}`).toBeLessThan(1e-6);
          expect(sigma(0, 0, MAP_W, MAP_H)).toBeDefined();
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});
