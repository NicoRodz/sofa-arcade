// Sabotage S2 + the mirror proof: both teams run the SAME saboteur / janitor script in their own frame (golden/sabotage-bot.ts), so the round has to
// tie exactly: bags, throws, landings (twins), slips, drops, cleaning, desechos. Anything the sim does differently on the two sides breaks it.
import { describe, expect, it } from 'vitest';
import type { Difficulty } from '@pichi/core/difficulty';
import { MAP_H, MAP_W } from '../maps';
import type { RecBus } from '../../test/golden/bot';
import { runSabotage, type Role } from '../../test/golden/sabotage-run';
import type { SabotageMode } from '../sabotage-config';

type Row = { t: number; type: string; p: Record<string, unknown> };
const rows = (bus: RecBus): Row[] =>
  bus.log.map((l) => {
    const [t, type, p] = l.split('|');
    return { t: Number(t), type: type!, p: JSON.parse(p!) as Record<string, unknown> };
  });

const SAB_KINDS = [
  'sabotage:bagReady',
  'sabotage:launch',
  'sabotage:burst',
  'sabotage:land',
  'sabotage:caught',
  'sabotage:blocked',
  'chef:slip',
  'chef:recover',
  'trash:picked',
  'trash:binned',
  'trash:decayed',
  'delivered',
];

/** Events of the team that THROWS or is hit, reflected into team 0's frame, so both sides compare as the same list. `team` = the owner of the event's team field. */
function framed(r: ReturnType<typeof runSabotage>, team: number, kinds: string[]) {
  const flip = team === 1;
  const refl = (v: unknown): unknown =>
    Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')
      ? flip
        ? r.sigma((v as number[])[0]!, (v as number[])[1]!, MAP_W, MAP_H)
        : v
      : v;
  return rows(r.bus)
    .filter((e) => kinds.includes(e.type) && (e.p.team as number) === team)
    .map((e) => {
      const o: Record<string, unknown> = {};
      // 'at' of a slip / burst / aim and the tiles of a landing are positions; dir is a vector (sigma turns it with the world: compare the lengths instead)
      for (const [k, v] of Object.entries(e.p)) {
        if (['chef', 'player', 'station', 'tie', 'team', 'target'].includes(k)) continue;
        if (k === 'dir') {
          o[k] = (v as number[]).map(Math.abs);
          continue;
        }
        if (k === 'from' || k === 'landAt' || k === 'tile' || k === 'extra' || k === 'at') {
          o[k] = refl(v);
          continue;
        }
        o[k] = v;
      }
      return `${e.t}|${e.type}|${JSON.stringify(o)}`;
    });
}

describe('prueba del espejo con sabotaje: the same script on both sides ties exactly', () => {
  const play = (map: string, difficulty: Difficulty, mode: SabotageMode, seed: number, roles: Role[] = ['saboteur', 'janitor']) =>
    runSabotage({ map, mode, difficulty, seed, roles, bags: mode === 'chaos' ? 2 : 1 });
  const compare = (r: ReturnType<typeof runSabotage>) => {
    const [a, b] = r.g.teams;
    const fields = (t: NonNullable<typeof a>) => ({ score: t.score, delivered: t.delivered, expired: t.expired, reachedAt: t.reachedAt });
    const sab = (i: number) => {
      const s = r.g.sab!.teams[i]!;
      return { desechos: s.desechos, bags: s.bags, launches: s.launches.length, cd: s.cooldownUntil, flights: s.flights.length };
    };
    return { a: fields(a!), b: fields(b!), sa: sab(0), sb: sab(1), ea: framed(r, 0, SAB_KINDS), eb: framed(r, 1, SAB_KINDS) };
  };
  it('V1 (reflection), Suave on Normal: bags, throws, landings, slips, cleaning and scores match event for event; the chefs end up as twins', () => {
    const r = play('V1', 'normal', 'soft', 3);
    const c = compare(r);
    const count = (list: string[], type: string) => list.filter((e) => e.includes(`|${type}|`)).length;
    expect(count(c.ea, 'sabotage:launch'), 'throws').toBeGreaterThanOrEqual(3); // a tie at zero proves nothing
    expect(count(c.ea, 'sabotage:land') + count(c.ea, 'sabotage:caught') + count(c.ea, 'sabotage:burst')).toBeGreaterThanOrEqual(3);
    expect(c.ea.length).toBeGreaterThan(8);
    expect(c.eb).toEqual(c.ea);
    expect(c.sb).toEqual(c.sa);
    expect(c.b).toEqual(c.a);
    for (let i = 1; i <= 2; i++) {
      const p = r.g.players.get(i)!,
        q = r.g.players.get(i + 2)!;
      expect(q.x).toBeCloseTo(16 - p.x, 3);
      expect(q.y).toBeCloseTo(p.y, 3);
      expect(q.item).toBe(p.item);
    }
    expect(
      r.g.floor
        .filter((f) => f.team === 1)
        .map((f) => [16 - f.tx - 1, f.ty, f.bornAt, f.expiresAt])
        .sort(),
    ).toEqual(
      r.g.floor
        .filter((f) => f.team === 0)
        .map((f) => [f.tx, f.ty, f.bornAt, f.expiresAt])
        .sort(),
    );
  });
  it('...and the round has slips, drops and cleaning in it (the script is not idle)', () => {
    const r = play('V1', 'normal', 'soft', 3);
    const ev = rows(r.bus);
    const n = (type: string, team: number) => ev.filter((e) => e.type === type && e.p.team === team).length;
    expect(n('chef:slip', 0) + n('chef:slip', 1)).toBeGreaterThanOrEqual(2);
    expect(n('trash:picked', 0) + n('trash:picked', 1)).toBeGreaterThanOrEqual(2);
    expect(n('trash:binned', 0)).toBeGreaterThanOrEqual(1);
  });
  it('V3 (half turn), Caos on Difícil: the same', () => {
    const r = runSabotage({ map: 'V3', mode: 'chaos', difficulty: 'hard', seed: 8, roles: ['saboteur', 'janitor'], bags: 2 });
    const c = compare(r);
    expect(c.ea.filter((e) => e.includes('|sabotage:launch|')).length).toBeGreaterThanOrEqual(3);
    expect(c.eb).toEqual(c.ea);
    expect(c.sb).toEqual(c.sa);
    expect(c.b).toEqual(c.a);
  });
  it('the proof can fail: one chef less on team 1 breaks the tie', () => {
    const r = runSabotage({
      map: 'V1',
      mode: 'soft',
      difficulty: 'normal',
      seed: 3,
      roles: ['saboteur', 'janitor'],
      bags: 1,
      teams: [[1, 2], [3]],
    });
    const c = compare(r);
    expect(c.eb).not.toEqual(c.ea);
  });
});
