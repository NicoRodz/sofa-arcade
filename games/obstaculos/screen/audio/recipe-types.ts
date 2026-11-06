// Types and constants of the sound recipes: sources, voices, cues, surfaces (moved out of recipes.ts).
import type { Biome } from '../../index';

export type Src = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'fm' | 'pluck';
export interface Voice {
  src: Src;
  at: number; // start offset (s)
  dur: number; // s
  gain: number; // envelope peak
  f0?: number; // start frequency (carrier for fm, pitch for pluck)
  f1?: number; // end frequency (exponential ramp)
  glide?: number; // seconds the f0 -> f1 ramp takes (default: dur)
  att?: number; // attack (s), default 5 ms
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; f0: number; f1?: number; q?: number };
  vib?: { rate: number; depth: number }; // Hz, Hz
  fm?: { ratio: number; i0: number; i1: number; t: number }; // modulator = f0 * ratio; index i0 -> i1 over t seconds
  ks?: number; // Karplus-Strong feedback per period (pluck)
  detune?: number; // cents
}

export type RecipeId =
  | 'jump'
  | 'boing'
  | 'land'
  | 'ropeTaut'
  | 'ropeStrain'
  | 'grabRing'
  | 'grabPlayer'
  | 'grabBox'
  | 'grabLever'
  | 'release'
  | 'throw'
  | 'handCatch'
  | 'death'
  | 'bubble'
  | 'respawn'
  | 'checkpoint'
  | 'star'
  | 'plate'
  | 'gate'
  | 'goalEnter'
  | 'fanfare'
  | 'runWin'
  | 'runFail'
  | 'balance'
  | 'target'
  | 'enemy'
  | 'ice'
  | 'wind'
  | 'pickaxe' // campaign A5: one per dynamic
  | 'lantern'
  | 'bungee'
  | 'sinker'
  | 'geyser'; // campaign A6: one per dynamic (12 has two: the rock and the vent)
export type Surface = 'sand' | 'wood' | 'metal' | 'ice' | 'stone' | 'thud';
export interface Params {
  freq?: number;
  level?: number;
  surface?: Surface;
  variant?: string;
  tension?: number;
  notes?: number[];
}
export interface Cue {
  recipe: RecipeId;
  key: string; // identity for the duplicate window ("jump:3", "rope:0:1")
  priority: 0 | 1 | 2 | 3; // higher survives a crowded mix
  duck?: boolean; // dip the music under it
  p: Params;
}
export type Cues = (Cue | null)[];

export const SURFACE: Record<Surface, { f: number; q: number }> = {
  sand: { f: 900, q: 1 },
  wood: { f: 400, q: 2 },
  metal: { f: 2400, q: 8 },
  ice: { f: 3200, q: 3 },
  stone: { f: 600, q: 2 },
  thud: { f: 160, q: 1 },
};
export const BIOME_SURFACE: Record<Biome, Surface> = { beach: 'sand', forest: 'wood', mine: 'metal', glacier: 'ice', volcano: 'stone' };
export const LAND_MIN_IMPACT = 120; // px/s: gentler touchdowns are silent
