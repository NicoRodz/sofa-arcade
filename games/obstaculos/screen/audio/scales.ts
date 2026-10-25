// Pure pitch material of the game's biomes (plan §14): one scale per biome, one pentatonic-ish degree per player slot.
import type { Biome } from '../../index';

export interface ScaleDef {
  name: string;
  rootMidi: number;
  semis: readonly number[];
}
export const SCALES: Record<Biome, ScaleDef> = {
  beach: { name: 'G mixolydian', rootMidi: 55, semis: [0, 2, 4, 5, 7, 9, 10] },
  forest: { name: 'D dorian', rootMidi: 50, semis: [0, 2, 3, 5, 7, 9, 10] },
  mine: { name: 'E phrygian', rootMidi: 52, semis: [0, 1, 3, 5, 7, 8, 10] },
  glacier: { name: 'A lydian', rootMidi: 57, semis: [0, 2, 4, 6, 7, 9, 11] },
  volcano: { name: 'C harmonic minor', rootMidi: 48, semis: [0, 2, 3, 5, 7, 8, 11] },
};

/** Player slots 0..7 -> scale degrees 1, 2, 3, 5, 6, 8, 9, 10 (1-based, 8 = the octave). */
export const SLOT_DEGREES = [1, 2, 3, 5, 6, 8, 9, 10] as const;

export const midiFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** MIDI note of a 1-based scale degree; degrees above 7 wrap into the next octave, below 1 into the previous. */
export function degreeMidi(biome: Biome, degree: number): number {
  const s = SCALES[biome];
  const i = degree - 1;
  const oct = Math.floor(i / 7);
  return s.rootMidi + s.semis[((i % 7) + 7) % 7]! + 12 * oct;
}
export const degreeFreq = (biome: Biome, degree: number, octaves = 0): number => midiFreq(degreeMidi(biome, degree) + 12 * octaves);

/** Note of a player: slot wraps modulo 8, sounding one octave above the scale root. */
export function slotFreq(biome: Biome, slot: number): number {
  const s = ((Math.trunc(slot) % 8) + 8) % 8;
  return degreeFreq(biome, SLOT_DEGREES[s]!, 1);
}
