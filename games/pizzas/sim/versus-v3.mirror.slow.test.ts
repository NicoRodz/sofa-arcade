// VERSUS_V3: the rat (one per kitchen) and the Ola de frio in versus, under the mirror proof (golden/mirror-bot.ts). Both kitchens are each other's isometry, so the rats
// must come in on the same tick through twin caves, walk twin paths, steal twin counters and the two sides must tie exactly.
import { describe, expect, it } from 'vitest';
import { MIRRORS, isoOf, runVersus } from '../test/golden/mirror-bot';
import { createGame, type Game } from './overcooked';
import { eventPool, type EventKind } from './midround';
import { versusRats } from './feel/rat-versus';
import { iceRows } from './versus/ice-patch';

type M = (typeof MIRRORS)[keyof typeof MIRRORS];
const NAMES = { v1: 'mirrorX', v3: 'rot180' } as const;
const FLAGS = { events: true, frost: true, versusV3: true, magnet: true } as const;
const T3 = [
  [1, 2, 3],
  [4, 5, 6],
];
const T2 = [
  [1, 2],
  [3, 4],
];

const own = (bus: { log: string[] }, team: number) =>
  bus.log
    .map((l) => l.split('|'))
    .filter(([, , p]) => (JSON.parse(p!) as { team?: number }).team === team)
    .map(([tk, type, p]) => {
      const o = JSON.parse(p!) as Record<string, unknown>;
      for (const k of ['team', 'player', 'station', 'tie', 'at']) delete o[k];
      return `${tk}|${type}|${JSON.stringify(o)}`;
    });
const count = (list: string[], type: string) => list.filter((e) => e.split('|')[1] === type).length;

/** A seed whose calendar holds `kind` (the proof must see each kind, so the seed is looked up, not hoped for). */
function seedFor(kind: EventKind, key: keyof typeof MIRRORS, teams: number[][]): number {
  for (let seed = 1; seed < 600; seed++) {
    const g = createGame({ rows: MIRRORS[key].rows, teams: teams.map((playerIds) => ({ playerIds })), sigma: NAMES[key], ...FLAGS, seed });
    if (g.mid!.kind === kind || g.mid!.queue?.some((q) => q.kind === kind)) return seed;
  }
  throw new Error(`no seed gives ${kind}`);
}
const run = (key: keyof typeof MIRRORS, kind: EventKind, teams: number[][], before?: (g: Game, t: number) => void) => {
  const m: M = MIRRORS[key];
  const seed = seedFor(kind, key, teams);
  return runVersus({ ...m, difficulty: 'normal', seed, teams, flags: { ...FLAGS, sigma: NAMES[key] } }, before);
};
/** Both kitchens' first counters hold something, so the rat has something to go for. */
const bait = (key: keyof typeof MIRRORS) => {
  const iso = isoOf(MIRRORS[key].sigma);
  return (g: Game) => {
    if (g.time === 0 || g.mid?.phase !== 'announced') return;
    const mine = g.stations.filter((s) => s.kind === 'counter' && s.owner === 0 && !s.item).sort((a, b) => a.ty - b.ty || a.tx - b.tx)[0];
    if (!mine) return;
    const [tx, ty] = iso.tile(mine.tx, mine.ty);
    const twin = g.stations.find((s) => s.tx === tx && s.ty === ty)!;
    if (!twin.item) {
      mine.item = 'raw0';
      twin.item = 'raw0';
    }
  };
};

