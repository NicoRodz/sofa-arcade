// Pure dynamic music (plan §14): one loop per biome (BPM, scale, timbres) in four layers that follow the game's state.
// base always; rhythm while the group moves; melody after the first checkpoint; drone when a rope passes 0.85 or lava is near.
// Tension (distance, danger, stragglers) speeds the tempo and opens extra hits. The scheduler only does arithmetic.
import type { Biome } from '../../index';
import { SCALES, degreeFreq, midiFreq } from './scales';
import type { Voice } from './recipes';

export type Timbre =
  | 'ukulele'
  | 'steel'
  | 'marimba'
  | 'flute'
  | 'hammer'
  | 'sqbass'
  | 'bell'
  | 'pad'
  | 'tom'
  | 'satbass'
  | 'lead'
  | 'shaker'
  | 'woodblock'
  | 'tick'
  | 'drone';
export type Layer = 'base' | 'rhythm' | 'melody' | 'drone';
export interface Note {
  timbre: Timbre;
  layer: Layer;
  freqs: number[];
  offset: number;
  len: number;
  gain: number;
} // offset: fraction of a step; len in steps (eighths)

export interface BiomeMusic {
  bpm: number; // quarter notes per minute
  bass: Timbre;
  chord: Timbre;
  lead: Timbre;
  perc: Timbre;
  progression: readonly number[]; // scale degree of the chord root, one per bar (8 eighths)
  melody: readonly number[]; // 32 eighths, scale degree (0 = rest); 4 bars
}
export const MUSIC: Record<Biome, BiomeMusic> = {
  beach: {
    bpm: 104,
    bass: 'ukulele',
    chord: 'ukulele',
    lead: 'steel',
    perc: 'shaker',
    progression: [1, 4, 5, 1],
    melody: [3, 0, 5, 6, 5, 0, 3, 0, 4, 0, 6, 8, 6, 0, 4, 0, 5, 0, 7, 8, 7, 5, 4, 0, 3, 5, 3, 2, 1, 0, 0, 0],
  },
  forest: {
    bpm: 92,
    bass: 'marimba',
    chord: 'marimba',
    lead: 'flute',
    perc: 'woodblock',
    progression: [1, 6, 4, 5],
    melody: [5, 0, 0, 6, 8, 0, 6, 0, 4, 0, 0, 5, 6, 0, 0, 0, 3, 0, 5, 0, 6, 0, 8, 9, 8, 0, 6, 0, 5, 0, 0, 0],
  },
  mine: {
    bpm: 118,
    bass: 'sqbass',
    chord: 'hammer',
    lead: 'hammer',
    perc: 'hammer',
    progression: [1, 2, 1, 5],
    melody: [1, 0, 3, 0, 4, 3, 1, 0, 2, 0, 4, 0, 5, 4, 2, 0, 1, 0, 3, 0, 4, 3, 1, 0, 5, 0, 4, 0, 3, 0, 1, 0],
  },
  glacier: {
    bpm: 80,
    bass: 'pad',
    chord: 'pad',
    lead: 'bell',
    perc: 'tick',
    progression: [1, 5, 6, 4],
    melody: [5, 0, 0, 0, 8, 0, 7, 0, 6, 0, 0, 0, 5, 0, 3, 0, 4, 0, 0, 0, 6, 0, 8, 0, 9, 0, 0, 0, 7, 0, 5, 0],
  },
  volcano: {
    bpm: 128,
    bass: 'satbass',
    chord: 'lead',
    lead: 'lead',
    perc: 'tom',
    progression: [1, 1, 6, 5],
    melody: [1, 0, 1, 3, 0, 1, 4, 3, 1, 0, 1, 3, 0, 5, 4, 3, 6, 0, 6, 5, 0, 4, 3, 2, 1, 0, 2, 3, 0, 7, 5, 0],
  },
};
export const LOOP_STEPS = 32;
const GAIN = { bass: 0.5, chord: 0.22, lead: 0.34, perc: 0.3, drone: 0.2 } as const;

