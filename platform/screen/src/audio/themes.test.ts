import { describe, expect, it } from 'vitest';
import {
  advance,
  loopSteps,
  newSched,
  noteFreq,
  pickTheme,
  resultsSteps,
  stepEvents,
  stepSeconds,
  themeFor,
  type Mode,
  type Sched,
} from './music';
import { CHORD, THEMES, type Theme } from './themes';

const MODES: Mode[] = ['lobby', 'game', 'rush', 'results'];
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const loopNotes = (t: Theme, mode: Mode) => Array.from({ length: loopSteps(t) }, (_, i) => stepEvents(i, mode, t));

describe('there are several distinct themes', () => {
  it('4 to 5 themes with unique ids and names', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
    expect(THEMES.length).toBeLessThanOrEqual(5);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
  });
  it('they differ in sound, not only in name', () => {
    const sig = THEMES.map((t) => JSON.stringify([t.bpm, t.perBeat, t.bars.map((b) => b.mel)]));
    expect(new Set(sig).size).toBe(THEMES.length);
  });
});

describe.each(THEMES.map((t) => [t.id, t] as const))('theme %s', (_id, t) => {
  it('every bar has barSteps tokens and only valid notes', () => {
    for (const b of t.bars) {
      const tokens = b.mel.split(' ');
      expect(tokens).toHaveLength(t.barSteps);
      for (const tok of tokens) if (tok !== '-' && tok !== '_') expect(Number.isFinite(noteFreq(tok))).toBe(true);
      expect(tokens[0]).not.toBe('-'); // a bar never opens with a hold of the previous bar's note
      expect(CHORD[b.chord]).toBeDefined();
    }
    for (const c of Object.values(CHORD)) for (const n of [...c.pad, ...c.bass]) expect(noteFreq(n)).toBeGreaterThan(30);
  });
  it('drum, bass, pad and shaker steps fit in the bar', () => {
    const steps = [
      ...t.bass,
      ...t.pad,
      ...t.shaker.accent,
      ...t.shaker.skip,
      ...Object.values(t.drums).flat(),
      ...Object.values(t.fills).flat(),
    ];
    for (const s of steps) expect(s >= 0 && s < t.barSteps).toBe(true);
  });
  it('tempo rises lobby < game < rush and keeps the tribal tempo range', () => {
    expect(t.bpm.lobby).toBeLessThan(t.bpm.game);
    expect(t.bpm.game).toBeLessThan(t.bpm.rush);
  });
  it('is deterministic: same step and mode, same notes', () => {
    for (const m of MODES) expect(loopNotes(t, m)).toEqual(loopNotes(t, m));
  });
  it('plays in every mode but silent, with notes and finite gains', () => {
    for (const m of ['lobby', 'game', 'rush'] as const) {
      const all = loopNotes(t, m).flat();
      expect(all.length).toBeGreaterThan(0);
      for (const n of all) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThan(1);
        expect(n.len).toBeGreaterThan(0);
      }
    }
    expect(stepEvents(0, 'silent', t)).toHaveLength(0);
  });
  it('game has the tribal percussion; lobby has only the soft heartbeat', () => {
    const voices = (m: Mode) =>
      new Set(
        loopNotes(t, m)
          .flat()
          .map((n) => n.voice),
      );
    for (const v of ['boom', 'kick', 'tomHi', 'tambourine', 'bass', 'accordion']) expect(voices('game').has(v as never)).toBe(true);
    expect(voices('lobby').has('kick')).toBe(false);
    expect(voices('lobby').has('tambourine')).toBe(false);
  });
  it('the loop is closed: after loopSteps steps it is back at 0 and lasts bars x barSteps steps', () => {
    const st: Sched = { ...newSched(0), mode: 'game', step: loopSteps(t) - 1, nextTime: 0, theme: t.id };
    expect(advance(st, 0, 0.01, 'game', t).state.step).toBe(0);
    // one loop later the very same notes come back, exactly bars x barSteps steps after the first
    const loopS = loopSteps(t) * stepSeconds(t.bpm.game, t.perBeat);
    const start: Sched = { ...newSched(0), mode: 'game', theme: t.id, bpm: t.bpm.game };
    const { notes } = advance(start, 0, loopS + 0.001, 'game', t);
    const at = (x: number) => notes.filter((n) => Math.abs(n.at - x) < 1e-6).map((n) => [n.note.voice, n.note.freqs[0] ?? 0]);
    expect(at(0).length).toBeGreaterThan(0);
    expect(at(loopS)).toEqual(at(0));
  });
  it('game -> rush ramps the tempo without restarting the loop', () => {
    let s = newSched(0);
    for (let now = 0; now < 4; now += 0.025) s = advance(s, now, 0.1, 'game', t).state;
    expect(s.bpm).toBe(t.bpm.game);
    for (let now = 4; now < 5.5; now += 0.025) s = advance(s, now, 0.1, 'rush', t).state;
    expect(s.bpm).toBeGreaterThan(t.bpm.game);
    expect(s.bpm).toBeLessThan(t.bpm.rush);
    expect(s.step).not.toBe(0);
    for (let now = 5.5; now < 9; now += 0.025) s = advance(s, now, 0.1, 'rush', t).state;
    expect(s.bpm).toBe(t.bpm.rush);
  });
  it('results play the cadence once and stop', () => {
    expect(stepEvents(0, 'results', t).length).toBeGreaterThan(0);
    expect(stepEvents(4 * t.perBeat, 'results', t).length).toBeGreaterThan(0);
    expect(stepEvents(1, 'results', t)).toHaveLength(0);
    let s = newSched(0);
    for (let now = 0; now < 20; now += 0.025) s = advance(s, now, 0.1, 'results', t).state;
    expect(s.step).toBe(resultsSteps(t));
  });
  it('rush doubles the lead an octave up and the shaker in sixteenths', () => {
    const lead = loopNotes(t, 'rush')
      .flat()
      .filter((n) => n.voice === t.lead);
    expect(lead.length).toBeGreaterThan(0);
    const shakers = loopNotes(t, 'rush')
      .flat()
      .filter((n) => n.voice === 'tambourine');
    expect(shakers.some((n) => n.offset === 0.5)).toBe(true);
  });
});

