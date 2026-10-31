// The mirror proof with the mid-round event switched on (golden/mirror-bot.ts plays both kitchens as each other's isometry): the same event reaches both teams in the same
// tick and the two sides tie exactly, for every event a versus round can have (rush, birthday, blackout), alone and together with the burning oven and the fire.
import { describe, expect, it } from 'vitest';
import { MIRRORS, isoOf, runVersus } from '../test/golden/mirror-bot';
import { createGame, type Game, type Station } from './overcooked';
import { createMid, type EventKind } from './midround';

const own = (bus: { log: string[] }, team: number) =>
  bus.log
    .map((l) => l.split('|'))
    .filter(([, , p]) => (JSON.parse(p!) as { team?: number }).team === team)
    .map(([tk, type, p]) => {
      const o = JSON.parse(p!) as Record<string, unknown>;
      delete o.team;
      delete o.player;
      delete o.station;
      delete o.tie;
      return `${tk}|${type}|${JSON.stringify(o)}`;
    });
const count = (list: string[], type: string) => list.filter((e) => e.split('|')[1] === type).length;
const global = (bus: { log: string[] }, type: string) =>
  bus.log
    .map((l) => l.split('|'))
    .filter(([, t]) => t === type)
    .map(([tk, , p]) => `${tk}|${p}`);

/** A seed whose event on this map is `kind` (the proof must see each kind, so the seed is looked up, not hoped for). */
function seedFor(kind: EventKind, m: (typeof MIRRORS)[keyof typeof MIRRORS], teams: number[][]): number {
  for (let seed = 1; seed < 500; seed++) {
    const g = createGame({ rows: m.rows, teams: teams.map((playerIds) => ({ playerIds })), events: true, seed });
    if (createMid(g, seed).kind === kind) return seed;
  }
  throw new Error(`no seed gives ${kind}`);
}
const bake = (g: Game, s: Station) => {
  s.inputs = [0, 1];
  s.progress = 1;
  s.done = true;
  s.readyAt = g.time;
};
function neglect(m: (typeof MIRRORS)[keyof typeof MIRRORS], at: number) {
  const iso = isoOf(m.sigma);
  return (g: Game, t: number) => {
    if (t !== at) return;
    const second = g.stations.filter((s) => s.kind === 'pot' && s.owner === 0).sort((a, b) => a.ty - b.ty || a.tx - b.tx)[1]!;
    bake(g, second);
    const [tx, ty] = iso.tile(second.tx, second.ty);
    bake(g, g.stations.find((s) => s.kind === 'pot' && s.tx === tx && s.ty === ty)!);
  };
}

describe('prueba del espejo con eventos a mitad de ronda', () => {
  const teams = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  for (const kind of ['rush', 'birthday', 'blackout'] as const) {
    it(`V1 3v3: ${kind} reaches both kitchens in the same tick and the two sides tie`, () => {
      const seed = seedFor(kind, MIRRORS.v1, teams);
      const r = runVersus({ ...MIRRORS.v1, difficulty: 'normal', seed, teams, flags: { events: true } });
      const ea = own(r.bus, 0),
        eb = own(r.bus, 1);
      expect(global(r.bus, 'event:start')).toHaveLength(2); // HAZARD_V2: Normal has two events per round (was 1)
      expect(r.bus.log.some((l) => l.includes('|event:start|') && l.includes(`"kind":"${kind}"`))).toBe(true);
      expect(global(r.bus, 'event:announce')).toHaveLength(2);
      expect(global(r.bus, 'event:end')).toHaveLength(2);
      if (kind === 'birthday')
        for (const e of [ea, eb]) expect(e.filter((x) => x.includes('"birthday":true') && x.includes('|orderNew|'))).toHaveLength(1);
      if (kind === 'rush') expect(count(ea, 'orderNew')).toBe(count(eb, 'orderNew'));
      expect(eb).toEqual(ea);
      const [a, b] = r.g.teams;
      expect(a!.delivered).toBeGreaterThanOrEqual(5); // a tie at zero proves nothing
      expect([b!.score, b!.delivered, b!.expired, b!.tips, b!.bestStreak, b!.reachedAt]).toEqual([
        a!.score,
        a!.delivered,
        a!.expired,
        a!.tips,
        a!.bestStreak,
        a!.reachedAt,
      ]);
    });
  }
  it('the event moves the result: a round with a birthday order is not the round without it', () => {
    const seed = seedFor('birthday', MIRRORS.v1, teams);
    const with_ = runVersus({ ...MIRRORS.v1, difficulty: 'normal', seed, teams, flags: { events: true } });
    const without = runVersus({ ...MIRRORS.v1, difficulty: 'normal', seed, teams });
    expect(own(with_.bus, 0)).not.toEqual(own(without.bus, 0));
  });
  it('V3 (rotation) 2v2 with the burning oven, the fire AND the event on: still an exact tie', () => {
    const t2 = [
      [1, 2],
      [3, 4],
    ];
    for (const kind of ['blackout', 'rush'] as const) {
      const seed = seedFor(kind, MIRRORS.v3, t2);
      const r = runVersus(
        { ...MIRRORS.v3, difficulty: 'hard', seed, teams: t2, flags: { burn: true, fire: true, events: true } },
        neglect(MIRRORS.v3, 600),
      );
      const ea = own(r.bus, 0),
        eb = own(r.bus, 1);
      expect(count(ea, 'fire:start'), kind).toBe(1);
      expect(count(ea, 'fire:spread'), kind).toBeGreaterThanOrEqual(1);
      expect(global(r.bus, 'event:start'), kind).toHaveLength(3); // HAZARD_V2: Hard has three events per round (was 1)
      expect(eb, kind).toEqual(ea);
      const [a, b] = r.g.teams;
      expect([b!.score, b!.delivered, b!.expired, b!.reachedAt], kind).toEqual([a!.score, a!.delivered, a!.expired, a!.reachedAt]);
    }
  });
  it('the proof can fail: an event that reaches only one kitchen breaks the tie', () => {
    const seed = seedFor('birthday', MIRRORS.v1, teams);
    const r = runVersus({ ...MIRRORS.v1, difficulty: 'normal', seed, teams, flags: { events: true } }, (g) => {
      g.teams[1]!.orders = g.teams[1]!.orders.filter((o) => !o.birthday); // the rival's birthday order is taken away the moment it shows up
    });
    expect(own(r.bus, 1)).not.toEqual(own(r.bus, 0));
    expect(count(own(r.bus, 0), 'delivered')).toBeGreaterThan(0);
  });
});
