// First half of the SFX table (kitchen, order, UI and match-flow sounds). recipes.ts merges it with sfx-events.ts, in this order.
import { noise, osc, type Sfx } from './recipe-kit';

export const SFX_CORE = {
  pickup: { bus: 'sfx', pitchVar: 0.08, voices: [osc('triangle', 600, 0.04, 0.3, { f1: 900 })] },
  drop: { bus: 'sfx', pitchVar: 0.08, voices: [osc('triangle', 400, 0.06, 0.3, { f1: 200 })] },
  buzz: { bus: 'sfx', voices: [osc('square', 150, 0.06, 0.12)] },
  cut: {
    bus: 'sfx',
    pitchVar: 0.08,
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
      osc('sine', 2093, 1.2, 0.3),
      osc('sine', 2093 * 2.76, 1.2, 0.15),
      osc('sine', 2093 * 5.4, 1.2, 0.08),
      ...[1047, 1319, 1568].map((f, i) => osc('square', f, 0.06, 0.15, { at: i * 0.06 })),
    ],
  },
  splash: {
    bus: 'sfx',
    pitchVar: 0.1,
    voices: [noise(0.09, 0.35, { type: 'bandpass', f0: 1400, f1: 700, q: 0.8 }), osc('sine', 500, 0.05, 0.12, { f1: 900 })],
  },
  plink: { bus: 'sfx', pitchVar: 0.05, voices: [osc('sine', 1760, 0.18, 0.28), osc('sine', 1760 * 2.4, 0.12, 0.1)] },
  clink: {
    bus: 'sfx',
    pitchVar: 0.08,
    voices: [osc('triangle', 1250, 0.05, 0.3, { f1: 900 }), osc('triangle', 1650, 0.05, 0.2, { at: 0.05, f1: 1100 })],
  },
  orderNew: { bus: 'sfx', voices: [osc('triangle', 660, 0.08, 0.35), osc('triangle', 880, 0.08, 0.35, { at: 0.08 })] },
  count: { bus: 'ui', voices: [osc('square', 440, 0.15, 0.3)] },
  go: { bus: 'ui', voices: [osc('square', 880, 0.4, 0.3)] },
  tickEnd: { bus: 'ui', voices: [osc('square', 1000, 0.02, 0.15, { att: 0.002 })] },
  whistle: { bus: 'ui', voices: [osc('sine', 1800, 0.7, 0.5, { vib: { rate: 30, depth: 80 } })] },
  // menu navigation: soft blips in the same square/sine/triangle family as the countdown and the join chime
  navMove: { bus: 'ui', pitchVar: 0.03, voices: [osc('triangle', 660, 0.05, 0.22, { f1: 740 })] },
  navPick: {
    bus: 'ui',
    voices: [osc('sine', 659, 0.1, 0.35), osc('sine', 988, 0.18, 0.35, { at: 0.07 }), osc('square', 1318, 0.05, 0.08, { at: 0.07 })],
  },
  navBack: { bus: 'ui', voices: [osc('triangle', 784, 0.07, 0.3, { f1: 700 }), osc('triangle', 523, 0.12, 0.3, { at: 0.06, f1: 440 })] },
  join: { bus: 'ui', voices: [osc('sine', 523, 0.15, 0.4, { f1: 784 })] },
  // versus (F4). The golden order: a rising shimmer when it shows up, a bright arpeggio for the team that wins it, a dull slide (a beat later) for the other.
  vipNew: {
    bus: 'sfx',
    voices: [...[784, 988, 1319].map((f, i) => osc('triangle', f, 0.14, 0.3, { at: i * 0.09 })), osc('sine', 2637, 0.5, 0.12, { at: 0.2 })],
  },
  vipWon: {
    bus: 'sfx',
    voices: [
      ...[523, 659, 784, 1047].map((f, i) => osc('square', f, 0.09, 0.2, { at: i * 0.07 })),
      ...[1047, 1319, 1568].map((f) => osc('sine', f, 0.9, 0.2, { at: 0.28 })),
    ],
  },
  vipLost: { bus: 'sfx', voices: [osc('sawtooth', 392, 0.35, 0.22, { at: 0.3, f1: 196, filter: { type: 'lowpass', f0: 900 } })] },
  // the handicap of a team went up (a chef of its kitchen dropped): two notes climbing
  advantage: {
    bus: 'sfx',
    voices: [osc('sine', 523, 0.12, 0.3), osc('sine', 784, 0.25, 0.3, { at: 0.1 }), osc('triangle', 1047, 0.25, 0.12, { at: 0.1 })],
  },
  // the team that was behind took the lead: a sweep up and a stab
  comeback: {
    bus: 'sfx',
    voices: [
      noise(0.3, 0.3, { type: 'bandpass', f0: 300, f1: 3000, q: 1 }, { att: 0.1 }),
      ...[659, 880, 1319].map((f) => osc('square', f, 0.2, 0.14, { at: 0.28 })),
    ],
  },
  playerDropped: { bus: 'sfx', voices: [osc('triangle', 440, 0.28, 0.3, { f1: 220 })] },
  playerBack: { bus: 'sfx', voices: [osc('triangle', 330, 0.12, 0.3), osc('triangle', 660, 0.2, 0.3, { at: 0.1 })] },
  playerGone: { bus: 'sfx', voices: [osc('sawtooth', 300, 0.5, 0.25, { f1: 100, filter: { type: 'lowpass', f0: 700 } })] },
  paused: { bus: 'ui', voices: [osc('square', 220, 0.14, 0.2), osc('square', 196, 0.2, 0.2, { at: 0.18 })] },
  resumed: { bus: 'ui', voices: [osc('square', 196, 0.12, 0.2), osc('square', 294, 0.2, 0.2, { at: 0.12 })] },
  // after the whistle (0.7 s) and the "TIEMPO" beat: a fanfare for the winner, a plain two-note close when nobody won
  fanfare: {
    bus: 'ui',
    voices: [
      ...[523, 523, 523, 698, 659, 698, 784].map((f, i) =>
        osc('square', f, i === 6 ? 0.7 : i === 3 ? 0.22 : 0.1, 0.2, { at: 1.15 + [0, 0.12, 0.24, 0.36, 0.62, 0.74, 0.86][i]! }),
      ),
      ...[392, 523, 659].map((f) => osc('sine', f, 0.8, 0.18, { at: 2.0 })),
    ],
  },
  tieJingle: {
    bus: 'ui',
    voices: [
      osc('triangle', 523, 0.2, 0.3, { at: 1.15 }),
      osc('triangle', 523, 0.5, 0.3, { at: 1.4 }),
      osc('sine', 392, 0.6, 0.15, { at: 1.4 }),
    ],
  },
  // sabotage (all synthesised, like the rest). A bag is ready: a crinkle and a blip. The throw: "fiuu", a whoosh that climbs. The impact: "plaf", wet and low.
  // A bag that bursts on the barrier: "plof". A slip: a falling whistle and a boing. The laugh of the other side: four "ha" that sag, a beat after the slip. Cleaning: "chas".
  bagReady: {
    bus: 'sfx',
    voices: [
      noise(0.12, 0.3, { type: 'bandpass', f0: 3200, f1: 1800, q: 0.7 }),
      osc('triangle', 523, 0.1, 0.22, { at: 0.06 }),
      osc('triangle', 784, 0.16, 0.22, { at: 0.14 }),
    ],
  },
  aimTick: { bus: 'sfx', voices: [osc('triangle', 1180, 0.025, 0.09, { att: 0.002 })] },
  launch: {
    bus: 'sfx',
    pitchVar: 0.04,
    voices: [
      noise(0.34, 0.34, { type: 'bandpass', f0: 500, f1: 3400, q: 1.1 }, { att: 0.05 }),
      osc('sine', 320, 0.3, 0.22, { f1: 1250 }),
      osc('triangle', 180, 0.08, 0.3, { f1: 90 }),
    ],
  },
  land: {
    bus: 'sfx',
    pitchVar: 0.06,
    voices: [
      noise(0.1, 0.5, { type: 'bandpass', f0: 1000, f1: 260, q: 0.8 }),
      osc('sine', 170, 0.16, 0.5, { f1: 62 }),
      noise(0.05, 0.22, { type: 'highpass', f0: 2600 }, { at: 0.03 }),
    ],
  },
  burst: { bus: 'sfx', voices: [noise(0.14, 0.4, { type: 'lowpass', f0: 900, f1: 200 }), osc('sine', 230, 0.12, 0.35, { f1: 70 })] },
  caught: {
    bus: 'sfx',
    voices: [
      osc('triangle', 600, 0.05, 0.3, { f1: 900 }),
      osc('triangle', 988, 0.1, 0.28, { at: 0.06 }),
      osc('sine', 1480, 0.28, 0.2, { at: 0.12 }),
    ],
  },
  slip: {
    bus: 'sfx',
    voices: [
      osc('triangle', 1000, 0.45, 0.28, { f1: 160, vib: { rate: 9, depth: 25 } }),
      osc('sine', 130, 0.14, 0.4, { at: 0.42, f1: 330 }),
      noise(0.05, 0.25, { type: 'lowpass', f0: 500 }, { at: 0.42 }),
    ],
  },
  laugh: {
    bus: 'sfx',
    voices: [0, 1, 2, 3].map((i) =>
      osc('square', 520 - i * 38, 0.08, 0.13, {
        at: 0.3 + i * 0.12,
        f1: 430 - i * 38,
        filter: { type: 'bandpass', f0: 900, q: 1.6 },
        vib: { rate: 14, depth: 14 },
      }),
    ),
  },
  clean: {
    bus: 'sfx',
    pitchVar: 0.05,
    voices: [
      noise(0.05, 0.4, { type: 'bandpass', f0: 2200, q: 1.2 }),
      osc('sine', 150, 0.1, 0.4, { f1: 66, at: 0.02 }),
      osc('triangle', 780, 0.04, 0.18, { at: 0.03, f1: 420 }),
    ],
  },
  rustle: {
    bus: 'sfx',
    pitchVar: 0.1,
    voices: [
      noise(0.09, 0.28, { type: 'highpass', f0: 2400 }, { att: 0.01 }),
      noise(0.06, 0.2, { type: 'bandpass', f0: 3600, q: 0.8 }, { at: 0.05 }),
    ],
  },
  fizz: { bus: 'sfx', voices: [noise(0.18, 0.12, { type: 'highpass', f0: 3800 }, { att: 0.06 })] },
} as const satisfies Record<string, Sfx>;
