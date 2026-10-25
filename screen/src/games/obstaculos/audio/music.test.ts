import { describe, expect, it } from 'vitest';
import { BIOMES, type Biome } from '@party/shared/obstaculos';
import {
  LOOP_STEPS,
  MUSIC,
  TEMPO_BOOST,
  advance,
  bpmFor,
  layersFor,
  newSched,
  noteVoices,
  stepNotes,
  tensionOf,
  type Layer,
  type MusicState,
} from './music';
import { SCALES, midiFreq } from './scales';

const calm = (biome: Biome = 'beach'): MusicState => ({
  biome,
  playing: true,
  progress: 0,
  danger: 0,
  stragglers: 0,
  moving: false,
  checkpointed: false,
  maxRopeTension: 0,
  lavaNear: false,
});
const ALL: Layer[] = ['base', 'rhythm', 'melody', 'drone'];
const loop = (b: Biome, layers: Layer[], tension: number) =>
  Array.from({ length: LOOP_STEPS }, (_, s) => stepNotes(s, b, layers, tension)).flat();

describe('biome identity', () => {
  it('BPMs follow the plan: 104 92 118 80 128', () => {
    expect(BIOMES.map((b) => MUSIC[b].bpm)).toEqual([104, 92, 118, 80, 128]);
  });
  it('timbres per biome', () => {
    expect([MUSIC.beach.bass, MUSIC.beach.lead]).toEqual(['ukulele', 'steel']);
    expect([MUSIC.forest.bass, MUSIC.forest.lead]).toEqual(['marimba', 'flute']);
    expect([MUSIC.mine.lead, MUSIC.mine.bass]).toEqual(['hammer', 'sqbass']);
    expect([MUSIC.glacier.lead, MUSIC.glacier.chord]).toEqual(['bell', 'pad']);
    expect([MUSIC.volcano.perc, MUSIC.volcano.bass]).toEqual(['tom', 'satbass']);
  });
  it('every melody is 32 steps long and every melody note is a pitch of the biome scale', () => {
    for (const b of BIOMES) {
      expect(MUSIC[b].melody.length).toBe(LOOP_STEPS);
      const pcs = new Set(SCALES[b].semis.map((s) => (SCALES[b].rootMidi + s) % 12));
      for (const n of loop(b, ['melody'], 0)) {
        const midi = Math.round(69 + 12 * Math.log2(n.freqs[0]! / 440));
        expect(pcs.has(midi % 12), `${b} ${n.freqs[0]}`).toBe(true);
      }
    }
  });
  it('bass and chords stay in the scale too', () => {
    for (const b of BIOMES) {
      const pcs = new Set(SCALES[b].semis.map((s) => (SCALES[b].rootMidi + s) % 12));
      for (const n of loop(b, ['base'], 0))
        for (const f of n.freqs) expect(pcs.has(Math.round(69 + 12 * Math.log2(f / 440)) % 12)).toBe(true);
      expect(midiFreq(SCALES[b].rootMidi)).toBeGreaterThan(100);
    }
  });
});

