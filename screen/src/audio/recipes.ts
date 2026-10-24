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
  whoosh: { bus: 'sfx', pitchVar: 0.06, voices: [noise(0.16, 0.3, { type: 'bandpass', f0: 500, f1: 2400, q: 0.9 }, { att: 0.06 })] },
  thud: { bus: 'sfx', pitchVar: 0.08, voices: [osc('sine', 150, 0.12, 0.45, { f1: 60 }), noise(0.04, 0.2, { type: 'lowpass', f0: 600 })] },
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
  splash: { bus: 'sfx', pitchVar: 0.1, voices: [noise(0.09, 0.35, { type: 'bandpass', f0: 1400, f1: 700, q: 0.8 }), osc('sine', 500, 0.05, 0.12, { f1: 900 })] },
  plink: { bus: 'sfx', pitchVar: 0.05, voices: [osc('sine', 1760, 0.18, 0.28), osc('sine', 1760 * 2.4, 0.12, 0.1)] },
  clink: { bus: 'sfx', pitchVar: 0.08, voices: [osc('triangle', 1250, 0.05, 0.3, { f1: 900 }), osc('triangle', 1650, 0.05, 0.2, { at: 0.05, f1: 1100 })] },
  orderNew: { bus: 'sfx', voices: [osc('triangle', 660, 0.08, 0.35), osc('triangle', 880, 0.08, 0.35, { at: 0.08 })] },
  count: { bus: 'ui', voices: [osc('square', 440, 0.15, 0.3)] },
  go: { bus: 'ui', voices: [osc('square', 880, 0.4, 0.3)] },
  tickEnd: { bus: 'ui', voices: [osc('square', 1000, 0.02, 0.15, { att: 0.002 })] },
  whistle: { bus: 'ui', voices: [osc('sine', 1800, 0.7, 0.5, { vib: { rate: 30, depth: 80 } })] },
  // menu navigation: soft blips in the same square/sine/triangle family as the countdown and the join chime
  navMove: { bus: 'ui', pitchVar: 0.03, voices: [osc('triangle', 660, 0.05, 0.22, { f1: 740 })] },
  navPick: { bus: 'ui', voices: [osc('sine', 659, 0.1, 0.35), osc('sine', 988, 0.18, 0.35, { at: 0.07 }), osc('square', 1318, 0.05, 0.08, { at: 0.07 })] },
  navBack: { bus: 'ui', voices: [osc('triangle', 784, 0.07, 0.3, { f1: 700 }), osc('triangle', 523, 0.12, 0.3, { at: 0.06, f1: 440 })] },
  join: { bus: 'ui', voices: [osc('sine', 523, 0.15, 0.4, { f1: 784 })] },
  // versus (F4). The golden order: a rising shimmer when it shows up, a bright arpeggio for the team that wins it, a dull slide (a beat later) for the other.
  vipNew: { bus: 'sfx', voices: [...[784, 988, 1319].map((f, i) => osc('triangle', f, 0.14, 0.3, { at: i * 0.09 })), osc('sine', 2637, 0.5, 0.12, { at: 0.2 })] },
  vipWon: { bus: 'sfx', voices: [...[523, 659, 784, 1047].map((f, i) => osc('square', f, 0.09, 0.2, { at: i * 0.07 })), ...[1047, 1319, 1568].map((f) => osc('sine', f, 0.9, 0.2, { at: 0.28 }))] },
  vipLost: { bus: 'sfx', voices: [osc('sawtooth', 392, 0.35, 0.22, { at: 0.3, f1: 196, filter: { type: 'lowpass', f0: 900 } })] },
  // the handicap of a team went up (a chef of its kitchen dropped): two notes climbing
  advantage: { bus: 'sfx', voices: [osc('sine', 523, 0.12, 0.3), osc('sine', 784, 0.25, 0.3, { at: 0.1 }), osc('triangle', 1047, 0.25, 0.12, { at: 0.1 })] },
  // the team that was behind took the lead: a sweep up and a stab
  comeback: { bus: 'sfx', voices: [noise(0.3, 0.3, { type: 'bandpass', f0: 300, f1: 3000, q: 1 }, { att: 0.1 }), ...[659, 880, 1319].map((f) => osc('square', f, 0.2, 0.14, { at: 0.28 }))] },
  playerDropped: { bus: 'sfx', voices: [osc('triangle', 440, 0.28, 0.3, { f1: 220 })] },
  playerBack: { bus: 'sfx', voices: [osc('triangle', 330, 0.12, 0.3), osc('triangle', 660, 0.2, 0.3, { at: 0.1 })] },
  playerGone: { bus: 'sfx', voices: [osc('sawtooth', 300, 0.5, 0.25, { f1: 100, filter: { type: 'lowpass', f0: 700 } })] },
  paused: { bus: 'ui', voices: [osc('square', 220, 0.14, 0.2), osc('square', 196, 0.2, 0.2, { at: 0.18 })] },
  resumed: { bus: 'ui', voices: [osc('square', 196, 0.12, 0.2), osc('square', 294, 0.2, 0.2, { at: 0.12 })] },
  // after the whistle (0.7 s) and the "TIEMPO" beat: a fanfare for the winner, a plain two-note close when nobody won
  fanfare: {
    bus: 'ui',
    voices: [
      ...[523, 523, 523, 698, 659, 698, 784].map((f, i) => osc('square', f, i === 6 ? 0.7 : i === 3 ? 0.22 : 0.1, 0.2, { at: 1.15 + [0, 0.12, 0.24, 0.36, 0.62, 0.74, 0.86][i]! })),
      ...[392, 523, 659].map((f) => osc('sine', f, 0.8, 0.18, { at: 2.0 })),
    ],
  },
  tieJingle: { bus: 'ui', voices: [osc('triangle', 523, 0.2, 0.3, { at: 1.15 }), osc('triangle', 523, 0.5, 0.3, { at: 1.4 }), osc('sine', 392, 0.6, 0.15, { at: 1.4 })] },
  // sabotage (all synthesised, like the rest). A bag is ready: a crinkle and a blip. The throw: "fiuu", a whoosh that climbs. The impact: "plaf", wet and low.
  // A bag that bursts on the barrier: "plof". A slip: a falling whistle and a boing. The laugh of the other side: four "ha" that sag, a beat after the slip. Cleaning: "chas".
  bagReady: { bus: 'sfx', voices: [noise(0.12, 0.3, { type: 'bandpass', f0: 3200, f1: 1800, q: 0.7 }), osc('triangle', 523, 0.1, 0.22, { at: 0.06 }), osc('triangle', 784, 0.16, 0.22, { at: 0.14 })] },
  aimTick: { bus: 'sfx', voices: [osc('triangle', 1180, 0.025, 0.09, { att: 0.002 })] },
  launch: { bus: 'sfx', pitchVar: 0.04, voices: [noise(0.34, 0.34, { type: 'bandpass', f0: 500, f1: 3400, q: 1.1 }, { att: 0.05 }), osc('sine', 320, 0.3, 0.22, { f1: 1250 }), osc('triangle', 180, 0.08, 0.3, { f1: 90 })] },
  land: { bus: 'sfx', pitchVar: 0.06, voices: [noise(0.1, 0.5, { type: 'bandpass', f0: 1000, f1: 260, q: 0.8 }), osc('sine', 170, 0.16, 0.5, { f1: 62 }), noise(0.05, 0.22, { type: 'highpass', f0: 2600 }, { at: 0.03 })] },
  burst: { bus: 'sfx', voices: [noise(0.14, 0.4, { type: 'lowpass', f0: 900, f1: 200 }), osc('sine', 230, 0.12, 0.35, { f1: 70 })] },
  caught: { bus: 'sfx', voices: [osc('triangle', 600, 0.05, 0.3, { f1: 900 }), osc('triangle', 988, 0.1, 0.28, { at: 0.06 }), osc('sine', 1480, 0.28, 0.2, { at: 0.12 })] },
  slip: { bus: 'sfx', voices: [osc('triangle', 1000, 0.45, 0.28, { f1: 160, vib: { rate: 9, depth: 25 } }), osc('sine', 130, 0.14, 0.4, { at: 0.42, f1: 330 }), noise(0.05, 0.25, { type: 'lowpass', f0: 500 }, { at: 0.42 })] },
  laugh: { bus: 'sfx', voices: [0, 1, 2, 3].map((i) => osc('square', 520 - i * 38, 0.08, 0.13, { at: 0.3 + i * 0.12, f1: 430 - i * 38, filter: { type: 'bandpass', f0: 900, q: 1.6 }, vib: { rate: 14, depth: 14 } })) },
  clean: { bus: 'sfx', pitchVar: 0.05, voices: [noise(0.05, 0.4, { type: 'bandpass', f0: 2200, q: 1.2 }), osc('sine', 150, 0.1, 0.4, { f1: 66, at: 0.02 }), osc('triangle', 780, 0.04, 0.18, { at: 0.03, f1: 420 })] },
  rustle: { bus: 'sfx', pitchVar: 0.1, voices: [noise(0.09, 0.28, { type: 'highpass', f0: 2400 }, { att: 0.01 }), noise(0.06, 0.2, { type: 'bandpass', f0: 3600, q: 0.8 }, { at: 0.05 })] },
  fizz: { bus: 'sfx', voices: [noise(0.18, 0.12, { type: 'highpass', f0: 3800 }, { att: 0.06 })] },
  // the oven that burns (burn.ts). The warning: two alternating tones twice, an alarm that is not the order warning's three flat beeps. Burnt: a sizzle and a sagging buzz.
  // Fire: a whoosh that swells with a low boom under it; it jumping: a shorter whoosh and a thud. The fire going out: a long hiss and two relieved notes. Rescued: two bright dings.
  ovenWarn: { bus: 'sfx', voices: [0, 0.24].flatMap((o) => [osc('square', 1175, 0.09, 0.2, { at: o, att: 0.003 }), osc('square', 1568, 0.09, 0.2, { at: o + 0.11, att: 0.003 })]) },
  burnt: { bus: 'sfx', voices: [noise(0.5, 0.34, { type: 'bandpass', f0: 3200, f1: 1300, q: 0.7 }, { att: 0.02 }), osc('sawtooth', 260, 0.4, 0.2, { f1: 80, filter: { type: 'lowpass', f0: 900 } })] },
  fireStart: { bus: 'sfx', voices: [noise(0.62, 0.5, { type: 'lowpass', f0: 300, f1: 2600 }, { att: 0.18 }), osc('sine', 95, 0.55, 0.42, { f1: 48 }), noise(0.3, 0.16, { type: 'highpass', f0: 3000 }, { at: 0.2 })] },
  fireSpread: { bus: 'sfx', pitchVar: 0.06, voices: [noise(0.3, 0.36, { type: 'bandpass', f0: 500, f1: 2600, q: 0.9 }, { att: 0.08 }), osc('sine', 130, 0.2, 0.32, { f1: 60, at: 0.12 })] },
  fireOut: { bus: 'sfx', voices: [noise(0.8, 0.3, { type: 'highpass', f0: 3500, f1: 1800 }, { att: 0.05 }), osc('sine', 1318, 0.4, 0.2, { at: 0.3 }), osc('sine', 1760, 0.5, 0.2, { at: 0.42 })] },
  rescued: { bus: 'sfx', voices: [osc('sine', 1568, 0.12, 0.28), osc('sine', 2093, 0.32, 0.28, { at: 0.1 }), osc('triangle', 2637, 0.2, 0.1, { at: 0.1 })] },
  blaze: { bus: 'sfx', pitchVar: 0.12, voices: [noise(0.09, 0.2, { type: 'lowpass', f0: 800 }, { att: 0.01 }), noise(0.02, 0.1, { type: 'highpass', f0: 3200 }, { at: 0.03, att: 0.002 })] },
  hiss: { bus: 'sfx', voices: [noise(0.2, 0.2, { type: 'highpass', f0: 4200 }, { att: 0.04 })] },
  // mid-round events (midround.ts). The announcement: a siren that warbles twice, so it is heard over the kitchen. Each event then has its own sting: the rush is a cluster of
  // bells, the inspector two whistles, the blackout a power-down (and a power-up when the lights come back), the birthday a six-note jingle; the inspector's verdict is a
  // coin arpeggio or a sad slide. The rat squeaks (two quick ones when it shows up, one when it grabs, a fast falling one when it is scared off).
  siren: { bus: 'ui', voices: [0, 0.34].flatMap((o) => [osc('sawtooth', 620, 0.16, 0.2, { at: o, f1: 940, filter: { type: 'lowpass', f0: 2400 } }), osc('sawtooth', 940, 0.16, 0.2, { at: o + 0.17, f1: 620, filter: { type: 'lowpass', f0: 2400 } })]) },
  rushStart: { bus: 'sfx', voices: [0, 0.08, 0.16, 0.26].map((at, i) => osc('sine', 1568 * (i % 2 ? 1.26 : 1), 0.4, 0.26, { at })).concat([noise(0.2, 0.14, { type: 'highpass', f0: 3000 }, { at: 0.02 })]) },
  inspectorStart: { bus: 'sfx', voices: [osc('sine', 2000, 0.12, 0.3, { vib: { rate: 28, depth: 90 } }), osc('sine', 2000, 0.3, 0.3, { at: 0.18, vib: { rate: 28, depth: 90 } })] },
  inspectorPass: { bus: 'sfx', voices: [...[1047, 1319, 1568, 2093].map((f, i) => osc('triangle', f, 0.12, 0.22, { at: i * 0.08 })), osc('sine', 2093, 0.6, 0.18, { at: 0.32 })] },
  inspectorFail: { bus: 'sfx', voices: [osc('sawtooth', 392, 0.3, 0.22, { f1: 370, filter: { type: 'lowpass', f0: 1200 } }), osc('sawtooth', 330, 0.3, 0.22, { at: 0.3, f1: 310, filter: { type: 'lowpass', f0: 1200 } }), osc('sawtooth', 262, 0.6, 0.22, { at: 0.6, f1: 150, filter: { type: 'lowpass', f0: 1200 }, vib: { rate: 6, depth: 10 } })] },
  blackoutStart: { bus: 'sfx', voices: [osc('sawtooth', 260, 0.7, 0.26, { f1: 38, filter: { type: 'lowpass', f0: 1400, f1: 120 } }), noise(0.12, 0.3, { type: 'lowpass', f0: 500 }, { at: 0.55 }), osc('sine', 90, 0.2, 0.4, { at: 0.55, f1: 40 })] },
  blackoutEnd: { bus: 'sfx', voices: [osc('square', 60, 0.45, 0.2, { f1: 420, filter: { type: 'lowpass', f0: 600, f1: 3000 } }), osc('triangle', 880, 0.08, 0.25, { at: 0.42 }), osc('triangle', 1320, 0.14, 0.25, { at: 0.5 }), noise(0.04, 0.2, { type: 'highpass', f0: 3000 }, { at: 0.4 })] },
  birthday: { bus: 'sfx', voices: [[523, 0], [523, 0.16], [587, 0.32], [523, 0.52], [698, 0.72], [659, 0.96]].map(([f, at], i) => osc('triangle', f!, i === 5 ? 0.5 : 0.17, 0.26, { at: at! })).concat([osc('sine', 1318, 0.7, 0.1, { at: 0.96 })]) },
  ratAppear: { bus: 'sfx', voices: [osc('sine', 2300, 0.07, 0.2, { f1: 3100 }), osc('sine', 2500, 0.08, 0.2, { at: 0.11, f1: 3400 })] },
  ratSteal: { bus: 'sfx', pitchVar: 0.05, voices: [noise(0.04, 0.3, { type: 'bandpass', f0: 1800, q: 1.4 }), osc('sine', 2600, 0.09, 0.22, { at: 0.05, f1: 3300 })] },
  ratScared: { bus: 'sfx', voices: [osc('sine', 3400, 0.22, 0.26, { f1: 1200, vib: { rate: 24, depth: 120 } }), noise(0.1, 0.18, { type: 'bandpass', f0: 1800, f1: 5000, q: 0.8 }, { att: 0.03 })] },
  // the calzone (recipes/sim.ts). Folding: soft low thumps of dough being worked, in a loop while Picar is held. Folded: a muffled whump and two rising notes.
  knead: { bus: 'sfx', pitchVar: 0.1, voices: [osc('sine', 140, 0.09, 0.38, { f1: 70 }), noise(0.07, 0.14, { type: 'lowpass', f0: 700 }, { att: 0.01 })] },
  folded: { bus: 'sfx', voices: [noise(0.14, 0.3, { type: 'lowpass', f0: 1200, f1: 300 }, { att: 0.02 }), osc('triangle', 392, 0.12, 0.26, { at: 0.1 }), osc('triangle', 587, 0.2, 0.26, { at: 0.18 })] },
} as const satisfies Record<string, Sfx>;
export type SfxId = keyof typeof SFX;

