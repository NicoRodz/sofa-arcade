// Pure music: a 12-bar tarantela in A minor, 6/8. Notes come from stepEvents(); the scheduler only does arithmetic.
import type { Phase } from '@party/shared';
export type Mode = 'silent' | 'lobby' | 'game' | 'rush' | 'results';
export type Voice = 'bass' | 'accordion' | 'mandolin' | 'tambourine';
export interface Note {
  voice: Voice;
  freqs: number[];
  offset: number; // fraction of an eighth after the step start (0 or 0.5)
  len: number; // in eighths
  gain: number; // relative within the music bus
}

export const BPM_GAME = 100; // dotted quarters per minute: 300 eighths/min
export const BPM_RUSH = 128;
export const BPM_LOBBY = 80;
export const RUSH_MS = 60_000;
export const RAMP_S = 3;
export const LOOKAHEAD_S = 0.1;
export const TICK_MS = 25;
const REL = { bass: 0.5, accordion: 0.3, mandolin: 0.45, tambourine: 0.15 } as const;

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteFreq(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const MELODY = [
  'A4 C5 E5 A5 E5 C5',
  'B4 C5 D5 E5 - -',
  'G#4 B4 E5 G#5 E5 B4',
  'D5 C5 B4 B4 - -',
  'B4 D5 E5 G#5 E5 D5',
  'C5 B4 A4 G#4 B4 E5',
  'A4 C5 E5 A5 G#5 A5',
  'E5 C5 B4 A4 - -',
  'D5 F5 A5 F5 D5 F5',
  'E5 C5 E5 A5 - -',
  'G#5 E5 B4 D5 C5 B4',
  'A4 E4 A4 A4 - -',
].map((bar) => bar.split(' '));
const CHORD = { Am: ['A3', 'C4', 'E4'], E7: ['E3', 'G#3', 'B3', 'D4'], Dm: ['D3', 'F3', 'A3'] } as const;
const BASS = { Am: ['A2', 'E3'], E7: ['E2', 'B2'], Dm: ['D2', 'A2'] } as const;
type Chord = keyof typeof CHORD;
const PROGRESSION: Chord[] = ['Am', 'Am', 'E7', 'E7', 'E7', 'E7', 'Am', 'Am', 'Dm', 'Am', 'E7', 'Am'];
export const LOOP_STEPS = PROGRESSION.length * 6;
const freqs = (names: readonly string[]) => names.map(noteFreq);

export const hasTambourine = (m: Mode) => m === 'game' || m === 'rush';

// Notes that start on eighth `step` (0 = first eighth of the loop).
export function stepEvents(step: number, mode: Mode): Note[] {
  if (mode === 'silent') return [];
  if (mode === 'results') return resultsEvents(step);
  const bar = Math.floor(step / 6) % PROGRESSION.length;
  const e = step % 6;
  const chord = PROGRESSION[bar]!;
  const out: Note[] = [];
  if (e === 0 || e === 3) out.push({ voice: 'bass', freqs: freqs([BASS[chord][e === 0 ? 0 : 1]]), offset: 0, len: 1, gain: REL.bass });
  if (e === 1 || e === 4) out.push({ voice: 'accordion', freqs: freqs(CHORD[chord]), offset: 0, len: 2, gain: REL.accordion });
  const row = MELODY[bar]!;
  const cell = row[e]!;
  const next = e < 5 ? row[e + 1]! : MELODY[(bar + 1) % MELODY.length]![0]!;
  if (cell !== '-') {
    for (const offset of next === '-' ? [0, 0.5] : [0]) pushMelody(out, noteFreq(cell), offset, mode); // held notes are re-struck in sixteenths
  } else {
    let i = e;
    while (row[i] === '-') i--;
    for (const offset of [0, 0.5]) pushMelody(out, noteFreq(row[i]!), offset, mode);
  }
  if (hasTambourine(mode)) {
    const accent = e === 0 || e === 3 ? 1.6 : 1;
    for (const offset of mode === 'rush' ? [0, 0.5] : [0])
      out.push({ voice: 'tambourine', freqs: [], offset, len: 0.5, gain: REL.tambourine * accent });
  }
  return out;
}
function pushMelody(out: Note[], f: number, offset: number, mode: Mode) {
  out.push({ voice: 'mandolin', freqs: [f], offset, len: 0.5, gain: REL.mandolin });
  if (mode === 'rush') out.push({ voice: 'mandolin', freqs: [f * 2], offset, len: 0.5, gain: REL.mandolin * 0.5 });
}
// Cadence E7 -> Am in long chords, then silence.
export const RESULTS_STEPS = 30;
function resultsEvents(step: number): Note[] {
  if (step === 0)
    return [
      { voice: 'accordion', freqs: freqs(CHORD.E7), offset: 0, len: 12, gain: REL.accordion },
      { voice: 'bass', freqs: freqs([BASS.E7[0]]), offset: 0, len: 12, gain: REL.bass },
    ];
  if (step === 12)
    return [
      { voice: 'accordion', freqs: freqs(CHORD.Am), offset: 0, len: 18, gain: REL.accordion },
      { voice: 'bass', freqs: freqs([BASS.Am[0]]), offset: 0, len: 18, gain: REL.bass },
    ];
  return [];
}

export interface Snapshot {
  phase: Phase;
  started: boolean;
  timeLeftMs: number | null;
}
export function modeFor(s: Snapshot): Mode {
  if (s.phase === 'menu' || s.phase === 'lobby' || s.phase === 'school') return 'lobby'; // the start menu and the Cocina escuela share the lobby's calm music
  if (s.phase === 'results') return 'results';
  if (!s.started) return 'silent'; // the 3-2-1 countdown is heard on its own
  return s.timeLeftMs !== null && s.timeLeftMs <= RUSH_MS ? 'rush' : 'game';
}
export const targetBpm = (m: Mode): number => (m === 'lobby' ? BPM_LOBBY : m === 'rush' ? BPM_RUSH : BPM_GAME);
// Tempo glides to the target; the full 100 -> 128 change takes RAMP_S.
export function rampBpm(cur: number, target: number, dtS: number): number {
  const max = ((BPM_RUSH - BPM_GAME) / RAMP_S) * dtS;
  return cur < target ? Math.min(target, cur + max) : Math.max(target, cur - max);
}
export const eighthSeconds = (bpm: number) => 60 / (bpm * 3);

export interface Sched {
  mode: Mode;
  step: number;
  nextTime: number;
  bpm: number;
  lastNow: number;
}
export interface Scheduled {
  at: number;
  eighth: number;
  note: Note;
}
export const newSched = (now: number): Sched => ({ mode: 'silent', step: 0, nextTime: now, bpm: BPM_GAME, lastNow: now });

// game and rush share one loop (no restart when the last minute begins); any other change restarts it.
const inRound = (m: Mode) => m === 'game' || m === 'rush';
const sameLoop = (a: Mode, b: Mode) => a === b || (inRound(a) && inRound(b));

/** Notes starting before now + lookahead. Pure: returns the next state. */
export function advance(s: Sched, now: number, lookahead: number, mode: Mode): { state: Sched; notes: Scheduled[] } {
  let { step, nextTime, bpm } = s;
  if (!sameLoop(s.mode, mode)) {
    step = 0;
    nextTime = now + 0.05;
    bpm = targetBpm(mode);
  } else bpm = rampBpm(bpm, targetBpm(mode), Math.max(0, now - s.lastNow));
  if (nextTime < now) nextTime = now; // after a stall, do not schedule the past
  const notes: Scheduled[] = [];
  const finite = mode === 'results';
  while (mode !== 'silent' && nextTime < now + lookahead && !(finite && step >= RESULTS_STEPS)) {
    const eighth = eighthSeconds(bpm);
    for (const note of stepEvents(step, mode)) notes.push({ at: nextTime + note.offset * eighth, eighth, note });
    nextTime += eighth;
    step = finite ? step + 1 : (step + 1) % LOOP_STEPS;
  }
  return { state: { mode, step, nextTime, bpm, lastNow: now }, notes };
}
