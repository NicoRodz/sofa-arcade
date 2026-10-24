// Pure data: what each sound is made of, and which game event triggers which sound. No Web Audio here.
import type { GameEvents } from '@party/shared/events';

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
export interface Sfx { bus: BusName; voices: Voice[]; pitchVar?: number }

const osc = (src: Wave, f0: number, dur: number, gain: number, extra: Partial<Voice> = {}): Voice => ({ src, at: 0, dur, gain, f0, ...extra });
const noise = (dur: number, gain: number, filter: NonNullable<Voice['filter']>, extra: Partial<Voice> = {}): Voice => ({ src: 'noise', at: 0, dur, gain, filter, ...extra });

export const SFX = {
  pickup: { bus: 'sfx', pitchVar: 0.08, voices: [osc('triangle', 600, 0.04, 0.3, { f1: 900 })] },
  drop: { bus: 'sfx', pitchVar: 0.08, voices: [osc('triangle', 400, 0.06, 0.3, { f1: 200 })] },
  buzz: { bus: 'sfx', voices: [osc('square', 150, 0.06, 0.12)] },
  cut: {
    bus: 'sfx', pitchVar: 0.08,
    voices: [noise(0.06, 0.45, { type: 'bandpass', f0: 2500, q: 1 }), osc('triangle', 900, 0.03, 0.3, { f1: 300 })],
  },
  ding: { bus: 'sfx', voices: [osc('sine', 1318, 0.15, 0.35)] },
  ovenOn: { bus: 'sfx', voices: [noise(0.3, 0.5, { type: 'lowpass', f0: 400 }, { att: 0.15 })] },
  crackle: { bus: 'sfx', voices: [noise(0.01, 0.08, { type: 'highpass', f0: 3000 }, { att: 0.002 })] },
  ready: { bus: 'sfx', voices: [osc('sine', 1318, 0.8, 0.25), osc('sine', 1975, 0.8, 0.25)] },
  warn: { bus: 'sfx', voices: [0, 0.2, 0.36].map((at) => osc('square', 880, 0.1, 0.2, { at, att: 0.003 })) },
  expired: {
    bus: 'sfx',
    voices: [osc('sawtooth', 300, 0.4, 0.35, { f1: 150, filter: { type: 'lowpass', f0: 1200 } })],
  },
  deliver: {
    bus: 'sfx',
    voices: [
      osc('sine', 2093, 1.2, 0.3), osc('sine', 2093 * 2.76, 1.2, 0.15), osc('sine', 2093 * 5.4, 1.2, 0.08),
      ...[1047, 1319, 1568].map((f, i) => osc('square', f, 0.06, 0.15, { at: i * 0.06 })),
    ],
  },
  orderNew: { bus: 'sfx', voices: [osc('triangle', 660, 0.08, 0.35), osc('triangle', 880, 0.08, 0.35, { at: 0.08 })] },
  count: { bus: 'ui', voices: [osc('square', 440, 0.15, 0.3)] },
  go: { bus: 'ui', voices: [osc('square', 880, 0.4, 0.3)] },
  tickEnd: { bus: 'ui', voices: [osc('square', 1000, 0.02, 0.15, { att: 0.002 })] },
  whistle: { bus: 'ui', voices: [osc('sine', 1800, 0.7, 0.5, { vib: { rate: 30, depth: 80 } })] },
  join: { bus: 'ui', voices: [osc('sine', 523, 0.15, 0.4, { f1: 784 })] },
} as const satisfies Record<string, Sfx>;
export type SfxId = keyof typeof SFX;

export const sfxDuration = (id: SfxId): number => Math.max(...SFX[id].voices.map((v) => v.at + v.dur));

// Sounds that repeat while something is going on (chopping, a pot cooking).
export interface LoopDef { sfx: SfxId; every: (rand: number) => number; max: number }
export const LOOPS = {
  chop: { sfx: 'cut', every: (_r: number) => 0.25, max: Infinity },
  oven: { sfx: 'crackle', every: (r: number) => 0.06 + r * 0.13, max: 3 }, // ~8 clicks/s, at most 3 pots audible
} as const satisfies Record<string, LoopDef>;
export type LoopId = keyof typeof LOOPS;

export type Action =
  | { kind: 'play'; id: SfxId }
  | { kind: 'loopStart'; key: string; loop: LoopId }
  | { kind: 'loopStop'; key: string }
  | { kind: 'stopLoops' }
  | { kind: 'duck' };

const play = (id: SfxId): Action => ({ kind: 'play', id });
const chopKey = (p: { station: number }) => `chop:${p.station}`;
const ovenKey = (p: { station: number }) => `oven:${p.station}`;

// One entry per game event; the mapped type makes a missing event a compile error.
export const ACTIONS: { [K in keyof GameEvents]: (p: GameEvents[K]) => Action[] } = {
  itemPicked: () => [play('pickup')],
  itemDropped: () => [play('drop')],
  interactInvalid: () => [play('buzz')],
  chopStart: (p) => [{ kind: 'loopStart', key: chopKey(p), loop: 'chop' }],
  chopStop: (p) => [{ kind: 'loopStop', key: chopKey(p) }],
  chopDone: (p) => [{ kind: 'loopStop', key: chopKey(p) }, play('ding')],
  potStart: (p) => [play('ovenOn'), { kind: 'loopStart', key: ovenKey(p), loop: 'oven' }],
  potReady: (p) => [{ kind: 'loopStop', key: ovenKey(p) }, play('ready')],
  orderNew: () => [play('orderNew')],
  orderWarning: () => [play('warn')],
  orderExpired: () => [play('expired')],
  delivered: () => [play('deliver'), { kind: 'duck' }],
  countdownTick: (p) => (p.kind === 'end' ? (p.n >= 1 && p.n <= 10 ? [play('tickEnd')] : []) : [play(p.n > 0 ? 'count' : 'go')]),
  roundStart: () => [], // the music follows the game snapshot; the "go" sound comes with countdown 0
  roundEnd: () => [{ kind: 'stopLoops' }, play('whistle')],
};
