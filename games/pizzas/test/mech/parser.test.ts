// The parser reads a mechanic's letter only behind its flag: without it the load fails (a letter is never read as floor).
import { describe, expect, it } from 'vitest';
import { parseMap } from '../../sim/maps';
import { MECH_LETTER_IDS, MECH_IDS, type MechOpts } from '../../sim/mech/ids';
import { createGame } from '../../sim/overcooked';
import { withLetter } from './rows';

describe('mechanic letters', () => {
  for (const [letter, id] of Object.entries(MECH_LETTER_IDS)) {
    it(`'${letter}' without mech.${id} is a load error, with it a tile`, () => {
      expect(() => parseMap(withLetter(letter))).toThrow(new RegExp(`needs the flag mech\\.${id}`));
      expect(() => parseMap(withLetter(letter), false, { [id]: false })).toThrow(/needs the flag/);
      const flags: MechOpts = { [id]: true };
      expect(() => parseMap(withLetter(letter), false, flags)).not.toThrow();
      expect(() => createGame({ rows: withLetter(letter) })).toThrow(/needs the flag/);
      expect(() => createGame({ rows: withLetter(letter), mech: flags })).not.toThrow();
    });
    it(`'${letter}' is refused in a versus map even with the flag`, () => {
      expect(() => parseMap(withLetter(letter), true, { [id]: true })).toThrow(/unknown tile/);
    });
  }
  it('a flag of another mechanic does not unlock the letter', () => {
    expect(() => parseMap(withLetter('M'), false, { gate: true })).toThrow(/mech\.kneader/);
  });
  it('the letters belong to the ids of the design', () => {
    expect(new Set(Object.values(MECH_LETTER_IDS))).toEqual(
      new Set(['kneader', 'woodOven', 'gate', 'oil', 'sprinkler', 'bridge', 'oneWay', 'raft']),
    );
    expect(MECH_IDS).toHaveLength(12);
  });
  it('W is an oven (a pot with wood), M and Q are stations, the rest is walkable floor', () => {
    const w = parseMap(withLetter('W'), false, { woodOven: true });
    expect(w.flat().filter((t) => t.kind === 'station' && t.wood)).toEqual([{ kind: 'station', station: 'pot', crate: 0, wood: true }]);
    expect(parseMap(withLetter('M'), false, { kneader: true }).flat()).toContainEqual({ kind: 'station', station: 'kneader', crate: 0 });
    expect(parseMap(withLetter('Z'), false, { gate: true }).flat()).toContainEqual({ kind: 'floor', spawn: false, mech: 'Z' });
  });
});
