// Second half of the SFX table (fire, mid-round events, rats, calzone). recipes.ts merges it after sfx-ui-and-core.ts.
import { noise, osc, type Sfx } from './recipe-kit';

export const SFX_EVENTS = {
  // the oven that burns (burn.ts). The warning: two alternating tones twice, an alarm that is not the order warning's three flat beeps. Burnt: a sizzle and a sagging buzz.
  // Fire: a whoosh that swells with a low boom under it; it jumping: a shorter whoosh and a thud. The fire going out: a long hiss and two relieved notes. Rescued: two bright dings.
  ovenWarn: {
    bus: 'sfx',
    voices: [0, 0.24].flatMap((o) => [
      osc('square', 1175, 0.09, 0.2, { at: o, att: 0.003 }),
      osc('square', 1568, 0.09, 0.2, { at: o + 0.11, att: 0.003 }),
    ]),
  },
  burnt: {
    bus: 'sfx',
    voices: [
      noise(0.5, 0.34, { type: 'bandpass', f0: 3200, f1: 1300, q: 0.7 }, { att: 0.02 }),
      osc('sawtooth', 260, 0.4, 0.2, { f1: 80, filter: { type: 'lowpass', f0: 900 } }),
    ],
  },
  fireStart: {
    bus: 'sfx',
    voices: [
      noise(0.62, 0.5, { type: 'lowpass', f0: 300, f1: 2600 }, { att: 0.18 }),
      osc('sine', 95, 0.55, 0.42, { f1: 48 }),
      noise(0.3, 0.16, { type: 'highpass', f0: 3000 }, { at: 0.2 }),
    ],
  },
  fireSpread: {
    bus: 'sfx',
    pitchVar: 0.06,
    voices: [
      noise(0.3, 0.36, { type: 'bandpass', f0: 500, f1: 2600, q: 0.9 }, { att: 0.08 }),
      osc('sine', 130, 0.2, 0.32, { f1: 60, at: 0.12 }),
    ],
  },
  fireOut: {
    bus: 'sfx',
    voices: [
      noise(0.8, 0.3, { type: 'highpass', f0: 3500, f1: 1800 }, { att: 0.05 }),
      osc('sine', 1318, 0.4, 0.2, { at: 0.3 }),
      osc('sine', 1760, 0.5, 0.2, { at: 0.42 }),
    ],
  },
  rescued: {
    bus: 'sfx',
    voices: [osc('sine', 1568, 0.12, 0.28), osc('sine', 2093, 0.32, 0.28, { at: 0.1 }), osc('triangle', 2637, 0.2, 0.1, { at: 0.1 })],
  },
  blaze: {
    bus: 'sfx',
    pitchVar: 0.12,
    voices: [
      noise(0.09, 0.2, { type: 'lowpass', f0: 800 }, { att: 0.01 }),
      noise(0.02, 0.1, { type: 'highpass', f0: 3200 }, { at: 0.03, att: 0.002 }),
    ],
  },
  hiss: { bus: 'sfx', voices: [noise(0.2, 0.2, { type: 'highpass', f0: 4200 }, { att: 0.04 })] },
  // mid-round events (midround.ts). The announcement: a siren that warbles twice, so it is heard over the kitchen. Each event then has its own sting: the rush is a cluster of
  // bells, the inspector two whistles, the blackout a power-down (and a power-up when the lights come back), the birthday a six-note jingle; the inspector's verdict is a
  // coin arpeggio or a sad slide. The rat squeaks (two quick ones when it shows up, one when it grabs, a fast falling one when it is scared off).
  siren: {
    bus: 'ui',
    voices: [0, 0.34].flatMap((o) => [
      osc('sawtooth', 620, 0.16, 0.2, { at: o, f1: 940, filter: { type: 'lowpass', f0: 2400 } }),
      osc('sawtooth', 940, 0.16, 0.2, { at: o + 0.17, f1: 620, filter: { type: 'lowpass', f0: 2400 } }),
    ]),
  },
  rushStart: {
    bus: 'sfx',
    voices: [0, 0.08, 0.16, 0.26]
      .map((at, i) => osc('sine', 1568 * (i % 2 ? 1.26 : 1), 0.4, 0.26, { at }))
      .concat([noise(0.2, 0.14, { type: 'highpass', f0: 3000 }, { at: 0.02 })]),
  },
  inspectorStart: {
    bus: 'sfx',
    voices: [
      osc('sine', 2000, 0.12, 0.3, { vib: { rate: 28, depth: 90 } }),
      osc('sine', 2000, 0.3, 0.3, { at: 0.18, vib: { rate: 28, depth: 90 } }),
    ],
  },
  inspectorPass: {
    bus: 'sfx',
    voices: [
      ...[1047, 1319, 1568, 2093].map((f, i) => osc('triangle', f, 0.12, 0.22, { at: i * 0.08 })),
      osc('sine', 2093, 0.6, 0.18, { at: 0.32 }),
    ],
  },
  inspectorFail: {
    bus: 'sfx',
    voices: [
      osc('sawtooth', 392, 0.3, 0.22, { f1: 370, filter: { type: 'lowpass', f0: 1200 } }),
      osc('sawtooth', 330, 0.3, 0.22, { at: 0.3, f1: 310, filter: { type: 'lowpass', f0: 1200 } }),
      osc('sawtooth', 262, 0.6, 0.22, { at: 0.6, f1: 150, filter: { type: 'lowpass', f0: 1200 }, vib: { rate: 6, depth: 10 } }),
    ],
  },
  blackoutStart: {
    bus: 'sfx',
    voices: [
      osc('sawtooth', 260, 0.7, 0.26, { f1: 38, filter: { type: 'lowpass', f0: 1400, f1: 120 } }),
      noise(0.12, 0.3, { type: 'lowpass', f0: 500 }, { at: 0.55 }),
      osc('sine', 90, 0.2, 0.4, { at: 0.55, f1: 40 }),
    ],
  },
  blackoutEnd: {
    bus: 'sfx',
    voices: [
      osc('square', 60, 0.45, 0.2, { f1: 420, filter: { type: 'lowpass', f0: 600, f1: 3000 } }),
      osc('triangle', 880, 0.08, 0.25, { at: 0.42 }),
      osc('triangle', 1320, 0.14, 0.25, { at: 0.5 }),
      noise(0.04, 0.2, { type: 'highpass', f0: 3000 }, { at: 0.4 }),
    ],
  },
  birthday: {
    bus: 'sfx',
    voices: [
      [523, 0],
      [523, 0.16],
      [587, 0.32],
      [523, 0.52],
      [698, 0.72],
      [659, 0.96],
    ]
      .map(([f, at], i) => osc('triangle', f!, i === 5 ? 0.5 : 0.17, 0.26, { at: at! }))
      .concat([osc('sine', 1318, 0.7, 0.1, { at: 0.96 })]),
  },
  ratAppear: { bus: 'sfx', voices: [osc('sine', 2300, 0.07, 0.2, { f1: 3100 }), osc('sine', 2500, 0.08, 0.2, { at: 0.11, f1: 3400 })] },
  ratSteal: {
    bus: 'sfx',
    pitchVar: 0.05,
    voices: [noise(0.04, 0.3, { type: 'bandpass', f0: 1800, q: 1.4 }), osc('sine', 2600, 0.09, 0.22, { at: 0.05, f1: 3300 })],
  },
  ratScared: {
    bus: 'sfx',
    voices: [
      osc('sine', 3400, 0.22, 0.26, { f1: 1200, vib: { rate: 24, depth: 120 } }),
      noise(0.1, 0.18, { type: 'bandpass', f0: 1800, f1: 5000, q: 0.8 }, { att: 0.03 }),
    ],
  },
  ratTarget: { bus: 'sfx', voices: [osc('triangle', 520, 0.09, 0.2, { f1: 610 }), osc('triangle', 700, 0.11, 0.2, { at: 0.12, f1: 820 })] }, // the gentle rat has picked a counter: a question
  ratNear: {
    bus: 'sfx',
    voices: [0, 0.1, 0.2].map((at) => osc('square', 1250, 0.05, 0.16, { at, filter: { type: 'lowpass', f0: 3000 } })),
  }, // ...and is nearly there: three quick blips
  // the calzone (recipes/sim.ts). Folding: soft low thumps of dough being worked, in a loop while Picar is held. Folded: a muffled whump and two rising notes.
  knead: {
    bus: 'sfx',
    pitchVar: 0.1,
    voices: [osc('sine', 140, 0.09, 0.38, { f1: 70 }), noise(0.07, 0.14, { type: 'lowpass', f0: 700 }, { att: 0.01 })],
  },
  folded: {
    bus: 'sfx',
    voices: [
      noise(0.14, 0.3, { type: 'lowpass', f0: 1200, f1: 300 }, { att: 0.02 }),
      osc('triangle', 392, 0.12, 0.26, { at: 0.1 }),
      osc('triangle', 587, 0.2, 0.26, { at: 0.18 }),
    ],
  },
} as const satisfies Record<string, Sfx>;
