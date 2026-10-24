import { describe, expect, it } from 'vitest';
import { BIOMES, MAX_FALL, type Biome, type ObstEvents } from '@party/shared/obstaculos';
import { HANDLERS, cueDuration, cuesFor, voicesFor, type Cue } from './recipes';
import { degreeFreq, slotFreq } from './scales';

const SAMPLE: { [K in keyof ObstEvents]: ObstEvents[K] } = {
  'obst.jump': { player: 2, kind: 'ground' },
  'obst.land': { player: 1, impact: 600, on: 'ground' },
  'obst.ropeTaut': { rope: 0, link: 1, tension: 1.05 },
  'obst.ropeStrain': { rope: 0, link: 1, tension: 1.4 },
  'obst.grab': { player: 0, target: 'ring', targetId: 1 },
  'obst.release': { player: 0 },
  'obst.throw': { player: 0, target: 1, vx: 500, vy: -600 },
  'obst.handCatch': { player: 0, target: 1 },
  'obst.death': { player: 0, cause: 'spikes' },
  'obst.bubble': { player: 0, reason: 'offscreen' },
  'obst.respawn': { player: 0, via: 'checkpoint' },
  'obst.checkpoint': { player: 0, index: 1 },
  'obst.star': { player: 0, index: 1, streak: 1 },
  'obst.plate': { id: 'p1', pressed: true, weight: 2 },
  'obst.gate': { id: 'g1', open: true },
  'obst.goalEnter': { player: 0, inside: 1, total: 4 },
  'obst.levelClear': { level: 'b1', timeSec: 60, medal: 'gold', stars: 3, deaths: 0 },
  'obst.runEnd': { score: 10, levels: 3, reason: 'complete' },
};
const first = <K extends keyof ObstEvents>(n: K, p: ObstEvents[K], b: Biome = 'beach') => cuesFor(n, p, b)[0]!;
const gainSum = (c: Cue) => voicesFor(c).reduce((s, v) => s + v.gain, 0);