export const sfxDuration = (id: SfxId): number => Math.max(...SFX[id].voices.map((v) => v.at + v.dur));

// Sounds that repeat while something is going on (chopping, a pot cooking).
export interface LoopDef { sfx: SfxId; every: (rand: number) => number; max: number }
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

const play = (id: SfxId): Action => ({ kind: 'play', id });
const chopKey = (p: { station: number }) => `chop:${p.station}`;
const washKey = (p: { station: number }) => `wash:${p.station}`;
const ovenKey = (p: { station: number }) => `oven:${p.station}`;
const fireKey = (p: { station: number }) => `fire:${p.station}`;
const douseKey = (p: { station: number }) => `douse:${p.station}`;
const foldKey = (p: { station: number }) => `fold:${p.station}`;

// One entry per game event; the mapped type makes a missing event a compile error.
export const ACTIONS: { [K in keyof GameEvents]: (p: GameEvents[K]) => Action[] } = {
  itemPicked: () => [play('pickup')],
  itemDropped: () => [play('drop')],
  interactInvalid: () => [play('buzz')],
  dash: () => [play('whoosh')],
  bump: () => [play('thud')],
  chopStart: (p) => [{ kind: 'loopStart', key: chopKey(p), loop: 'chop' }],
  chopStop: (p) => [{ kind: 'loopStop', key: chopKey(p) }],
  chopDone: (p) => [{ kind: 'loopStop', key: chopKey(p) }, play('ding')],
  washStart: (p) => [{ kind: 'loopStart', key: washKey(p), loop: 'wash' }],
  washStop: (p) => [{ kind: 'loopStop', key: washKey(p) }],
  washDone: () => [play('plink')], // the scrubbing loop keeps going for the next plate while B is held
  dirtyNew: () => [play('clink')],
  potStart: (p) => [play('ovenOn'), { kind: 'loopStart', key: ovenKey(p), loop: 'oven' }],
  potReady: (p) => [{ kind: 'loopStop', key: ovenKey(p) }, play('ready')],
  orderNew: () => [play('orderNew')],
  orderWarning: () => [play('warn')],
  orderExpired: () => [play('expired')],
  // R7: the delivery chime climbs a whole tone per step of the tip multiplier (x1 plain, x4 six semitones up)
  delivered: (p) => [{ kind: 'play', id: 'deliver', semis: (p.mult - 1) * 2 }, { kind: 'duck' }],
  dishRejected: () => [play('expired')],
  streak: () => [],
  countdownTick: (p) => (p.kind === 'end' ? (p.n >= 1 && p.n <= 10 ? [play('tickEnd')] : []) : [play(p.n > 0 ? 'count' : 'go')]),
  roundStart: () => [], // the music follows the game snapshot; the "go" sound comes with countdown 0
  // versus: after the whistle, a fanfare when a team won and a plain close when it did not (a draw, or the host went on without a winner)
  roundEnd: (p) => [{ kind: 'stopLoops' }, play('whistle'), ...(p.winner === undefined ? [] : [play(p.winner === null ? 'tieJingle' : 'fanfare')])],
  // versus events
  vipNew: () => [play('vipNew')],
  vipWon: () => [play('vipWon'), { kind: 'duck' }],
  vipLost: () => [play('vipLost')],
  comeback: () => [play('comeback')],
  pantryRefill: () => [play('plink')], // a unit is back in the shared pantry
  teamK: (p) => (p.k > 1 ? [play('advantage')] : []), // only a handicap that grew is news; it going back to 1 is silent
  playerDropped: () => [play('playerDropped')],
  playerBack: () => [play('playerBack')],
  playerGone: () => [play('playerGone')],
  matchPaused: () => [play('paused')],
  matchResumed: () => [play('resumed')],
  // sabotage: a bag is ready, the reticle ticks, the throw, the impact (or the catch, or the burst), the slip and the laugh of the other side, the cleaning
  'sabotage:bagReady': () => [play('bagReady')],
  'sabotage:aim': () => [play('aimTick')],
  'sabotage:launch': () => [play('launch')],
  'sabotage:land': () => [play('land')],
  'sabotage:caught': () => [play('caught')],
  'sabotage:burst': () => [play('burst')],
  'sabotage:blocked': () => [play('buzz')],
  'chef:slip': () => [play('slip'), play('laugh')],
  'chef:recover': () => [],
  'trash:picked': () => [play('rustle')],
  'trash:binned': () => [play('clean')],
  'trash:decayed': () => [play('fizz')],
  // the oven that burns: the warning beep, the burnt pizza, the fire (with its crackle until it goes out), the extinguisher, the rescue
  'oven:warn': () => [play('ovenWarn')],
  'oven:burnt': () => [play('burnt')],
  'oven:rescued': () => [play('rescued')],
  'fire:start': (p) => [play('fireStart'), { kind: 'loopStart', key: fireKey(p), loop: 'blaze' }],
  'fire:spread': (p) => [play('fireSpread'), { kind: 'loopStart', key: fireKey(p), loop: 'blaze' }],
  'fire:out': (p) => [{ kind: 'loopStop', key: fireKey(p) }, { kind: 'loopStop', key: douseKey(p) }, play('fireOut')],
  'fire:end': () => [],
  douseStart: (p) => [{ kind: 'loopStart', key: douseKey(p), loop: 'douse' }],
  douseStop: (p) => [{ kind: 'loopStop', key: douseKey(p) }],
  // the calzone: thumps while the dough is folded, a whump when it is
  foldStart: (p) => [{ kind: 'loopStart', key: foldKey(p), loop: 'fold' }],
  foldStop: (p) => [{ kind: 'loopStop', key: foldKey(p) }],
  foldDone: (p) => [{ kind: 'loopStop', key: foldKey(p) }, play('folded')],
  // mid-round events: the siren when it is announced, a sting of its own when it starts, the power coming back, the inspector's verdict, the rat
  'event:announce': () => [play('siren')],
  'event:start': (p) => (p.kind === 'rush' ? [play('rushStart')] : p.kind === 'inspector' ? [play('inspectorStart')] : p.kind === 'blackout' ? [play('blackoutStart')] : p.kind === 'birthday' ? [play('birthday')] : []), // the rat has its own sound (rat:appear)
  'event:end': (p) => (p.kind === 'blackout' ? [play('blackoutEnd')] : []),
  'event:inspector': (p) => [play(p.passed ? 'inspectorPass' : 'inspectorFail')],
  'rat:appear': () => [play('ratAppear')],
  'rat:steal': () => [play('ratSteal')],
  'rat:scared': () => [play('ratScared')],
  'rat:gone': () => [],
};
