// Pure sound design of "Obstaculos en cadena": which sounds an obst.* event asks for (cuesFor) and what each is made of
// (voicesFor). No Web Audio here; synth.ts renders the voices. Plan §14.
import { MAX_FALL, type Biome, type CampaignEvents, type ObstEvents } from '../../index';
import { degreeFreq, slotFreq } from './scales';

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

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const impactLevel = (impact: number): number => clamp01(impact / MAX_FALL);
const cue = (recipe: RecipeId, key: string, priority: Cue['priority'], p: Params = {}, duck = false): Cue => ({
  recipe,
  key,
  priority,
  p,
  ...(duck ? { duck } : {}),
});

type Handlers = { [K in keyof ObstEvents]: (p: ObstEvents[K], biome: Biome) => Cues };
// One entry per event; the mapped type makes a missing event a compile error.
export const HANDLERS: Handlers = {
  'obst.jump': (p, b) => [
    cue(p.kind === 'trampoline' ? 'boing' : 'jump', `jump:${p.player}`, 2, { freq: slotFreq(b, p.player), variant: p.kind }),
  ],
  'obst.land': (p, b) => {
    if (p.impact < LAND_MIN_IMPACT) return [];
    const surface: Surface = p.on === 'head' ? 'thud' : p.on === 'oneWay' ? 'wood' : BIOME_SURFACE[b];
    return [cue('land', `land:${p.player}`, 1, { surface, level: impactLevel(p.impact) })];
  },
  'obst.ropeTaut': (p) => [cue('ropeTaut', `rope:${p.rope}:${p.link}`, 1, { tension: p.tension, level: p.link })],
  'obst.ropeStrain': (p) => [cue('ropeStrain', `strain:${p.rope}`, 1, { tension: p.tension })],
  'obst.grab': (p) => [
    cue(
      p.target === 'ring' ? 'grabRing' : p.target === 'player' ? 'grabPlayer' : p.target === 'box' ? 'grabBox' : 'grabLever',
      `grab:${p.player}`,
      1,
    ),
  ],
  'obst.release': (p) => [cue('release', `release:${p.player}`, 0)],
  'obst.throw': (p) => [cue('throw', `throw:${p.player}`, 1, { level: clamp01(Math.hypot(p.vx, p.vy) / 1200) })],
  'obst.handCatch': (p) => [cue('handCatch', `catch:${p.player}`, 2)],
  'obst.death': (p, b) => [cue('death', `death:${p.player}`, 3, { variant: p.cause, freq: slotFreq(b, p.player) })],
  'obst.bubble': (p) => [cue('bubble', `bubble:${p.player}`, 1, { variant: p.reason })],
  'obst.respawn': (p, b) => [cue('respawn', `respawn:${p.player}`, 2, { variant: p.via, freq: slotFreq(b, p.player) })],
  'obst.checkpoint': (_p, b) => [cue('checkpoint', 'checkpoint', 2, { notes: [1, 3, 5, 8].map((d) => degreeFreq(b, d, 1)) }, true)],
  'obst.star': (p, b) => [
    cue('star', `star:${p.player}`, 2, { freq: degreeFreq(b, 5 + Math.min(Math.max(p.streak, 1) - 1, 7), 1), level: p.streak }),
  ],
  'obst.plate': (p) => [cue('plate', `plate:${p.id}`, 1, { variant: p.pressed ? 'down' : 'up', level: clamp01(p.weight / 4) })],
  'obst.gate': (p) => [cue('gate', `gate:${p.id}`, 1, { variant: p.open ? 'open' : 'shut' })],
  'obst.goalEnter': (p, b) => {
    const out: Cues = [cue('goalEnter', `goal:${p.player}`, 2, { freq: slotFreq(b, p.player) })];
    if (p.total > 0 && p.inside >= p.total)
      out.push(cue('fanfare', 'goalAll', 3, { notes: [1, 5, 8, 10, 12].map((d) => degreeFreq(b, d, 1)), variant: 'gold' }, true));
    return out;
  },
  'obst.levelClear': (p, b) => {
    const len = p.medal === 'gold' ? 5 : p.medal === 'silver' ? 4 : 3;
    return [
      cue(
        'fanfare',
        'clear',
        3,
        { notes: [1, 3, 5, 8, 10].slice(0, len).map((d) => degreeFreq(b, d, 1)), variant: p.medal, level: p.stars / 3 },
        true,
      ),
    ];
  },
  'obst.runEnd': (p, b) => [
    p.reason === 'complete'
      ? cue('runWin', 'runEnd', 3, { notes: [1, 3, 5, 8, 10, 12].map((d) => degreeFreq(b, d, 1)) }, true)
      : cue('runFail', 'runEnd', 3, { freq: degreeFreq(b, 1, 1) }, true),
  ],
};

