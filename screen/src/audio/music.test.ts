import { describe, expect, it } from 'vitest';
import {
  BPM_GAME, BPM_LOBBY, BPM_RUSH, LOOP_STEPS, RESULTS_STEPS, advance, eighthSeconds, modeFor, newSched, noteFreq, rampBpm, stepEvents, targetBpm,
  type Mode, type Sched, type Snapshot,
} from './music';

const snap = (s: Partial<Snapshot>): Snapshot => ({ phase: 'playing', started: true, timeLeftMs: 120_000, ...s });

describe('mode and tempo from the game snapshot', () => {
  it('lobby, countdown, game, last minute, results', () => {
    expect(modeFor(snap({ phase: 'lobby' }))).toBe('lobby');
    expect(modeFor(snap({ started: false, timeLeftMs: null }))).toBe('silent');
    expect(modeFor(snap({ timeLeftMs: 60_001 }))).toBe('game');
    expect(modeFor(snap({ timeLeftMs: 60_000 }))).toBe('rush');
    expect(modeFor(snap({ phase: 'results', timeLeftMs: null }))).toBe('results');
  });
  it('base tempo 100, lobby 80, last minute 128', () => {
    expect([targetBpm('lobby'), targetBpm('game'), targetBpm('rush')]).toEqual([BPM_LOBBY, BPM_GAME, BPM_RUSH]);
    expect(eighthSeconds(100)).toBeCloseTo(0.2); // 300 eighths/min
  });
  it('ramp takes 3 s from 100 to 128 and does not overshoot', () => {
    expect(rampBpm(100, 128, 1.5)).toBeCloseTo(114);
    expect(rampBpm(100, 128, 3)).toBeCloseTo(128);
    expect(rampBpm(100, 128, 10)).toBe(128);
    expect(rampBpm(128, 100, 1.5)).toBeCloseTo(114);
  });
});

describe('notes', () => {
  it('pitch names', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('C5')).toBeCloseTo(523.25, 1);
    expect(noteFreq('G#4')).toBeCloseTo(415.3, 1);
  });
  it('bar 1: bass on beats 1 and 4, accordion on eighths 2 and 5, melody A4 C5 E5...', () => {
    const v = (step: number, voice: string) => stepEvents(step, 'game').filter((n) => n.voice === voice);
    expect(v(0, 'bass')[0]!.freqs[0]).toBeCloseTo(noteFreq('A2'));
    expect(v(3, 'bass')[0]!.freqs[0]).toBeCloseTo(noteFreq('E3'));
    expect(v(1, 'bass')).toHaveLength(0);
    expect(v(1, 'accordion')).toHaveLength(1);
    expect(v(2, 'accordion')).toHaveLength(0);
    expect(v(4, 'accordion')).toHaveLength(1);
    expect([0, 1, 2].map((s) => v(s, 'mandolin')[0]!.freqs[0]!)).toEqual([noteFreq('A4'), noteFreq('C5'), noteFreq('E5')]);
  });
  it('held notes are re-struck in sixteenths (bar 2: E5 - -)', () => {
    const m = (step: number) => stepEvents(6 + step, 'game').filter((n) => n.voice === 'mandolin');
    expect(m(3).map((n) => n.offset)).toEqual([0, 0.5]);
    expect(m(4).map((n) => [n.offset, n.freqs[0]])).toEqual([[0, noteFreq('E5')], [0.5, noteFreq('E5')]]);
  });
  it('harmony: bar 3 is E7 (bass E2), bar 9 is Dm (bass D2)', () => {
    expect(stepEvents(12, 'game').find((n) => n.voice === 'bass')!.freqs[0]).toBeCloseTo(noteFreq('E2'));
    expect(stepEvents(8 * 6, 'game').find((n) => n.voice === 'bass')!.freqs[0]).toBeCloseTo(noteFreq('D2'));
  });
  it('tambourine: none in lobby, every eighth in game with accent, sixteenths in rush', () => {
    const t = (mode: Mode, step: number) => stepEvents(step, mode).filter((n) => n.voice === 'tambourine');
    expect(t('lobby', 0)).toHaveLength(0);
    expect(t('game', 0)[0]!.gain / t('game', 1)[0]!.gain).toBeCloseTo(1.6);
    expect(t('game', 3)[0]!.gain).toBeCloseTo(t('game', 0)[0]!.gain);
    expect(t('rush', 1)).toHaveLength(2);
  });
  it('rush doubles the melody an octave up at half gain', () => {
    const m = stepEvents(0, 'rush').filter((n) => n.voice === 'mandolin');
    expect(m).toHaveLength(2);
    expect(m[1]!.freqs[0]! / m[0]!.freqs[0]!).toBeCloseTo(2);
    expect(m[1]!.gain / m[0]!.gain).toBeCloseTo(0.5);
  });
  it('relative levels: bass .5, accordion .3, mandolin .45, tambourine .15', () => {
    const e = stepEvents(0, 'game');
    expect(e.find((n) => n.voice === 'bass')!.gain).toBe(0.5);
    expect(e.find((n) => n.voice === 'mandolin')!.gain).toBe(0.45);
    expect(e.find((n) => n.voice === 'tambourine')!.gain).toBeCloseTo(0.24);
    expect(stepEvents(1, 'game').find((n) => n.voice === 'accordion')!.gain).toBe(0.3);
  });
  it('results: E7 chord, then Am, then nothing', () => {
    expect(stepEvents(0, 'results').length).toBeGreaterThan(0);
    expect(stepEvents(12, 'results').length).toBeGreaterThan(0);
    expect(stepEvents(5, 'results')).toHaveLength(0);
    expect(stepEvents(0, 'silent')).toHaveLength(0);
  });
});

