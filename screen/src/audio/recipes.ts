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
} as const satisfies Record<string, Sfx>;
export type SfxId = keyof typeof SFX;

export const sfxDuration = (id: SfxId): number => Math.max(...SFX[id].voices.map((v) => v.at + v.dur));

// Sounds that repeat while something is going on (chopping, a pot cooking).
export interface LoopDef { sfx: SfxId; every: (rand: number) => number; max: number }
export const LOOPS = {
  chop: { sfx: 'cut', every: (_r: number) => 0.25, max: Infinity },
  wash: { sfx: 'splash', every: (_r: number) => 0.2, max: Infinity },
  oven: { sfx: 'crackle', every: (r: number) => 0.06 + r * 0.13, max: 3 }, // ~8 clicks/s, at most 3 pots audible
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
  // sabotage (S0 contract; the sounds come in S4)
  'sabotage:bagReady': () => [], 'sabotage:aim': () => [], 'sabotage:launch': () => [], 'sabotage:land': () => [], 'sabotage:caught': () => [], 'sabotage:burst': () => [],
  'sabotage:blocked': () => [], 'chef:slip': () => [], 'chef:recover': () => [], 'trash:picked': () => [], 'trash:binned': () => [], 'trash:decayed': () => [],
};