describe('VERSUS_V3 under the mirror proof', () => {
  for (const [key, teams] of [
    ['v1', T3],
    ['v3', T2],
  ] as const)
    it(`${key}: a rat per kitchen walks twin paths, takes twin items, and the two sides tie`, () => {
      const m = MIRRORS[key];
      const iso = isoOf(m.sigma);
      const pos: [number, number, number, number][] = [];
      const base = bait(key);
      const r = run(key, 'rat', teams, (g, t) => {
        base(g);
        const [a, b] = [g.mid!.rats?.[0]?.rat, g.mid!.rats?.[1]?.rat];
        if (a && b) {
          const [bx, by] = iso.point(a.x, a.y);
          pos.push([bx, by, b.x, b.y]);
        } else if (!!a !== !!b) throw new Error(`only one rat at tick ${t}`);
      });
      const ea = own(r.bus, 0),
        eb = own(r.bus, 1);
      expect(count(ea, 'rat:appear')).toBe(1);
      expect(pos.length).toBeGreaterThan(300); // the rats were alive for seconds, and checked every tick
      for (const [x, y, bx, by] of pos) {
        expect(Math.abs(x - bx)).toBeLessThan(1e-9);
        expect(Math.abs(y - by)).toBeLessThan(1e-9);
      }
      expect(count(ea, 'rat:steal') + count(ea, 'rat:scared')).toBeGreaterThanOrEqual(1); // it did something
      expect(eb).toEqual(ea);
      const [a, b] = r.g.teams;
      expect(a!.delivered).toBeGreaterThanOrEqual(3);
      expect([b!.score, b!.delivered, b!.expired, b!.reachedAt]).toEqual([a!.score, a!.delivered, a!.expired, a!.reachedAt]);
    });

  it('v1: the Ola de frio freezes both kitchens the same: the slides and the tie', () => {
    let frozen = 0;
    const r = run('v1', 'frost', T3, (g) => {
      if (g.mid?.frost) frozen++;
    });
    expect(frozen).toBeGreaterThan(600); // 30 s of ice
    const slides = (team: number) =>
      r.bus.log.filter((l) => {
        const [, type, p] = l.split('|');
        return type === 'surface:slide' && r.g.teamIds[team]!.includes((JSON.parse(p!) as { player: number }).player);
      }).length;
    expect(slides(0)).toBeGreaterThan(0);
    expect(slides(1)).toBe(slides(0));
    const [a, b] = r.g.teams;
    expect([b!.score, b!.delivered, b!.expired]).toEqual([a!.score, a!.delivered, a!.expired]);
  });

  const slidesOf = (r: ReturnType<typeof runVersus>, team: number) =>
    r.bus.log.filter((l) => {
      const [, type, p] = l.split('|');
      return type === 'surface:slide' && r.g.teamIds[team]!.includes((JSON.parse(p!) as { player: number }).player);
    }).length;
  for (const [key, teams] of [
    ['v1', T3],
    ['v3', T2],
  ] as const)
    it(`${key}: the patch of ice in both kitchens plays the same, slides and tie`, () => {
      const m = MIRRORS[key];
      const rows = iceRows(m.rows, NAMES[key]);
      expect(rows.join('')).toContain('i');
      const r = runVersus({
        ...m,
        rows,
        difficulty: 'normal',
        seed: 4,
        teams,
        flags: { ...FLAGS, events: false, surfaces: true, sigma: NAMES[key] },
      });
      expect(slidesOf(r, 0)).toBeGreaterThan(0); // the chefs do cross it
      expect(slidesOf(r, 1)).toBe(slidesOf(r, 0));
      const [a, b] = r.g.teams;
      expect(a!.delivered).toBeGreaterThanOrEqual(2);
      expect([b!.score, b!.delivered, b!.expired, b!.reachedAt]).toEqual([a!.score, a!.delivered, a!.expired, a!.reachedAt]);
    });

  it('the proof can fail: ice in one kitchen only breaks the slides', () => {
    const m = MIRRORS.v1;
    const rows = iceRows(m.rows, 'mirrorX').map((r) => `${r.slice(0, 8).replaceAll('i', '.')}${r.slice(8)}`); // the left half loses its ice
    const r = runVersus({
      ...m,
      rows,
      difficulty: 'normal',
      seed: 4,
      teams: T3,
      flags: { ...FLAGS, events: false, surfaces: true, sigma: 'mirrorX' },
    });
    expect(slidesOf(r, 1)).not.toBe(slidesOf(r, 0));
  });

  it('the proof can fail: a rat that robs only one kitchen breaks the tie', () => {
    const base = bait('v1');
    const r = run('v1', 'rat', T3, (g, t) => {
      base(g);
      if (g.mid?.rats?.[1]?.rat) for (const s of g.stations) if (s.owner === 1 && s.kind === 'counter') s.item = null; // the rival's counters are always empty
    });
    expect(own(r.bus, 1)).not.toEqual(own(r.bus, 0));
  });

  it('without the flag a versus round has no rat and no frost in its pool', () => {
    const g = createGame({ rows: MIRRORS.v1.rows, teams: T3.map((playerIds) => ({ playerIds })), events: true, frost: true, seed: 1 });
    expect(eventPool(g)).not.toContain('rat');
    expect(eventPool(g)).not.toContain('frost');
    const g3 = createGame({
      rows: MIRRORS.v1.rows,
      teams: T3.map((playerIds) => ({ playerIds })),
      events: true,
      frost: true,
      versusV3: true,
      seed: 1,
    });
    expect(eventPool(g3)).toEqual(expect.arrayContaining(['rat', 'frost']));
    expect(versusRats(g3.mid!)).toEqual([]);
  });
});
