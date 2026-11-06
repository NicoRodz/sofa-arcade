import { SURFACE, type Cue, type Src, type Voice } from './recipe-types';

// ---- voices
const o = (src: Src, f0: number, dur: number, gain: number, x: Partial<Voice> = {}): Voice => ({ src, at: 0, dur, gain, f0, ...x });
const nz = (dur: number, gain: number, filter: NonNullable<Voice['filter']>, x: Partial<Voice> = {}): Voice => ({
  src: 'noise',
  at: 0,
  dur,
  gain,
  filter,
  ...x,
});
const semi = (n: number) => 2 ** (n / 12);
/** Struck bell: sine plus the 2.76x partial, both decaying. */
const bell = (f: number, dur: number, gain: number, at = 0): Voice[] => [
  o('sine', f, dur, gain, { at }),
  o('sine', f * 2.76, dur * 0.6, gain * 0.4, { at }),
];

export function voicesFor(c: Cue): Voice[] {
  const { p } = c;
  const f = p.freq ?? 440;
  const lvl = p.level ?? 0;
  switch (c.recipe) {
    case 'jump': {
      // triangle, +7 semitones in 90 ms, 120 ms fall
      const g = p.variant === 'coyote' ? 0.26 : 0.34;
      const v = [o('triangle', f, 0.21, g, { f1: f * semi(7), glide: 0.09 })];
      if (p.variant === 'rope') v.push(o('pluck', f / 2, 0.25, 0.22, { ks: 0.985 }));
      return v;
    }
    case 'boing':
      return [
        o('sine', 180, 0.32, 0.34, { f1: 620, glide: 0.1, vib: { rate: 16, depth: 18 } }),
        o('triangle', f * 2, 0.2, 0.2, { f1: f * 2 * semi(7), glide: 0.09 }),
      ];
    case 'land': {
      const s = SURFACE[p.surface ?? 'thud'];
      const dur = 0.04 + 0.04 * lvl;
      const g = 0.04 + 0.5 * lvl * lvl; // gain proportional to impact squared
      const v = [nz(dur, g, { type: 'bandpass', f0: s.f, q: s.q })];
      if (p.surface === 'thud') v.push(o('sine', 180, 0.08, 0.3 * (0.3 + lvl), { f1: 80 }));
      return v;
    }
    case 'ropeTaut': {
      // Karplus-Strong 110..220 Hz; link picks one of four notes
      const t = Math.min(1, Math.max(0, ((p.tension ?? 1) - 1) / 0.6));
      const pitch = (110 + 110 * t) * semi([0, 2, 4, 7][Math.abs(Math.trunc(lvl)) % 4]!);
      return [o('pluck', Math.min(pitch, 440), 0.45, 0.3 + 0.1 * t, { ks: 0.985 })];
    }
    case 'ropeStrain': {
      // two saws 55 / 55.7 Hz beating, bandpass opens with tension
      const t = Math.min(1, Math.max(0, ((p.tension ?? 1) - 1) / 0.6));
      const bp = { type: 'bandpass' as const, f0: 300 + 600 * t, q: 2 };
      return [
        o('sawtooth', 55, 0.4, 0.3 + 0.2 * t, { filter: bp, att: 0.05 }),
        o('sawtooth', 55.7, 0.4, 0.3 + 0.2 * t, { filter: bp, att: 0.05 }),
      ];
    }
    case 'grabRing':
      return [o('fm', 880, 0.15, 0.3, { fm: { ratio: 3.5, i0: 4, i1: 0, t: 0.15 } })];
    case 'grabPlayer':
      return [o('sine', 220, 0.07, 0.3, { f1: 150 }), nz(0.05, 0.15, { type: 'lowpass', f0: 500 })];
    case 'grabBox':
      return [nz(0.06, 0.3, { type: 'bandpass', f0: 400, q: 2 }), o('sine', 140, 0.06, 0.2, { f1: 100 })];
    case 'grabLever':
      return [o('square', 1200, 0.025, 0.12, { att: 0.002 }), nz(0.04, 0.3, { type: 'bandpass', f0: 2400, q: 8 })];
    case 'release':
      return [o('triangle', 500, 0.05, 0.2, { f1: 300 })];
    case 'throw':
      return [
        nz(0.18, 0.2 + 0.2 * lvl, { type: 'bandpass', f0: 400, f1: 1800, q: 1.2 }, { att: 0.06 }),
        o('triangle', 300, 0.15, 0.2, { f1: 700 }),
      ];
    case 'handCatch':
      return [o('sine', 660, 0.12, 0.3), o('sine', 990, 0.18, 0.3, { at: 0.07 }), o('pluck', 330, 0.3, 0.2, { ks: 0.985 })];
    case 'death': {
      const v = [o('sine', 600, 0.18, 0.4, { f1: 80 })];
      if (p.variant === 'liquid') v.push(nz(0.2, 0.35, { type: 'bandpass', f0: 1400, f1: 500, q: 0.8 }));
      else if (p.variant === 'spikes') v.push(nz(0.05, 0.3, { type: 'bandpass', f0: 2500, q: 1 }));
      else if (p.variant === 'crush') v.push(o('sine', 120, 0.2, 0.4, { f1: 45 }), nz(0.1, 0.25, { type: 'lowpass', f0: 300 }));
      else v.push(nz(0.08, 0.15, { type: 'lowpass', f0: 800 }));
      return v;
    }
    case 'bubble':
      return [
        o('sine', 300, p.variant === 'rope' ? 0.5 : 0.6, 0.22, { vib: { rate: 6, depth: 20 }, att: 0.08 }),
        o('sine', 600, 0.4, 0.06, { vib: { rate: 6, depth: 40 }, att: 0.08 }),
      ];
    case 'respawn':
      if (p.variant === 'bubble') return [o('sine', 300, 0.08, 0.3, { f1: 900 })];
      if (p.variant === 'team') return [o('triangle', f, 0.12, 0.3), o('triangle', f * semi(7), 0.2, 0.3, { at: 0.08 })];
      return [0, 1, 2].map((i) => o('triangle', f * [1, 5 / 4, 3 / 2][i]!, 0.12, 0.3, { at: i * 0.06 }));
    case 'checkpoint':
      return (p.notes ?? []).flatMap((n, i) => [
        o('triangle', n, 0.3, 0.26, { at: i * 0.07 }),
        o('sine', n * 2, 0.2, 0.08, { at: i * 0.07 }),
      ]);
    case 'star':
      return bell(f, 0.5, 0.3);
    case 'plate':
      return p.variant === 'down'
        ? [o('square', 300, 0.04, 0.12 + 0.08 * lvl, { f1: 180 }), nz(0.05, 0.2, { type: 'lowpass', f0: 600 })]
        : [o('square', 200, 0.04, 0.1, { f1: 320 })];
    case 'gate':
      return p.variant === 'open'
        ? [o('sawtooth', 80, 0.4, 0.16, { f1: 170, filter: { type: 'lowpass', f0: 500 } }), nz(0.35, 0.18, { type: 'lowpass', f0: 700 })]
        : [o('sine', 120, 0.15, 0.4, { f1: 55 }), nz(0.06, 0.25, { type: 'lowpass', f0: 600 })];
    case 'goalEnter':
      return bell(f, 0.7, 0.3);
    case 'fanfare': {
      const n = p.notes ?? [];
      const gold = p.variant === 'gold';
      const v = n.flatMap((fr, i) => [o('square', fr, 0.14, 0.14, { at: i * 0.09 }), o('triangle', fr, 0.2, 0.2, { at: i * 0.09 })]);
      const last = n[n.length - 1] ?? 440;
      v.push(...bell(last, gold ? 1.1 : 0.7, 0.25, n.length * 0.09));
      if (gold) v.push(...bell(last * 1.5, 1.1, 0.12, n.length * 0.09));
      return v;
    }
    case 'runWin': {
      const n = p.notes ?? [];
      return [
        ...n.flatMap((fr, i) => [o('square', fr, 0.18, 0.13, { at: i * 0.11 }), o('triangle', fr, 0.3, 0.2, { at: i * 0.11 })]),
        ...[n[2], n[3], n[5]].flatMap((fr) => bell(fr ?? 440, 1.4, 0.18, n.length * 0.11)),
      ];
    }
    case 'runFail':
      return [o('sine', f, 0.8, 0.3, { f1: f / 4, vib: { rate: 5, depth: 8 } }), o('triangle', f * 0.75, 0.8, 0.12, { f1: f / 5 })];
    case 'balance':
      return [
        // two planks creaking: a saw wobbling down in pitch plus the rub
        o('sawtooth', 150, 0.45, 0.16, { f1: 95, filter: { type: 'lowpass', f0: 420 }, vib: { rate: 9, depth: 14 }, att: 0.04 }),
        nz(0.4, 0.14, { type: 'bandpass', f0: 700, f1: 380, q: 3 }, { att: 0.05 }),
      ];
    case 'target':
      return [nz(0.03, 0.3, { type: 'bandpass', f0: 1800, q: 2 }), ...bell(f, 0.55, 0.3), o('sine', f * 1.5, 0.3, 0.12, { at: 0.04 })];
    case 'enemy':
      return p.variant === 'stun'
        ? [o('sine', 260, 0.2, 0.34, { f1: 70 }), o('triangle', 520, 0.12, 0.2, { f1: 220 }), nz(0.05, 0.18, { type: 'lowpass', f0: 700 })]
        : [o('sine', 150, 0.07, 0.3, { f1: 90 }), nz(0.05, 0.16, { type: 'lowpass', f0: 500 })];
    case 'ice':
      return [o('sine', 2600, 0.1, 0.1, { f1: 3300 }), o('sine', 3900, 0.07, 0.05, { at: 0.02 })];
    case 'wind':
      return [
        nz(
          p.variant === 'gust' ? 1.0 : 0.8,
          p.variant === 'gust' ? 0.32 : 0.2,
          { type: 'bandpass', f0: 300, f1: p.variant === 'gust' ? 1400 : 900, q: 0.8 },
          { att: 0.3 },
        ),
      ];
    case 'lantern':
      return p.variant === 'light'
        ? [0, 1, 2].flatMap((i) => bell(f * [1, 1.25, 1.5][i]!, 0.7, 0.2, i * 0.05)) // a glassy major chord
        : p.variant === 'dim'
          ? [o('sine', f, 0.3, 0.16, { f1: f * 0.5 })]
          : [o('triangle', f * 2, 0.1, 0.18), ...bell(f * 3, 0.3, 0.14, 0.04)]; // take / pass: a brass ting
    case 'bungee':
      return [
        // a rubber twang: a pluck that bends upwards, a boing underneath
        o('pluck', 150 + 90 * lvl, 0.55, 0.26, { ks: 0.99 }),
        o('sine', 160, 0.3, 0.26, { f1: 300 + 200 * lvl, glide: 0.12, vib: { rate: 22, depth: 25 } }),
      ];
    case 'sinker':
      return [
        // a low glug and a wet rush
        o('sine', 240, 0.32, 0.28, { f1: 90, vib: { rate: 11, depth: 28 } }),
        nz(0.28, 0.12 + 0.06 * lvl, { type: 'lowpass', f0: 900, f1: 300 }, { att: 0.03 }),
      ];
    case 'geyser':
      return p.variant === 'gush'
        ? [
            nz(0.7, 0.34, { type: 'bandpass', f0: 500, f1: 2600, q: 0.7 }, { att: 0.05 }),
            o('sine', 90, 0.4, 0.4, { f1: 50 }),
            o('triangle', 220, 0.5, 0.16, { f1: 520 }),
          ]
        : [
            nz(0.8, 0.14, { type: 'bandpass', f0: 800, f1: 1500, q: 2 }, { att: 0.2 }),
            o('sine', 300, 0.7, 0.1, { vib: { rate: 14, depth: 60 }, att: 0.2 }),
          ]; // bubbling
    case 'pickaxe':
      return [
        o('square', f, 0.03, 0.13),
        o('sine', f * 1.5, 0.18, 0.16, { f1: f * 1.4 }),
        nz(0.04, 0.2, { type: 'bandpass', f0: 3000, q: 4 }),
      ];
  }
}
export const cueDuration = (c: Cue): number => Math.max(0, ...voicesFor(c).map((v) => v.at + v.dur));