describe('tension and layers', () => {
  it('tension is 0 when calm, 1 when everything is at the limit, and grows with each ingredient', () => {
    expect(tensionOf(calm())).toBe(0);
    expect(tensionOf({ ...calm(), progress: 1, danger: 1, stragglers: 1 })).toBe(1);
    expect(tensionOf({ ...calm(), progress: 0.5 })).toBeGreaterThan(tensionOf(calm()));
    expect(tensionOf({ ...calm(), danger: 0.5 })).toBeGreaterThan(tensionOf({ ...calm(), progress: 0.5 }) - 0.001);
    expect(tensionOf({ ...calm(), stragglers: 1 })).toBeGreaterThan(0);
    expect(tensionOf({ ...calm(), progress: 5, danger: 5, stragglers: 5 })).toBe(1);
  });
  it('tempo rises 15% from calm to full tension', () => {
    expect(bpmFor('volcano', 0)).toBe(128);
    expect(bpmFor('volcano', 1)).toBeCloseTo(128 * (1 + TEMPO_BOOST));
    expect(bpmFor('glacier', 0.5)).toBeGreaterThan(bpmFor('glacier', 0.2));
  });
  it('layers: base always; rhythm moving; melody after checkpoint; drone over 0.85 rope tension or lava', () => {
    expect(layersFor(calm())).toEqual(['base']);
    expect(layersFor({ ...calm(), moving: true })).toEqual(['base', 'rhythm']);
    expect(layersFor({ ...calm(), checkpointed: true })).toEqual(['base', 'melody']);
    expect(layersFor({ ...calm(), maxRopeTension: 0.85 })).toEqual(['base']);
    expect(layersFor({ ...calm(), maxRopeTension: 0.86 })).toEqual(['base', 'drone']);
    expect(layersFor({ ...calm(), lavaNear: true })).toEqual(['base', 'drone']);
    expect(layersFor({ ...calm(), playing: false, moving: true })).toEqual([]);
  });
  it('each layer only emits its own notes and the notes of a layer appear only when it is on', () => {
    for (const b of BIOMES)
      for (const l of ALL) {
        const notes = loop(b, [l], 0.9);
        expect(notes.length, `${b} ${l}`).toBeGreaterThan(0);
        expect(new Set(notes.map((n) => n.layer))).toEqual(new Set([l]));
      }
    expect(loop('beach', [], 1)).toEqual([]);
  });
  it('tension adds hits: sixteenth ticks from 0.6, an octave on the melody from 0.8', () => {
    const count = (t: number, l: Layer) => loop('beach', [l], t).length;
    expect(count(0.7, 'rhythm')).toBeGreaterThan(count(0.5, 'rhythm'));
    expect(count(0.9, 'melody')).toBeGreaterThan(count(0.7, 'melody'));
    expect(count(0.5, 'melody')).toBe(count(0, 'melody'));
  });
  it('the drone is a fifth on the low root, sounding once per 16 steps', () => {
    const d = loop('mine', ['drone'], 0);
    expect(d.length).toBe(2);
    expect(d[0]!.freqs[1]! / d[0]!.freqs[0]!).toBeCloseTo(2 ** (7 / 12));
  });
});

describe('scheduler', () => {
  const run = (st: MusicState, secs: number) => advance(newSched(0), 0, secs, st);
  it('is silent when not playing, and plays when playing', () => {
    expect(run({ ...calm(), playing: false }, 5).notes).toEqual([]);
    expect(run(calm(), 5).notes.length).toBeGreaterThan(5);
  });
  it('a loop of 32 eighths lasts 32 * 60 / (2 bpm) seconds', () => {
    const r = run({ ...calm('forest') }, 100);
    const loopS = (32 * 60) / (2 * 92);
    const chords = r.notes.filter((n) => n.note.timbre === 'marimba' && n.note.freqs.length === 3).map((n) => n.at);
    expect(chords[4]! - chords[0]!).toBeCloseTo(loopS, 5); // one chord per bar, 4 bars per loop
  });
  it('higher tension schedules notes closer together (faster)', () => {
    const a = run({ ...calm(), moving: true }, 3).notes.length;
    const b = run({ ...calm(), moving: true, progress: 1, danger: 1, stragglers: 1 }, 3).notes.length;
    expect(b).toBeGreaterThan(a);
  });
  it('tempo glides to the new target instead of jumping, and a biome change restarts the loop', () => {
    let s = advance(newSched(0), 0, 0.1, calm()).state;
    const hot = { ...calm(), progress: 1, danger: 1, stragglers: 1 };
    const r1 = advance(s, 0.5, 0.1, hot);
    expect(r1.state.bpm).toBeGreaterThan(s.bpm);
    expect(r1.state.bpm).toBeLessThan(bpmFor('beach', 1));
    const r2 = advance(r1.state, 0.6, 0.1, { ...hot, biome: 'volcano' });
    expect(r2.state.step).toBeLessThanOrEqual(1);
    expect(r2.state.bpm).toBeCloseTo(bpmFor('volcano', 1));
    s = r2.state;
  });
  it('never schedules in the past after a stall', () => {
    const s = advance(newSched(0), 0, 0.1, calm()).state;
    const r = advance(s, 10, 0.1, calm());
    expect(Math.min(...r.notes.map((n) => n.at))).toBeGreaterThanOrEqual(10);
  });
});

describe('note voices', () => {
  it('every timbre makes finite, positive voices', () => {
    for (const b of BIOMES)
      for (const n of loop(b, ALL, 1)) {
        for (const v of noteVoices(n, 0.2)) {
          expect(v.gain).toBeGreaterThan(0);
          expect(v.dur).toBeGreaterThan(0);
          expect(Number.isFinite(v.f0 ?? 1)).toBe(true);
        }
      }
  });
});
