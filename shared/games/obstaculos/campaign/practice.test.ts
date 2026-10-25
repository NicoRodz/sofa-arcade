import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from './catalog';
import { PRACTICE, learnStation } from './practice';
import type { PracticeStation } from './types';

describe('Sala de practica: one station per action, opening when its mechanic debuts', () => {
  // A5 (S2) built Mundos 2 and 3 without new stations: the room keeps the eight actions of Mundo 1 (plan §2 asks one station per action, so the stations of the Bosque and
  // Glaciar mechanics are a follow-up that also needs the map/practice UI of S3 to list more than eight).
  it('has a station for every mechanic Mundo 1 introduces, each opening at the level that introduces it', () => {
    const taught = new Map<string, string>();
    for (const l of CAMPAIGN.filter((x) => x.status === 'built' && x.world === 'beach')) for (const m of l.introduces) taught.set(m, l.id);
    const trained = PRACTICE.flatMap((s) => s.mechanics);
    expect([...taught.keys()].sort()).toEqual([...trained].sort());
    for (const s of PRACTICE) for (const m of s.mechanics) expect(taught.get(m), `${s.id} ${m}`).toBe(s.opensAt);
  });
  it('stations are small, heartless, with a silhouette, a target ring (G) and no hints', () => {
    for (const s of PRACTICE) {
      expect(s.hearts).toBe('infinite');
      expect(s.silhouette).toBe(true);
      expect(s.def.rows.join('').split('G')).toHaveLength(2);
      expect(s.def.rows[0]!.length).toBeLessThanOrEqual(40);
      expect(s.def.hints ?? []).toEqual([]);
      expect(s.def.players).toEqual({ min: 2, max: 2 });
    }
  });
  for (const s of PRACTICE) {
    it(`${s.id} (${s.name}): the bot that knows ${s.mechanics.join('+')} finishes it and uses it; without it, not`, () => {
      const r = learnStation(s);
      expect(r.errors).toEqual([]);
    });
  }
  it('verified vs unverified: jump, tower, hand, throw, swing are shown by the validator; move, coyote, rope, signals, anchor are not', () => {
    const rs = PRACTICE.map(learnStation);
    expect(rs.flatMap((r) => r.verified).sort()).toEqual(['hand', 'jump', 'swing', 'throw', 'tower']);
    expect(rs.flatMap((r) => r.unverified).sort()).toEqual(['anchor', 'coyote', 'move', 'rope', 'signals']);
  });
  it('sabotage: a tower station with no wall is finished without the tower (red); a station with a hint is red', () => {
    const tower = PRACTICE.find((s) => s.id === 'p-tower')!;
    const flat: PracticeStation = {
      ...tower,
      def: { ...tower.def, rows: tower.def.rows.map((r, y) => (y >= 8 && y <= 11 ? r.replace(/#{6}/, '......') : r)) },
    };
    expect(learnStation(flat).errors.join()).toMatch(/finishes without tower/);
    const hinted: PracticeStation = { ...tower, def: { ...tower.def, hints: [{ x: 3, y: 9, text: 'Hola' }] } };
    expect(learnStation(hinted).errors.join()).toMatch(/no hints/);
  });
});