describe('event -> cue selection', () => {
  it('every obst.* event produces at least one cue with a sane sound, in every biome', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(Object.keys(HANDLERS).sort());
    for (const b of BIOMES) for (const n of Object.keys(SAMPLE) as (keyof ObstEvents)[]) {
      const cues = cuesFor(n, SAMPLE[n] as never, b);
      expect(cues.length, n).toBeGreaterThan(0);
      for (const c of cues) {
        const v = voicesFor(c);
        expect(v.length, `${n} ${c.recipe}`).toBeGreaterThan(0);
        expect(cueDuration(c)).toBeGreaterThan(0.02);
        expect(cueDuration(c)).toBeLessThan(3);
        for (const x of v) { expect(x.gain).toBeGreaterThan(0); expect(x.gain).toBeLessThanOrEqual(0.5); expect(x.dur).toBeGreaterThan(0); }
      }
    }
  });
  it('jump plays the player note on the biome scale, glides +7 semitones in 90 ms and falls by 210 ms', () => {
    const v = voicesFor(first('obst.jump', { player: 3, kind: 'ground' }, 'forest'))[0]!;
    expect(v.src).toBe('triangle');
    expect(v.f0).toBeCloseTo(slotFreq('forest', 3));
    expect(v.f1! / v.f0!).toBeCloseTo(2 ** (7 / 12));
    expect(v.glide).toBeCloseTo(0.09);
    expect(v.dur).toBeCloseTo(0.21);
  });
  it('8 simultaneous jumps are 8 different notes (a chord)', () => {
    const f = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => voicesFor(first('obst.jump', { player: p, kind: 'ground' }))[0]!.f0);
    expect(new Set(f).size).toBe(8);
  });
  it('trampoline jumps use the spring sound, rope jumps add a string', () => {
    expect(first('obst.jump', { player: 0, kind: 'trampoline' }).recipe).toBe('boing');
    expect(voicesFor(first('obst.jump', { player: 0, kind: 'rope' })).some((v) => v.src === 'pluck')).toBe(true);
    expect(voicesFor(first('obst.jump', { player: 0, kind: 'ground' })).some((v) => v.src === 'pluck')).toBe(false);
  });
  it('landing: silent when gentle, surface filter by biome and platform, gain proportional to impact squared, 40-80 ms', () => {
    expect(cuesFor('obst.land', { player: 0, impact: 119, on: 'ground' }, 'beach')).toEqual([]);
    expect(cuesFor('obst.land', { player: 0, impact: 120, on: 'ground' }, 'beach').length).toBe(1);
    const f = (b: (typeof BIOMES)[number], on: 'ground' | 'oneWay' | 'head') => voicesFor(first('obst.land', { player: 0, impact: 700, on }, b))[0]!.filter!;
    expect(f('beach', 'ground')).toMatchObject({ type: 'bandpass', f0: 900 });
    expect(f('forest', 'ground').f0).toBe(400);
    expect(f('mine', 'ground')).toMatchObject({ f0: 2400, q: 8 });
    expect(f('beach', 'oneWay').f0).toBe(400);
    expect(f('beach', 'head').f0).toBeLessThan(300);
    const at = (impact: number) => voicesFor(first('obst.land', { player: 0, impact, on: 'ground' }, 'beach'))[0]!;
    const g = (impact: number) => at(impact).gain - 0.04; // 0.04 is the audibility floor
    const lo = MAX_FALL / 4, hi = MAX_FALL / 2;
    expect(g(hi) / g(lo)).toBeCloseTo(4, 1);
    expect(at(120).dur).toBeGreaterThanOrEqual(0.04);
    expect(at(MAX_FALL * 2).dur).toBeLessThanOrEqual(0.0801);
  });
  it('rope: taut is a Karplus-Strong string at 110-220 Hz (feedback 0.985), strain is two saws 55 / 55.7 Hz under a 300-900 Hz bandpass', () => {
    const t = voicesFor(first('obst.ropeTaut', { rope: 0, link: 0, tension: 1 }))[0]!;
    expect(t).toMatchObject({ src: 'pluck', f0: 110, ks: 0.985 });
    expect(voicesFor(first('obst.ropeTaut', { rope: 0, link: 0, tension: 1.6 }))[0]!.f0).toBe(220);
    const s = voicesFor(first('obst.ropeStrain', { rope: 0, link: 0, tension: 1 }));
    expect(s.map((v) => v.f0)).toEqual([55, 55.7]);
    expect(s[0]!.filter!.f0).toBe(300);
    expect(voicesFor(first('obst.ropeStrain', { rope: 0, link: 0, tension: 1.6 }))[0]!.filter!.f0).toBe(900);
    expect(gainSum(first('obst.ropeStrain', { rope: 0, link: 0, tension: 1.6 }))).toBeGreaterThan(gainSum(first('obst.ropeStrain', { rope: 0, link: 0, tension: 1 })));
  });
  it('ring grab is FM 880 Hz, ratio 3.5, index 4 -> 0 in 150 ms', () => {
    expect(voicesFor(first('obst.grab', { player: 0, target: 'ring', targetId: 0 }))[0]).toMatchObject({ src: 'fm', f0: 880, fm: { ratio: 3.5, i0: 4, i1: 0, t: 0.15 } });
    expect(first('obst.grab', { player: 0, target: 'lever', targetId: 0 }).recipe).toBe('grabLever');
  });
  it('death is a sine 600 -> 80 Hz in 180 ms; bubble wobbles at 6 Hz around 300 Hz', () => {
    expect(voicesFor(first('obst.death', { player: 0, cause: 'fall' }))[0]).toMatchObject({ src: 'sine', f0: 600, f1: 80, dur: 0.18 });
    expect(voicesFor(first('obst.bubble', { player: 0, reason: 'stray' }))[0]).toMatchObject({ f0: 300, vib: { rate: 6 } });
    expect(first('obst.death', { player: 0, cause: 'liquid' }).p.variant).toBe('liquid');
    expect(voicesFor(first('obst.death', { player: 0, cause: 'liquid' })).length).toBeGreaterThan(1);
  });
  it('checkpoint is the arpeggio I-III-V-VIII, one octave up, and ducks the music', () => {
    const c = first('obst.checkpoint', { player: 0, index: 0 }, 'mine');
    expect(c.p.notes).toEqual([1, 3, 5, 8].map((d) => degreeFreq('mine', d, 1)));
    expect(c.duck).toBe(true);
    const at = voicesFor(c).filter((v) => v.src === 'triangle').map((v) => v.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
  it('star: bell with the 2.76 partial, one degree higher per consecutive star', () => {
    const f = (streak: number) => voicesFor(first('obst.star', { player: 0, index: 0, streak }))[0]!.f0!;
    expect(f(2)).toBeGreaterThan(f(1));
    expect(f(3)).toBeGreaterThan(f(2));
    expect(voicesFor(first('obst.star', { player: 0, index: 0, streak: 1 }))[1]!.f0! / f(1)).toBeCloseTo(2.76);
  });
  it('goal: each player adds their note; the fanfare comes only with everybody inside', () => {
    expect(cuesFor('obst.goalEnter', { player: 2, inside: 2, total: 4 }, 'beach').map((c) => c.recipe)).toEqual(['goalEnter']);
    expect(first('obst.goalEnter', { player: 2, inside: 2, total: 4 }).p.freq).toBeCloseTo(slotFreq('beach', 2));
    expect(cuesFor('obst.goalEnter', { player: 2, inside: 4, total: 4 }, 'beach').map((c) => c.recipe)).toEqual(['goalEnter', 'fanfare']);
  });
  it('level clear: the better the medal, the longer the fanfare', () => {
    const len = (medal: 'gold' | 'silver' | 'bronze') => first('obst.levelClear', { level: 'x', timeSec: 1, medal, stars: 1, deaths: 0 }).p.notes!.length;
    expect([len('bronze'), len('silver'), len('gold')]).toEqual([3, 4, 5]);
  });
  it('run end: win and fail are different sounds', () => {
    expect(first('obst.runEnd', { score: 1, levels: 1, reason: 'complete' }).recipe).toBe('runWin');
    expect(first('obst.runEnd', { score: 1, levels: 1, reason: 'failed' }).recipe).toBe('runFail');
  });
  it('plate and gate differ by direction', () => {
    expect(first('obst.plate', { id: 'a', pressed: true, weight: 1 }).p.variant).toBe('down');
    expect(first('obst.plate', { id: 'a', pressed: false, weight: 1 }).p.variant).toBe('up');
    expect(first('obst.gate', { id: 'a', open: true }).p.variant).toBe('open');
    expect(first('obst.gate', { id: 'a', open: false }).p.variant).toBe('shut');
  });
  it('priorities: death and finales outrank jumps, which outrank release', () => {
    expect(first('obst.death', { player: 0, cause: 'fall' }).priority).toBe(3);
    expect(first('obst.jump', { player: 0, kind: 'ground' }).priority).toBe(2);
    expect(first('obst.release', { player: 0 }).priority).toBe(0);
    expect(first('obst.bubble', { player: 0, reason: 'rope' }).priority).toBe(1);
  });
});