// Campaign A5 (plan §4 #4-#9): ONE effect per dynamic, built from the same voices as the rest. The older campaign events (signal, countdown, superJump, edgeAssist,
// heartsOut) have no sound yet (the screen shows banners for them), so this map is partial on purpose.
export type CampaignSound =
  | 'obst.balance'
  | 'obst.target'
  | 'obst.enemy'
  | 'obst.ice'
  | 'obst.wind'
  | 'obst.pickaxe'
  | 'obst.lantern'
  | 'obst.bungee'
  | 'obst.sinker'
  | 'obst.geyser';
type CampaignHandlers = { [K in CampaignSound]: (p: CampaignEvents[K], biome: Biome) => Cues };
const PICK_FREQ = { take: 1400, pass: 1800, climb: 2200, top: 2800 } as const;
export const CAMPAIGN_HANDLERS: CampaignHandlers = {
  'obst.balance': (p) => [cue('balance', `balance:${p.id}`, 1)], // wood creaking as the plates swap
  'obst.target': (p, b) => [cue('target', `target:${p.id}`, 2, { freq: degreeFreq(b, 8, 2) })], // a bright ting
  'obst.enemy': (p) => [cue('enemy', `enemy:${p.enemy}`, 1, { variant: p.action })], // squish when stunned, thud when it shoves
  'obst.ice': (p) => [cue('ice', `ice:${p.player}`, 0)], // glassy tick, the lowest priority: it rings at every step onto ice
  'obst.wind': (p) => (p.phase === 'calm' ? [] : [cue('wind', 'wind', 1, { variant: p.phase })]), // a whoosh at the warning and a stronger one with the gust
  'obst.pickaxe': (p) => [cue('pickaxe', `pick:${p.player}`, 1, { freq: PICK_FREQ[p.action], variant: p.action })], // steel tink, higher the further the action goes
  // A6: the crystals ring a glassy chord when the lantern lights them and sigh when it leaves; a rubber twang for the bungee; a low glug for the rock; the geyser bubbles, then roars
  'obst.lantern': (p, b) => [
    cue('lantern', `lantern:${p.action}`, p.action === 'light' ? 2 : 1, {
      freq: degreeFreq(b, p.action === 'light' ? 5 : 3, 2),
      variant: p.action,
    }),
  ],
  'obst.bungee': (p) => [cue('bungee', `bungee:${p.player}`, 1, { level: clamp01((p.stretch - 1.25) / 0.35) })],
  'obst.sinker': (p) => [cue('sinker', `sinker:${p.id}`, 1, { level: clamp01(p.load / 3) })],
  'obst.geyser': (p) => (p.phase === 'calm' ? [] : [cue('geyser', `geyser:${p.id}`, p.phase === 'gush' ? 2 : 1, { variant: p.phase })]),
};
export type SoundEvents = ObstEvents & Pick<CampaignEvents, CampaignSound>;
const ALL_HANDLERS = { ...HANDLERS, ...CAMPAIGN_HANDLERS } as { [K in keyof SoundEvents]: (p: SoundEvents[K], biome: Biome) => Cues };
export const SOUND_EVENTS = Object.keys(ALL_HANDLERS) as (keyof SoundEvents)[];

/** Which sounds an event asks for. Pure and total over the event names (the quick match's and the campaign's A5). */
export function cuesFor<K extends keyof ObstEvents>(name: K, payload: ObstEvents[K], biome: Biome): Cue[];
export function cuesFor<K extends CampaignSound>(name: K, payload: CampaignEvents[K], biome: Biome): Cue[];
export function cuesFor(name: keyof SoundEvents, payload: unknown, biome: Biome): Cue[] {
  return (ALL_HANDLERS[name] as (p: unknown, b: Biome) => Cues)(payload, biome).filter((c): c is Cue => c !== null);
}

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
