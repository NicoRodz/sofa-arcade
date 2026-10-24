import { describe, expect, it } from 'vitest';
import { BIOMES } from '@party/shared/obstaculos';
import { SCALES, SLOT_DEGREES, degreeMidi, midiFreq, slotFreq } from './scales';

describe('scales', () => {
  it('slots 0..7 are degrees 1 2 3 5 6 8 9 10', () => expect([...SLOT_DEGREES]).toEqual([1, 2, 3, 5, 6, 8, 9, 10]));
  it('degree 8 is the octave of the root and degree 10 the third above it', () => {
    for (const b of BIOMES) {
      expect(degreeMidi(b, 8)).toBe(SCALES[b].rootMidi + 12);
      expect(degreeMidi(b, 10)).toBe(SCALES[b].rootMidi + 12 + SCALES[b].semis[2]!);
    }
  });
  it('the 8 players of a biome have 8 distinct ascending pitches', () => {
    for (const b of BIOMES) {
      const f = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => slotFreq(b, s));
      expect(new Set(f).size).toBe(8);
      expect(f).toEqual([...f].sort((a, c) => a - c));
    }
  });
  it('A4 is 440 Hz and the slot wraps modulo 8', () => {
    expect(midiFreq(69)).toBeCloseTo(440);
    expect(slotFreq('beach', 9)).toBe(slotFreq('beach', 1));
  });
  it('biome scales have the specified shape (G mixolydian has the flat seventh, E phrygian the flat second)', () => {
    expect(SCALES.beach.semis[6]).toBe(10);
    expect(SCALES.mine.semis[1]).toBe(1);
    expect(SCALES.glacier.semis[3]).toBe(6);
    expect(SCALES.volcano.semis[6]).toBe(11);
  });
});
