// Pure music engine. A theme (themes.ts) says what plays; stepEvents() turns it into notes; the scheduler only does arithmetic.
// Several themes sit between a tarantela and a tribal beat; each match draws one (pickTheme).
import type { Phase } from '@pichi/core';
import { CHORD, THEMES, type ChordName, type DrumVoice, type LeadVoice, type Theme } from './themes';
export type Mode = 'silent' | 'lobby' | 'game' | 'rush' | 'results';
export type Voice = 'bass' | 'accordion' | 'tambourine' | LeadVoice | DrumVoice;
export interface Note {
  voice: Voice;
  freqs: number[];
  offset: number; // fraction of a step after the step start (0 or 0.5)
  len: number; // in steps
  gain: number; // relative within the music bus
}

export const BPM_GAME = 100; // dotted quarters per minute: 300 eighths/min
export const BPM_RUSH = 128;
export const BPM_LOBBY = 80;
export const RUSH_MS = 60_000;
export const RAMP_S = 3;
export const LOOKAHEAD_S = 0.1;
export const TICK_MS = 25;
const REL = {
  bass: 0.5,
  accordion: 0.3,
  mandolin: 0.45,
  tambourine: 0.15,
  marimba: 0.45,
  flute: 0.35,
  boom: 0.5,
  kick: 0.4,
  tomHi: 0.3,
  tomMid: 0.3,
  conga: 0.25,
  hat: 0.12,
} as const;

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteFreq(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const freqs = (names: readonly string[]) => names.map(noteFreq);
const DRUMS: DrumVoice[] = ['boom', 'kick', 'tomHi', 'tomMid', 'conga', 'hat'];

export const loopSteps = (t: Theme) => t.bars.length * t.barSteps;
export const LOOP_STEPS = loopSteps(THEMES[0]!); // 72 eighths for the tarantela
export const hasTambourine = (m: Mode) => m === 'game' || m === 'rush';

// Notes that start on step `step` (0 = first step of the loop) of a theme.
export function stepEvents(step: number, mode: Mode, theme: Theme = THEMES[0]!): Note[] {
  if (mode === 'silent') return [];
  if (mode === 'results') return resultsEvents(step, theme);
  const bs = theme.barSteps;
  const bar = Math.floor(step / bs) % theme.bars.length;
  const e = step % bs;
  const { chord, mel } = theme.bars[bar]!;
  const out: Note[] = [];
  const bassNames = CHORD[chord].bass;
  const bi = theme.bass.indexOf(e);
  if (bi >= 0) out.push({ voice: 'bass', freqs: freqs([bassNames[bi % 2]!]), offset: 0, len: 1, gain: REL.bass });
  if (theme.pad.includes(e))
    out.push({ voice: 'accordion', freqs: freqs(CHORD[chord].pad), offset: 0, len: theme.padLen, gain: REL.accordion });
  const lead = mode === 'lobby' ? theme.leadLobby : theme.lead;
  pushLead(out, e, mel.split(' '), theme.bars[(bar + 1) % theme.bars.length]!.mel.split(' ')[0]!, lead, mode, theme.restrike);
  if (mode === 'lobby') {
    if (bar % 2 === 0 && theme.drums.boom.includes(e)) out.push(hit('boom', 0.5)); // a soft heartbeat, nothing else
    return out;
  }
  const fill = bar % 4 === 3;
  for (const d of DRUMS) if (theme.drums[d].includes(e) || (fill && theme.fills[d]?.includes(e))) out.push(hit(d, 1));
  const sh = theme.shaker;
  if (!sh.skip.includes(e)) {
    const accent = sh.accent.includes(e);
    const rel = accent ? 1.6 : e % 2 === 1 ? sh.ghost : sh.body;
    for (const offset of mode === 'rush' ? [0, 0.5] : [0])
      out.push({ voice: 'tambourine', freqs: [], offset, len: 0.5, gain: REL.tambourine * rel });
  }
  return out;
}
const hit = (voice: DrumVoice, g: number): Note => ({ voice, freqs: [], offset: 0, len: 1, gain: REL[voice] * g });

function pushLead(out: Note[], e: number, row: string[], nextFirst: string, voice: LeadVoice, mode: Mode, restrike: boolean) {
  const cell = row[e]!;
  if (cell === '_') return;
  if (!restrike) {
    if (cell === '-') return; // the previous note is still ringing
    let len = 1;
    while (row[e + len] === '-') len++;
    pushMelody(out, noteFreq(cell), 0, mode, voice, len);
    return;
  }
  const next = e < row.length - 1 ? row[e + 1]! : nextFirst;
  if (cell !== '-') {
    for (const offset of next === '-' ? [0, 0.5] : [0]) pushMelody(out, noteFreq(cell), offset, mode, voice, 0.5); // held notes are re-struck in sixteenths
  } else {
    let i = e;
    while (row[i] === '-') i--;
    for (const offset of [0, 0.5]) pushMelody(out, noteFreq(row[i]!), offset, mode, voice, 0.5);
  }
}
function pushMelody(out: Note[], f: number, offset: number, mode: Mode, voice: LeadVoice, len: number) {
  out.push({ voice, freqs: [f], offset, len, gain: REL[voice] });
  if (mode === 'rush') out.push({ voice, freqs: [f * 2], offset, len, gain: REL[voice] * 0.5 });
}
// Cadence in long chords, then silence; 10 beats long (30 eighths for the 6/8 theme).
export const RESULTS_STEPS = 30;
export const resultsSteps = (t: Theme) => 10 * t.perBeat;
function resultsEvents(step: number, theme: Theme): Note[] {
  const b = theme.perBeat;
  const [first, second] = theme.cadence;
  const chord = (c: ChordName, len: number): Note[] => [
    { voice: 'accordion', freqs: freqs(CHORD[c].pad), offset: 0, len, gain: REL.accordion },
    { voice: 'bass', freqs: freqs([CHORD[c].bass[0]]), offset: 0, len, gain: REL.bass },
  ];
  if (step === 0) return chord(first, 4 * b);
  if (step === 4 * b) return [...chord(second, 6 * b), hit('boom', 0.8)];
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
export const targetBpm = (m: Mode, t: Theme = THEMES[0]!): number => (m === 'lobby' ? t.bpm.lobby : m === 'rush' ? t.bpm.rush : t.bpm.game);
// Tempo glides to the target; the whole game -> rush change takes RAMP_S.
export function rampBpm(cur: number, target: number, dtS: number, span = BPM_RUSH - BPM_GAME): number {
  const max = (span / RAMP_S) * dtS;
  return cur < target ? Math.min(target, cur + max) : Math.max(target, cur - max);
}
export const stepSeconds = (bpm: number, perBeat: number) => 60 / (bpm * perBeat);
export const eighthSeconds = (bpm: number) => stepSeconds(bpm, 3);

/** A theme other than `prevId`, drawn with the injected `rand` (never the sim's RNG). */
export function pickTheme(prevId: string | null, rand: () => number): Theme {
  const pool = THEMES.filter((t) => t.id !== prevId);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}
const inRound = (m: Mode) => m === 'game' || m === 'rush';
/** The theme for this tick: a new one whenever a match starts (silent countdown -> game), otherwise the current one. */
export const themeFor = (cur: Theme, prevMode: Mode, mode: Mode, rand: () => number): Theme =>
  mode === 'game' && !inRound(prevMode) ? pickTheme(cur.id, rand) : cur;

export interface Sched {
  mode: Mode;
  step: number;
  nextTime: number;
  bpm: number;
  lastNow: number;
  theme: string;
}
export interface Scheduled {
  at: number;
  eighth: number; // seconds per step
  note: Note;
}
export const newSched = (now: number): Sched => ({
  mode: 'silent',
  step: 0,
  nextTime: now,
  bpm: BPM_GAME,
  lastNow: now,
  theme: THEMES[0]!.id,
});

// game and rush share one loop (no restart when the last minute begins); any other change restarts it.
const sameLoop = (a: Mode, b: Mode) => a === b || (inRound(a) && inRound(b));

/** Notes starting before now + lookahead. Pure: returns the next state. */
export function advance(
  s: Sched,
  now: number,
  lookahead: number,
  mode: Mode,
  theme: Theme = THEMES[0]!,
): { state: Sched; notes: Scheduled[] } {
  let { step, nextTime, bpm } = s;
  if (!sameLoop(s.mode, mode) || s.theme !== theme.id) {
    step = 0;
    nextTime = now + 0.05;
    bpm = targetBpm(mode, theme);
  } else bpm = rampBpm(bpm, targetBpm(mode, theme), Math.max(0, now - s.lastNow), Math.abs(theme.bpm.rush - theme.bpm.game));
  if (nextTime < now) nextTime = now; // after a stall, do not schedule the past
  const notes: Scheduled[] = [];
  const finite = mode === 'results';
  const loop = loopSteps(theme);
  const end = resultsSteps(theme);
  while (mode !== 'silent' && nextTime < now + lookahead && !(finite && step >= end)) {
    const eighth = stepSeconds(bpm, theme.perBeat);
    for (const note of stepEvents(step, mode, theme)) notes.push({ at: nextTime + note.offset * eighth, eighth, note });
    nextTime += eighth;
    step = finite ? step + 1 : (step + 1) % loop;
  }
  return { state: { mode, step, nextTime, bpm, lastNow: now, theme: theme.id }, notes };
}