export interface MusicState {
  biome: Biome;
  playing: boolean; // a level is being played
  progress: number; // 0..1 distance to the goal covered by the group
  danger: number; // 0..1 hazards near the group
  stragglers: number; // 0..1 share of players far behind or in a bubble
  moving: boolean;
  checkpointed: boolean; // first checkpoint reached on this level
  maxRopeTension: number; // d / L of the tightest rope
  lavaNear: boolean;
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const DRONE_TENSION = 0.85;
export const tensionOf = (s: MusicState): number =>
  clamp01(0.4 * clamp01(s.progress) + 0.4 * clamp01(s.danger) + 0.2 * clamp01(s.stragglers));
export const layersFor = (s: MusicState): Layer[] => {
  if (!s.playing) return [];
  const l: Layer[] = ['base'];
  if (s.moving) l.push('rhythm');
  if (s.checkpointed) l.push('melody');
  if (s.maxRopeTension > DRONE_TENSION || s.lavaNear) l.push('drone');
  return l;
};
export const TEMPO_BOOST = 0.15; // full tension plays 15% faster
export const bpmFor = (biome: Biome, tension: number): number => MUSIC[biome].bpm * (1 + TEMPO_BOOST * clamp01(tension));
export const stepSeconds = (bpm: number) => 60 / (bpm * 2); // an eighth

const degFreq = (biome: Biome, degree: number, oct = 0) => degreeFreq(biome, degree, oct);

/** Notes starting on eighth `step`. tension 0..1 adds hits (sixteenth hats from 0.6, octave doubling from 0.8). */
export function stepNotes(step: number, biome: Biome, layers: readonly Layer[], tension: number): Note[] {
  const m = MUSIC[biome];
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(s / 8);
  const e = s % 8;
  const root = m.progression[bar % m.progression.length]!;
  const out: Note[] = [];
  const has = (l: Layer) => layers.includes(l);
  if (has('base')) {
    if (e === 0 || e === 4)
      out.push({ timbre: m.bass, layer: 'base', freqs: [degFreq(biome, root, -1)], offset: 0, len: e === 0 ? 3 : 2, gain: GAIN.bass });
    if (e === 0)
      out.push({
        timbre: m.chord,
        layer: 'base',
        freqs: [0, 2, 4].map((d) => degFreq(biome, root + d, 0)),
        offset: 0,
        len: 7,
        gain: GAIN.chord,
      });
    if (e === 4 && m.chord !== m.bass)
      out.push({
        timbre: m.chord,
        layer: 'base',
        freqs: [0, 2, 4].map((d) => degFreq(biome, root + d, 0)),
        offset: 0,
        len: 3,
        gain: GAIN.chord * 0.7,
      });
  }
  if (has('rhythm')) {
    if (e % 2 === 0)
      out.push({
        timbre: m.perc,
        layer: 'rhythm',
        freqs: [e === 0 ? degFreq(biome, 1, -1) : degFreq(biome, 5, -1)],
        offset: 0,
        len: 0.5,
        gain: GAIN.perc * (e % 4 === 0 ? 1 : 0.6),
      });
    if (tension >= 0.6) out.push({ timbre: 'tick', layer: 'rhythm', freqs: [], offset: 0.5, len: 0.25, gain: 0.12 + 0.1 * tension });
  }
  if (has('melody')) {
    const d = m.melody[s]!;
    if (d > 0) {
      const f = degFreq(biome, d, 1);
      out.push({ timbre: m.lead, layer: 'melody', freqs: [f], offset: 0, len: 1.5, gain: GAIN.lead });
      if (tension >= 0.8) out.push({ timbre: m.lead, layer: 'melody', freqs: [f * 2], offset: 0, len: 1, gain: GAIN.lead * 0.4 });
    }
  }
  if (has('drone') && s % 16 === 0) {
    const r = SCALES[biome].rootMidi - 12;
    out.push({ timbre: 'drone', layer: 'drone', freqs: [midiFreq(r), midiFreq(r + 7)], offset: 0, len: 16, gain: GAIN.drone });
  }
  return out;
}

/** What one note is made of. `stepS` is the duration of an eighth. */
export function noteVoices(n: Note, stepS: number): Voice[] {
  const dur = Math.max(0.03, n.len * stepS);
  const f = n.freqs[0] ?? 0;
  const g = n.gain;
  const o = (src: Voice['src'], f0: number, d: number, gain: number, x: Partial<Voice> = {}): Voice => ({
    src,
    at: 0,
    dur: d,
    gain,
    f0,
    ...x,
  });
  switch (n.timbre) {
    case 'ukulele':
      return n.freqs.map((fr) => o('pluck', fr, Math.min(dur, 0.7), g / Math.max(1, n.freqs.length * 0.7), { ks: 0.985 }));
    case 'steel':
      return [o('fm', f, Math.min(dur, 0.5), g, { fm: { ratio: 1.41, i0: 2.5, i1: 0, t: 0.3 } })];
    case 'marimba':
      return n.freqs.flatMap((fr) => [
        o('sine', fr, Math.min(dur, 0.35), g / n.freqs.length),
        o('sine', fr * 4, 0.08, (g * 0.25) / n.freqs.length),
      ]);
    case 'flute':
      return [o('triangle', f, dur, g * 0.8, { att: 0.05, vib: { rate: 5, depth: f * 0.012 } })];
    case 'hammer':
      return n.freqs.map((fr) =>
        o('fm', fr, Math.min(dur, 0.25), g / Math.max(1, n.freqs.length), { fm: { ratio: 3.5, i0: 3, i1: 0, t: 0.12 } }),
      );
    case 'sqbass':
      return [o('square', f, Math.min(dur, 0.4), g * 0.6, { filter: { type: 'lowpass', f0: 500 } })];
    case 'bell':
      return [o('fm', f, Math.min(dur * 2, 1.2), g, { fm: { ratio: 7, i0: 1.5, i1: 0, t: 0.6 } })];
    case 'pad':
      return n.freqs.flatMap((fr) =>
        [-7, 7].map((c) => o('sawtooth', fr, dur, g / (n.freqs.length * 2), { att: 0.3, detune: c, filter: { type: 'lowpass', f0: 900 } })),
      );
    case 'tom':
      return [o('sine', f * 2, 0.18, g, { f1: f * 0.8 })];
    case 'satbass':
      return [o('sawtooth', f, Math.min(dur, 0.35), g * 0.8, { filter: { type: 'lowpass', f0: 420, q: 4 } })];
    case 'lead':
      return n.freqs.map((fr) =>
        o('sawtooth', fr, Math.min(dur, 0.3), (g / n.freqs.length) * 0.8, { filter: { type: 'lowpass', f0: 2200 } }),
      );
    case 'shaker':
      return [{ src: 'noise', at: 0, dur: 0.06, gain: g * 0.6, att: 0.01, filter: { type: 'highpass', f0: 6000 } }];
    case 'woodblock':
      return [o('sine', 900, 0.05, g * 0.8, { f1: 700 })];
    case 'tick':
      return [{ src: 'noise', at: 0, dur: 0.03, gain: n.gain, att: 0.002, filter: { type: 'highpass', f0: 7000 } }];
    case 'drone':
      return n.freqs.flatMap((fr) =>
        [-6, 6].map((c) => o('sawtooth', fr, dur, g / (n.freqs.length * 2), { att: 0.8, detune: c, filter: { type: 'lowpass', f0: 300 } })),
      );
  }
}

// ---- scheduler (same shape as the pizza game's: restart on a biome change, tempo glides, never schedule the past)
export const LOOKAHEAD_S = 0.12;
export const TICK_MS = 25;
export const BPM_RAMP_PER_S = 8;
export interface Sched {
  biome: Biome | null;
  playing: boolean;
  step: number;
  nextTime: number;
  bpm: number;
  lastNow: number;
}
export interface Scheduled {
  at: number;
  stepS: number;
  note: Note;
}
export const newSched = (now: number): Sched => ({ biome: null, playing: false, step: 0, nextTime: now, bpm: 100, lastNow: now });

export function advance(s: Sched, now: number, lookahead: number, st: MusicState): { state: Sched; notes: Scheduled[] } {
  const tension = tensionOf(st);
  const target = bpmFor(st.biome, tension);
  let { step, nextTime, bpm } = s;
  const restart = s.biome !== st.biome || (st.playing && !s.playing);
  if (restart) {
    step = 0;
    nextTime = now + 0.05;
    bpm = target;
  } else {
    const max = BPM_RAMP_PER_S * Math.max(0, now - s.lastNow);
    bpm = bpm < target ? Math.min(target, bpm + max) : Math.max(target, bpm - max);
  }
  if (nextTime < now) nextTime = now;
  const layers = layersFor(st);
  const notes: Scheduled[] = [];
  while (st.playing && nextTime < now + lookahead) {
    const stepS = stepSeconds(bpm);
    for (const note of stepNotes(step, st.biome, layers, tension)) notes.push({ at: nextTime + note.offset * stepS, stepS, note });
    nextTime += stepS;
    step = (step + 1) % LOOP_STEPS;
  }
  return { state: { biome: st.biome, playing: st.playing, step, nextTime, bpm, lastNow: now }, notes };
}
