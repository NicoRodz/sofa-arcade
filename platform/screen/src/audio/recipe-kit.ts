// The shapes of a sound (Voice, Sfx) and the two builders the recipes use. Pure data, no Web Audio.
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type BusName = 'sfx' | 'ui';

export interface Voice {
  src: Wave | 'noise';
  at: number; // start offset (s)
  dur: number; // s
  gain: number; // envelope peak
  f0?: number; // oscillator start frequency
  f1?: number; // oscillator end frequency (exponential ramp)
  att?: number; // attack (s), default 5 ms
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; f0: number; f1?: number; q?: number };
  vib?: { rate: number; depth: number }; // Hz, Hz
}
export interface Sfx {
  bus: BusName;
  voices: Voice[];
  pitchVar?: number;
}

export const osc = (src: Wave, f0: number, dur: number, gain: number, extra: Partial<Voice> = {}): Voice => ({
  src,
  at: 0,
  dur,
  gain,
  f0,
  ...extra,
});
export const noise = (dur: number, gain: number, filter: NonNullable<Voice['filter']>, extra: Partial<Voice> = {}): Voice => ({
  src: 'noise',
  at: 0,
  dur,
  gain,
  filter,
  ...extra,
});
