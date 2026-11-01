// The mirror proof with the oven that burns and the fire switched on (golden/mirror-bot.ts plays both kitchens as each other's isometry): an oven that
// nobody looks after burns and catches fire in both kitchens in the same tick, the fire jumps to the reflected counters, and the two teams tie exactly.
import { describe, expect, it } from 'vitest';
import { MIRRORS, isoOf, runVersus } from '../../test/golden/mirror-bot';
import type { Game, Station } from '../overcooked';
import { HAZARD_V2 } from '../hazards/hazard-v2';

const bake = (g: Game, s: Station) => {
  s.inputs = [0, 1];
  s.progress = 1;
  s.done = true;
  s.readyAt = g.time;
};
/** At tick `at`, a pizza that nobody will take comes out ready in the SECOND oven (reading order) of each kitchen: team 1's is the reflected twin. `only`: just that team. */
function neglect(m: (typeof MIRRORS)[keyof typeof MIRRORS], at: number, only?: number) {
  const iso = isoOf(m.sigma);
  return (g: Game, t: number) => {
    if (t !== at) return;
    const ovens0 = g.stations.filter((s) => s.kind === 'pot' && s.owner === 0).sort((a, b) => a.ty - b.ty || a.tx - b.tx);
    const second = ovens0[1]!;
    if (only !== 1) bake(g, second);
    const [tx, ty] = iso.tile(second.tx, second.ty);
    if (only !== 0) bake(g, g.stations.find((s) => s.kind === 'pot' && s.tx === tx && s.ty === ty)!);
  };
}
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
const flags = { burn: true, fire: true };

describe('prueba del espejo con horno que quema y fuego', () => {
  it('V3 (rotation), 1v1: both kitchens burn the pizza and catch fire in the same tick, the fire jumps to the twin counters, and everything ties', () => {
    const r = runVersus({ ...MIRRORS.v3, difficulty: 'normal', seed: 4, teams: [[1], [2]], flags }, neglect(MIRRORS.v3, 600));
    const ea = own(r.bus, 0),
      eb = own(r.bus, 1);
    for (const e of [ea, eb]) {
      expect(count(e, 'oven:warn')).toBe(1);
      expect(count(e, 'oven:burnt')).toBe(1);
      expect(count(e, 'fire:start')).toBe(1);
      expect(count(e, 'fire:spread')).toBeGreaterThanOrEqual(1);
    }
    expect(eb).toEqual(ea);
    const [a, b] = r.g.teams;
    expect(a!.delivered).toBeGreaterThanOrEqual(2); // a tie at zero proves nothing
    expect([b!.score, b!.delivered, b!.expired, b!.tips, b!.reachedAt]).toEqual([
      a!.score,
      a!.delivered,
      a!.expired,
      a!.tips,
      a!.reachedAt,
    ]);
    // the same stations are burning in both kitchens (twins under the half turn)
    const iso = isoOf(MIRRORS.v3.sigma);
    const burning = (team: number) =>
      r.g.stations
        .filter((s) => s.owner === team && s.fire !== undefined)
        .map((s) => `${s.kind}`)
        .sort();
    expect(burning(1)).toEqual(burning(0));
    for (const s of r.g.stations.filter((x) => x.owner === 0 && x.fire !== undefined)) {
      const [tx, ty] = iso.tile(s.tx, s.ty);
      expect(r.g.stations.find((x) => x.tx === tx && x.ty === ty)!.fire).toBeDefined();
    }
  });
  it('V1 (reflection), 1v1 on Hard: the same (its ovens have no counter beside them, so the fire stays in the oven), and the timing is the grace window plus the fire delay', () => {
    const r = runVersus({ ...MIRRORS.v1, difficulty: 'hard', seed: 3, teams: [[1], [2]], flags }, neglect(MIRRORS.v1, 600));
    const ea = own(r.bus, 0),
      eb = own(r.bus, 1);
    expect(count(ea, 'fire:start')).toBe(1);
    expect(eb).toEqual(ea);
    const burnt = Number(ea.find((e) => e.split('|')[1] === 'oven:burnt')!.split('|')[0]),
      fire = Number(ea.find((e) => e.split('|')[1] === 'fire:start')!.split('|')[0]);
    expect((fire - burnt) * (1000 / 60)).toBeGreaterThan(HAZARD_V2.hard.fire.delayMs - 50);
    expect((fire - burnt) * (1000 / 60)).toBeLessThan(HAZARD_V2.hard.fire.delayMs + 50);
    expect(HAZARD_V2.hard.fire.graceMs).toBe(6000); // HAZARD_V2: 6 s of grace and 3 s of delay on Hard
  });
  it('the proof can fail: a pizza left to burn in one kitchen only breaks the tie', () => {
    const r = runVersus({ ...MIRRORS.v3, difficulty: 'normal', seed: 4, teams: [[1], [2]], flags }, neglect(MIRRORS.v3, 600, 0));
    expect(count(own(r.bus, 0), 'fire:start')).toBe(1);
    expect(count(own(r.bus, 1), 'fire:start')).toBe(0);
    expect(own(r.bus, 1)).not.toEqual(own(r.bus, 0));
  });
  it('the flags are what turn it on: the same round without them has no burn event at all', () => {
    const r = runVersus({ ...MIRRORS.v3, difficulty: 'normal', seed: 4, teams: [[1], [2]] }, neglect(MIRRORS.v3, 600));
    expect(r.bus.log.some((l) => /\|(oven|fire):/.test(l))).toBe(false);
  });
});