describe('scheduler', () => {
  const run = (s: Sched, from: number, to: number, mode: Mode, dt = 0.025) => {
    let st = s; let n = 0;
    for (let t = from; t <= to + 1e-9; t += dt) { const r = advance(st, t, 0.1, mode); st = r.state; n += r.notes.length; }
    return { st, n };
  };
  it('never schedules a note in the past and keeps a steady 0.2 s eighth at 100 bpm', () => {
    let st = newSched(0); const times: number[] = [];
    for (let t = 0; t < 3; t += 0.025) {
      const r = advance(st, t, 0.1, 'game'); st = r.state;
      for (const n of r.notes) { expect(n.at).toBeGreaterThanOrEqual(t - 1e-9); if (n.note.voice === 'bass') times.push(n.at); }
    }
    expect(times[1]! - times[0]!).toBeCloseTo(0.6, 5); // beats 1 and 4 are 3 eighths apart
    expect(times[2]! - times[0]!).toBeCloseTo(1.2, 5);
  });
  it('silent mode schedules nothing and does not advance the loop', () => {
    const r = run(newSched(0), 0, 2, 'silent');
    expect([r.n, r.st.step]).toEqual([0, 0]);
  });
  it('entering the last minute ramps the tempo without restarting the loop', () => {
    let { st } = run(newSched(0), 0, 4, 'game');
    const stepBefore = st.step;
    st = run(st, 4.025, 5.5, 'rush').st;
    expect(st.bpm).toBeCloseTo(100 + 28 * (1.5 / 3), 0);
    expect(st.step).not.toBe(0);
    expect(stepBefore).toBeGreaterThan(0);
    expect(run(st, 5.525, 9, 'rush').st.bpm).toBe(BPM_RUSH);
  });
  it('lobby -> game restarts the loop at step 0 and jumps to the new tempo', () => {
    const st = run(newSched(0), 0, 2, 'lobby').st;
    expect(st.bpm).toBe(BPM_LOBBY);
    const r = advance(st, 2.025, 0.1, 'game');
    expect(r.state.bpm).toBe(BPM_GAME);
    expect(r.notes[0]!.note.voice).toBe('bass'); // step 0 starts with the bass
  });
  it('the loop wraps after 72 eighths', () => {
    const st: Sched = { ...newSched(0), mode: 'game', step: LOOP_STEPS - 1, nextTime: 0 };
    expect(advance(st, 0, 0.1, 'game').state.step).toBe(0);
  });
  it('results play once and stop', () => {
    const { st } = run(newSched(0), 0, 12, 'results');
    expect(st.step).toBe(RESULTS_STEPS);
    expect(run(st, 12.025, 20, 'results').n).toBe(0);
  });
  it('a stall (hidden tab) does not flood the past', () => {
    const r = advance(run(newSched(0), 0, 1, 'game').st, 30, 0.1, 'game');
    for (const n of r.notes) expect(n.at).toBeGreaterThanOrEqual(30);
  });
});
