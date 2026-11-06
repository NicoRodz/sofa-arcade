// Pure data: what each sound is made of, and how a game maps its events to these sounds (Action). No Web Audio here.
import { SFX_CORE } from './sfx-core';
import { SFX_EVENTS } from './sfx-events';
import type { Sfx } from './recipe-kit';

export type { BusName, Sfx, Voice, Wave } from './recipe-kit';

export const SFX = { ...SFX_CORE, ...SFX_EVENTS } as const satisfies Record<string, Sfx>;
export type SfxId = keyof typeof SFX;

export const sfxDuration = (id: SfxId): number => Math.max(...SFX[id].voices.map((v) => v.at + v.dur));

// Sounds that repeat while something is going on (chopping, a pot cooking).
export interface LoopDef {
  sfx: SfxId;
  every: (rand: number) => number;
  max: number;
}
export const LOOPS = {
  chop: { sfx: 'cut', every: (_r: number) => 0.25, max: Infinity },
  wash: { sfx: 'splash', every: (_r: number) => 0.2, max: Infinity },
  oven: { sfx: 'crackle', every: (r: number) => 0.06 + r * 0.13, max: 3 }, // ~8 clicks/s, at most 3 pots audible
  blaze: { sfx: 'blaze', every: (r: number) => 0.1 + r * 0.12, max: 4 }, // a station on fire (burn.ts), until it is put out
  fold: { sfx: 'knead', every: (_r: number) => 0.24, max: Infinity }, // folding a calzone at the oven: thumps while Picar is held
  douse: { sfx: 'hiss', every: (_r: number) => 0.17, max: 3 }, // the extinguisher: foam hiss while Picar is held in front of a fire
} as const satisfies Record<string, LoopDef>;
export type LoopId = keyof typeof LOOPS;

export type Action =
  | { kind: 'play'; id: SfxId; semis?: number } // semis: pitch shift in semitones
  | { kind: 'loopStart'; key: string; loop: LoopId }
  | { kind: 'loopStop'; key: string }
  | { kind: 'stopLoops' }
  | { kind: 'duck' };