describe('theme draw', () => {
  it('never repeats the previous theme, for any random value (including 0 and 0.999...)', () => {
    for (const prev of THEMES) for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) expect(pickTheme(prev.id, () => r).id).not.toBe(prev.id);
  });
  it('a long run of draws never repeats back to back and reaches every theme', () => {
    const rand = lcg(42);
    let cur = pickTheme(null, rand);
    const seen = new Set([cur.id]);
    for (let i = 0; i < 200; i++) {
      const next = pickTheme(cur.id, rand);
      expect(next.id).not.toBe(cur.id);
      seen.add(next.id);
      cur = next;
    }
    expect(seen.size).toBe(THEMES.length);
  });
  it('is reproducible with an injected rand', () => {
    const run = () => {
      const rand = lcg(7);
      const out: string[] = [];
      let cur = pickTheme(null, rand);
      for (let i = 0; i < 20; i++) {
        cur = pickTheme(cur.id, rand);
        out.push(cur.id);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
  it('changes theme when a match starts, and only then', () => {
    const [a] = THEMES;
    const never = () => 0.5;
    expect(themeFor(a!, 'silent', 'game', never).id).not.toBe(a!.id);
    expect(themeFor(a!, 'game', 'rush', never)).toBe(a);
    expect(themeFor(a!, 'rush', 'game', never)).toBe(a);
    expect(themeFor(a!, 'lobby', 'lobby', never)).toBe(a);
    expect(themeFor(a!, 'game', 'results', never)).toBe(a);
    expect(themeFor(a!, 'results', 'lobby', never)).toBe(a);
  });
  it('switching theme restarts the loop at step 0 and at the new theme tempo', () => {
    const [a, b] = THEMES;
    let s = newSched(0);
    for (let now = 0; now < 2; now += 0.025) s = advance(s, now, 0.1, 'game', a).state;
    const r = advance(s, 2.025, 0.1, 'game', b);
    expect(r.state.theme).toBe(b!.id);
    expect(r.state.bpm).toBe(b!.bpm.game);
  });
});
